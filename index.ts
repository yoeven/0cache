import { DB } from "./dzero";
import pako from "pako";

type Callback = (...args: any[]) => Promise<any>;

const ttl = {
  MONTH: 2629746,
  WEEK: 604800,
};

const checkIsJSONObject = (value: any) => Object.prototype.toString.call(value) === "[object Object]" && !Array.isArray(value);

const ZeroCache = (config: {
  dzero_token: string;
  debug?: boolean;
}) => {
  const db = DB("https://db.dzero.dev", {
    token: config?.dzero_token || process.env.DZERO_TOKEN!,
  });

  const cache = <T extends Callback>(
    cb: T,
    tags?: string[],
    options?: {
      revalidate?: number;
      waitUntil?: (p: Promise<any>) => void | undefined;
      parser?: (data: string) => Awaited<ReturnType<T>>;
      shouldCache?: (data: Awaited<ReturnType<T>>) => boolean;
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

    const key = `${cb.toString()}_${tagString}_${JSON.stringify(options)}`;
    const storeKey = key.replaceAll(/\s/g, "");

    return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
      let cbResult: Awaited<ReturnType<T>> | undefined = undefined;
      try {
        config?.debug && console.log("storeKey", storeKey);
        const cacheRetrievalStartTime = new Date().getTime();
        let cacheData = await db.query(`select * from cache where key = $1`, [storeKey], "all");

        cacheData = cacheData?.results?.[0];
        const cacheRetrievalEndTime = new Date().getTime();
        const cacheRetrievalTimeTakenSeconds = (cacheRetrievalEndTime - cacheRetrievalStartTime) / 1000;
        config?.debug && console.log(`cache retrieval took ${cacheRetrievalTimeTakenSeconds}s`);

        if (cacheData?.data) {
          if (cacheData.ttl < new Date().getTime()) {
            config?.debug && console.log("cache expired");
            const DeletePromise = db.query(`delete from cache where key = $1`, [storeKey]);
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

        config?.debug && console.log("cb result size MB:", cbResultSizeMB);
        if (isAcceptableFormat && cbResultSizeMB <= 4 && (options?.shouldCache ? options.shouldCache(cbResult as Awaited<ReturnType<T>>) : true)) {
          const compressed = pako.deflate(JSON.stringify(cbResult));

          const InsertPromise = db.query(`insert into cache (key, data, tags, ttl) values ($1, $2, $3, $4);`, [
            storeKey,
            Buffer.from(compressed).toString("binary"),
            tagString,
            new Date().getTime() + (options?.revalidate || ttl.WEEK),
          ]);

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

  const invalidateByTag = async (tag: string[]) => {
    await db.query(`DELETE FROM cache WHERE ${tag.map((t) => `instr(tags, '${t}') > 0`).join(" AND ")};`);
  };

  const clearCache = async () => {
    await db.query(`DELETE FROM cache`);
  };

  return {
    cache,
    invalidateByTag,
    clearCache,
  };
};

export { ZeroCache };
