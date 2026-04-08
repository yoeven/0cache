import type { DBAdapter } from "./adaptors/type";
import pako from "pako";
import { createHash } from "crypto";
import { postgresAdapter, postgres } from "./adaptors/postgressql";

type Callback = (...args: any[]) => any;

const hashBinary = (buf: Buffer): string => `__bin_${buf.byteLength}_${createHash("sha256").update(buf).digest("hex")}`;

const processValueForKey = async (value: any): Promise<any> => {
  if (value === null || value === undefined) return value;

  if (typeof value === "bigint") {
    return value.toString();
  }

  if (typeof value === "number") {
    if (Number.isNaN(value)) return "__NaN__";
    if (!Number.isFinite(value)) return `__Inf_${value > 0 ? "+" : "-"}__`;
    return value;
  }

  if (typeof value === "symbol") {
    return `__symbol_${value.toString()}__`;
  }

  if (Buffer.isBuffer(value)) {
    return hashBinary(value);
  }

  if (value instanceof ArrayBuffer) {
    return hashBinary(Buffer.from(value));
  }

  if (ArrayBuffer.isView(value)) {
    return hashBinary(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }

  if (typeof Blob !== "undefined" && value instanceof Blob) {
    return hashBinary(Buffer.from(await value.arrayBuffer()));
  }

  if (value instanceof RegExp) {
    return `__regexp_${value.toString()}__`;
  }

  if (value instanceof Map) {
    const entries: Record<string, any> = {};
    for (const [k, v] of value.entries()) {
      entries[String(k)] = await processValueForKey(v);
    }
    return `__map_${JSON.stringify(entries)}__`;
  }

  if (value instanceof Set) {
    const items = await Promise.all(Array.from(value).map(processValueForKey));
    return `__set_${JSON.stringify(items)}__`;
  }

  if (Array.isArray(value)) {
    return Promise.all(value.map(processValueForKey));
  }

  if (typeof value === "object") {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = await processValueForKey(v);
    }
    return result;
  }

  return value;
};

const serializeArgs = async (args: any[]): Promise<string> => {
  const processed = await Promise.all(args.map(processValueForKey));
  return JSON.stringify(processed);
};

const ttl = {
  MONTH: 2629746,
  WEEK: 604800,
};

const checkIsJSONObject = (value: any) => Object.prototype.toString.call(value) === "[object Object]" && !Array.isArray(value);

type ZeroCacheConfig = {
  dbAdapter: DBAdapter;
  debug?: boolean;
  maxSizeMB?: number;
};

const ZeroCache = (config: ZeroCacheConfig) => {
  const db = config.dbAdapter;

  const cache = <T extends Callback>(
    cb: T,
    options?: {
      effects?: (string | any)[];
      tags?: string[];
      revalidate?: number;
      waitUntil?: (p: Promise<any>) => void | undefined;
      parser?: (data: string) => Awaited<ReturnType<T>>;
      shouldCache?: (data: Awaited<ReturnType<T>>) => boolean;
      maxSizeMB?: number;
      enable?: boolean;
      debug?: boolean;
    }
  ) => {
    const { tags } = options || {};
    if (tags?.length) {
      if (tags.length > 10) {
        throw new Error("Maximum of 10 tags");
      }

      if (tags.join("")?.length > 1000) {
        throw new Error("Maximum of 1000 characters for tags");
      }
    }

    if (options?.revalidate) {
      if (options.revalidate <= 0) {
        throw new Error("revalidate must be greater than 0");
      }

      if (options.revalidate > ttl.MONTH) {
        throw new Error("revalidate must be less than a month");
      }
    }

    const _tags = tags?.length ? [...new Set(tags)] : [];
    const tagString = _tags.map((t) => `'${t}'`).join(",");

    return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
      let cbResult: Awaited<ReturnType<T>> | undefined = undefined;
      const _debug = options?.debug ?? config?.debug ?? false;
      try {
        if (options?.enable === false) {
          _debug && console.log("cache disabled");
          return (await cb(...args)) as Awaited<ReturnType<T>>;
        }

        // console.log("args", args);

        const serializedArgs = await serializeArgs(args);
        const serializedEffects = await serializeArgs(options?.effects || []);
        const cacheOptions = { ...options, debug: undefined, effects: undefined };
        const key = `${cb.toString()}${serializedArgs}${serializedEffects}${JSON.stringify(cacheOptions)}`.replaceAll(/\s/g, "");

        // _debug && console.log("key", key);

        const sha256Key = createHash("sha256").update(key).digest("hex");
        const storeKey = sha256Key;

        // _debug && console.log("storeKey", storeKey);

        const cacheRetrievalStartTime = new Date().getTime();
        const cacheData = await db.getCacheByKey(storeKey);

        _debug && console.log("cacheData", cacheData);

        const cacheRetrievalEndTime = new Date().getTime();
        const cacheRetrievalTimeTakenSeconds = (cacheRetrievalEndTime - cacheRetrievalStartTime) / 1000;
        _debug && console.log(`cache retrieval took ${cacheRetrievalTimeTakenSeconds}s`);

        if (cacheData?.data) {
          if (cacheData.ttl < Math.floor(Date.now() / 1000)) {
            _debug && console.log("cache expired");
            const DeletePromise = db.deleteCacheByKey(storeKey);
            if (options?.waitUntil) {
              options.waitUntil(DeletePromise);
            } else {
              await DeletePromise;
            }
          } else {
            _debug && console.log("cache hit");
            const decompressed = pako.inflate(cacheData.data, { to: "string" });
            return options?.parser ? options.parser(decompressed) : JSON.parse(decompressed);
          }
        }

        _debug && console.log("cache miss");
        cbResult = await cb(...args);
        const isAcceptableFormat =
          checkIsJSONObject(cbResult) ||
          Array.isArray(cbResult) ||
          typeof cbResult === "string" ||
          typeof cbResult === "number" ||
          typeof cbResult === "boolean";

        _debug && console.log("is acceptable format: ", isAcceptableFormat);

        const cbResultSizeMB = Buffer.byteLength(JSON.stringify(cbResult)) / 1024 / 1024;

        const maxSize = options?.maxSizeMB ?? config?.maxSizeMB ?? 4;

        _debug && console.log("cb result size MB:", cbResultSizeMB);
        if (
          isAcceptableFormat &&
          cbResultSizeMB <= maxSize &&
          (options?.shouldCache ? options.shouldCache(cbResult as Awaited<ReturnType<T>>) : true)
        ) {
          const compressed = pako.deflate(JSON.stringify(cbResult));

          const InsertPromise = db.insertCache(
            storeKey,
            Buffer.from(compressed),
            tagString,
            Math.floor(Date.now() / 1000) + (options?.revalidate || ttl.WEEK)
          );

          if (options?.waitUntil) {
            options.waitUntil(InsertPromise);
          } else {
            await InsertPromise;
          }
        } else {
          _debug && console.log("caching condition not met");
        }

        return cbResult as Awaited<ReturnType<T>>;
      } catch (error: any) {
        _debug && console.error("cache failed:", error?.message || error);
        return cbResult ?? (await cb(...args));
      }
    };
  };

  const invalidateByTag = async (tags: string[]) => {
    await db.deleteCacheByTags(tags);
  };

  const clearCache = async () => {
    await db.clearAllCache();
  };

  return {
    cache,
    invalidateByTag,
    clearCache,
  };
};

export { ZeroCache, postgresAdapter, postgres, type DBAdapter, type ZeroCacheConfig };
