import { DB } from "./dzero";
import pako from "pako";

type Callback = (...args: any[]) => Promise<any>;

const altcache = (config: {
  dzero_token: string;
}) => {
  const db = DB("https://db.dzero.dev", {
    token: config?.dzero_token || process.env.DZERO_TOKEN!,
  });

  const cache = async <T extends Callback>(
    cb: T,
    tags?: string[],
    options?: {
      ttl?: number;
      waitUntil?: (p: Promise<any>) => void | undefined;
      parser?: (data: string) => Awaited<ReturnType<T>>;
      shouldCache?: (data: Awaited<ReturnType<T>>) => boolean;
    }
  ): Promise<Awaited<ReturnType<T>>> => {
    let cbResult: Awaited<ReturnType<T>> | undefined = undefined;
    try {
      if (tags?.length) {
        if (tags.length > 10) {
          throw new Error("Maximum of 10 tags");
        }

        if (tags.join("")?.length > 1000) {
          throw new Error("Maximum of 1000 characters for tags");
        }
      }
      tags = tags?.length ? [...new Set(tags)] : [];
      const tagString = tags.map((t) => `'${t}'`).join(",");

      const key = `${cb.toString()}_${tagString}_${JSON.stringify(options)}`;
      const storeKey = key.replaceAll(/\s/g, "");

      // const cacheRetrievalStartTime = new Date().getTime();
      let cacheData = await db.query(`select * from cache where key = $1`, [storeKey], "all");
      cacheData = cacheData?.results?.[0];
      // const cacheRetrievalEndTime = new Date().getTime();
      // const cacheRetrievalTimeTakenSeconds = (cacheRetrievalEndTime - cacheRetrievalStartTime) / 1000;
      // console.log(`cache retrieval took ${cacheRetrievalTimeTakenSeconds}s`);

      if (cacheData?.data) {
        if (cacheData.ttl < new Date().getTime()) {
          // console.log("cache expired");
          const DeletePromise = db.query(`delete from cache where key = $1`, [storeKey]);
          if (options?.waitUntil) {
            options.waitUntil(DeletePromise);
          } else {
            await DeletePromise;
          }
        } else {
          const decompressed = pako.inflate(Buffer.from(cacheData.data, "binary"), { to: "string" });
          return options?.parser ? options.parser(decompressed) : JSON.parse(decompressed);
        }
      }

      // console.log("cache miss");
      const taskStartTime = new Date().getTime();
      cbResult = await cb();

      const taskEndTime = new Date().getTime();
      const timeTakenSeconds = (taskEndTime - taskStartTime) / 1000;
      // console.log(`task took ${timeTakenSeconds}s`);

      const cbResultSizeMB = Buffer.byteLength(JSON.stringify(cbResult)) / 1024 / 1024;
      if (timeTakenSeconds > 1 && cbResultSizeMB <= 4 && (options?.shouldCache ? options.shouldCache(cbResult as Awaited<ReturnType<T>>) : true)) {
        const compressed = pako.deflate(JSON.stringify(cbResult));

        const InsertPromise = db.query(`insert into cache (key, data, tags, ttl) values ($1, $2, $3, $4);`, [
          storeKey,
          Buffer.from(compressed).toString("binary"),
          tagString,
          new Date().getTime() + (options?.ttl || 604800),
        ]);

        if (options?.waitUntil) {
          options.waitUntil(InsertPromise);
        } else {
          await InsertPromise;
        }
      }

      return cbResult as Awaited<ReturnType<T>>;
    } catch (error: any) {
      // console.log("cache failed");
      // console.error(error?.message || error);
      return cbResult || (await cb());
    }
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

export { altcache };
