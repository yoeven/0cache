import type { DZeroDB } from "./client";
import { DB } from "./client";

const dzeroAdapter = (db: DZeroDB) => {
  const getCacheByKey = async (full_key: string) => {
    let cacheData = await db.query(`select * from cache where key = $1`, [full_key], "all");
    return cacheData?.results?.[0];
  };

  const deleteCacheByKey = async (full_key: string) => {
    return await db.query(`delete from cache where key = $1`, [full_key]);
  };

  const insertCache = async (full_key: string, data: string, tagString: string, ttl: number) => {
    return await db.query(`insert into cache (key, data, tags, ttl) values ($1, $2, $3, $4);`, [full_key, data, tagString, ttl]);
  };

  const deleteCacheByTags = async (tags: string[]) => {
    return await db.query(`DELETE FROM cache WHERE ${tags.map((t) => `instr(tags, '${t}') > 0`).join(" AND ")};`);
  };

  const clearAllCache = async () => {
    await db.query(`DELETE FROM cache`);
  };

  return {
    getCacheByKey,
    deleteCacheByKey,
    insertCache,
    deleteCacheByTags,
    clearAllCache,
  };
};

export { dzeroAdapter, DB };
