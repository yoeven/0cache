import type { DBAdapter } from "./adaptors/type";
import pako from "pako";
import { dzeroAdapter, DB } from "./adaptors/dzero";
import { postgresAdapter, postgres } from "./adaptors/postgressql";

type Callback = (...args: any[]) => Promise<any>;

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
    tags?: string[],
    options?: {
      revalidate?: number;
      waitUntil?: (p: Promise<any>) => void | undefined;
      parser?: (data: string) => Awaited<ReturnType<T>>;
      shouldCache?: (data: Awaited<ReturnType<T>>) => boolean;
      maxSizeMB?: number;
    }
  ) => {
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
        throw new Error("revalidate must be less than 7 days");
      }
    }

    tags = tags?.length ? [...new Set(tags)] : [];
    const tagString = tags.map((t) => `'${t}'`).join(",");

    const key = `${cb.toString()}_${tagString}${options ? "_" + JSON.stringify(options) : ""}`;
    const storeKey = key.replaceAll(/\s/g, "");

    return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
      let cbResult: Awaited<ReturnType<T>> | undefined = undefined;
      try {
        config?.debug && console.log("storeKey", storeKey);
        const cacheRetrievalStartTime = new Date().getTime();
        const cacheData = await db.getCacheByKey(storeKey);

        config?.debug && console.log("cacheData", cacheData);

        const cacheRetrievalEndTime = new Date().getTime();
        const cacheRetrievalTimeTakenSeconds = (cacheRetrievalEndTime - cacheRetrievalStartTime) / 1000;
        config?.debug && console.log(`cache retrieval took ${cacheRetrievalTimeTakenSeconds}s`);

        if (cacheData?.data) {
          if (cacheData.ttl < new Date().getTime()) {
            config?.debug && console.log("cache expired");
            const DeletePromise = db.deleteCacheByKey(storeKey);
            if (options?.waitUntil) {
              options.waitUntil(DeletePromise);
            } else {
              await DeletePromise;
            }
          } else {
            config?.debug && console.log("cache hit");
            const decompressed = pako.inflate(Buffer.from(cacheData.data, "binary"), { to: "string" });
            return options?.parser ? options.parser(decompressed) : JSON.parse(decompressed);
          }
        }

        config?.debug && console.log("cache miss");
        cbResult = await cb(...args);
        const isAcceptableFormat =
          checkIsJSONObject(cbResult) || typeof cbResult === "string" || typeof cbResult === "number" || typeof cbResult === "boolean";
        config?.debug && console.log("is acceptable format: ", isAcceptableFormat);

        const cbResultSizeMB = Buffer.byteLength(JSON.stringify(cbResult)) / 1024 / 1024;

        const maxSize = options?.maxSizeMB ?? config?.maxSizeMB ?? 4;

        config?.debug && console.log("cb result size MB:", cbResultSizeMB);
        if (
          isAcceptableFormat &&
          cbResultSizeMB <= maxSize &&
          (options?.shouldCache ? options.shouldCache(cbResult as Awaited<ReturnType<T>>) : true)
        ) {
          const compressed = pako.deflate(JSON.stringify(cbResult));

          const InsertPromise = db.insertCache(
            storeKey,
            Buffer.from(compressed).toString("binary"),
            tagString,
            new Date().getTime() + (options?.revalidate || ttl.WEEK)
          );

          if (options?.waitUntil) {
            options.waitUntil(InsertPromise);
          } else {
            await InsertPromise;
          }
        } else {
          config?.debug && console.log("caching condition not met");
        }

        return cbResult as Awaited<ReturnType<T>>;
      } catch (error: any) {
        config?.debug && console.error("cache failed:", error?.message || error);
        return cbResult || (await cb(...args));
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

export { ZeroCache, dzeroAdapter, postgresAdapter, postgres, DB, type DBAdapter, type ZeroCacheConfig };
