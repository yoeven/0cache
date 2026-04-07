import postgres from "postgres";
import type { DBAdapter } from "./type";

function tagMatches(tag: string) {
  const escaped = tag.replace(/'/g, "''");
  return `strpos(tags, '''${escaped}''') > 0`;
}

/**
 * Cache table expected:
 * `key` (text), `data` (binary or text), `tags` (text), `ttl` (bigint or numeric).
 *
 * @example
 * ```ts
 * import postgres from "postgres";
 * import { sqlAdapter } from "0cache";
 *
 * const sql = postgres(process.env.DATABASE_URL!);
 * ZeroCache({ dbAdapter: sqlAdapter(sql) });
 * ```
 */
const postgresAdapter = (client: postgres.Sql): DBAdapter => {
  const getCacheByKey = async (full_key: string) => {
    const rows = await client`
      select * from zero_cache where key = ${full_key}
    `;
    return rows[0];
  };

  const deleteCacheByKey = async (full_key: string) => {
    return await client`
      delete from zero_cache where key = ${full_key}
    `;
  };

  const insertCache = async (full_key: string, data: string, tagString: string, ttl: number) => {
    return await client`
      insert into zero_cache (key, data, tags, ttl) values (${full_key}, ${data}, ${tagString}, ${ttl})
    `;
  };

  const deleteCacheByTags = async (tags: string[]) => {
    if (tags.length === 0) return;
    let where = tagMatches(tags[0]);
    for (let i = 1; i < tags.length; i++) {
      where = `${where} AND ${tagMatches(tags[i])}`;
    }

    return await client.unsafe(`delete from zero_cache where ${where}`);
  };

  const clearAllCache = async () => {
    await client`delete from zero_cache`;
  };

  return {
    getCacheByKey,
    deleteCacheByKey,
    insertCache,
    deleteCacheByTags,
    clearAllCache,
  };
};

export { postgresAdapter, postgres };
