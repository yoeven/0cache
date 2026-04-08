# 0cache (Experimental)

0cache allows you to cache expensive async/sync operations in your code by simply wrapping your TS/JS function with the `cache` function.

- 🔌 Plug and play into any JS/TS project
- 🎯 Simple wrapper syntax on any function
- 🕑 Full cache control with tags & TTL
- 🔄 Manual cache invalidation with tags
- ∑ Caching of any function, not just async functions
- ▫︎ Compression for large payloads
- 🗄️ Bring your own database with adapters (PostgreSQL included)
- Initially inspired by [Vercel's unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache).

## Installation

```bash
npm i 0cache
# or
yarn add 0cache
# or
pnpm add 0cache
# or
bun add 0cache
```

## Usage

Create a cache instance with a **database adapter**. Use `postgresAdapter` with [postgres.js](https://github.com/porsager/postgres) for PostgreSQL.

### Quick start

```ts
import { ZeroCache, postgresAdapter, postgres } from "0cache";

const sql = postgres(process.env.DATABASE_URL!);

const { cache, invalidateByTag } = ZeroCache({
  dbAdapter: postgresAdapter(sql),
  debug: true,
});

// An expensive operation you want to cache
const getPDFData = async (url: string) => {
  const data = await fetch(url);
  const buffer = await data.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  return { base64, url };
};

// Wrap with cache — subsequent calls with the same args skip the fetch entirely
const getDataCache = cache(getPDFData, {
  tags: ["user_1"],
});

const data = await getDataCache("https://arxiv.org/pdf/1706.03762");
console.log(data);

// Invalidate when the underlying data changes
await invalidateByTag(["user_1"]);
```

The `postgresAdapter` expects a `zero_cache` table with `key` as a unique primary key. Example DDL:

```sql
CREATE TABLE zero_cache (
  key TEXT PRIMARY KEY,
  data BYTEA NOT NULL,
  tags TEXT,
  ttl BIGINT NOT NULL
);
```

`ZeroCache` also returns `invalidateByTag()` and `clearCache()` — use them from the **same** instance you used for `cache`.

### Other options

Pass `debug: true` on `ZeroCache` to log cache hits/misses, retrieval times, and result sizes. Can also be set per-cache.

```ts
const { cache } = ZeroCache({
  dbAdapter: postgresAdapter(sql),
  debug: true,
  maxSizeMB: 8,
});

const getCachedUser = cache(async (id: string) => getUser(id), {
  revalidate: 60 * 60 * 24,
  waitUntil: waitUntil,
  parser: (data: string) => JSON.parse(data),
  shouldCache: (data: any) => data.length > 100,
  maxSizeMB: 2,
});
```

| Option        | Description                                                                                                                                                                                                                                                                                                                                                                                                              | Type                        | Default           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ----------------- |
| `tags`        | Array of string tags to associate with this cache entry for later invalidation. Max 10 tags with a combined 1000 character limit.                                                                                                                                                                                                                                                                                        | `string[]`                  | `[]`              |
| `revalidate`  | The time to live (TTL) for the cache in seconds, up to 1 month                                                                                                                                                                                                                                                                                                                                                           | `number`                    | `604800` (1 week) |
| `waitUntil`   | A feature that allows for promises to run in the background even when you have returned a response which is supported on platforms like [Vercel](https://vercel.com/docs/functions/vercel-functions-package#waituntil) & [Cloudflare workers](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil). Pass a `waitUntil` function and caching processes will use waitUntil to run in the background. | `(p: Promise<any>) => void` | `undefined`       |
| `parser`      | A custom parser for data retrieved from cache for special formats you would like to handle that is non-json                                                                                                                                                                                                                                                                                                              | `(data: string) => any`     | `undefined`       |
| `shouldCache` | A custom function that will be called to determine if the data should be cached dynamically based on response.                                                                                                                                                                                                                                                                                                           | `(data: any) => boolean`    | `undefined`       |
| `maxSizeMB`   | Maximum size in MB of the data to cache. Can also be set globally on `ZeroCache` config.                                                                                                                                                                                                                                                                                                                                 | `number`                    | `4`               |
| `effects`     | Extra key-value pairs included in the cache key. Useful for differentiating cache entries by external state like user sessions or feature flags.                                                                                                                                                                                                                                                                         | `[string, any][]`           | `undefined`       |
| `enable`      | Set to `false` to bypass caching entirely and always call the original function.                                                                                                                                                                                                                                                                                                                                         | `boolean`                   | `true`            |
| `debug`       | Enable debug logging for this specific cache. Overrides the global `debug` setting on `ZeroCache`.                                                                                                                                                                                                                                                                                                                       | `boolean`                   | `false`           |

### Supported return types

Only JSON-serializable return types are cached. If the function returns an unsupported type, it will still be returned as-is but **not** cached.

| Type     | Cached |
| -------- | ------ |
| Object   | ✅     |
| Array    | ✅     |
| String   | ✅     |
| Number   | ✅     |
| Boolean  | ✅     |
| `null`   | ❌     |
| `Map`    | ❌     |
| `Set`    | ❌     |
| `Date`   | ❌     |
| Class    | ❌     |
| Function | ❌     |

### How tagging & invalidation works

```ts
const getCachedOne = cache(async (id: string) => getUser(id), { tags: ["one", "user"] });

const getCachedTwo = cache(async (id: string) => getUser(id), { tags: ["two", "user"] });

const getCachedThree = cache(async (id: string) => getUser(id), { tags: ["three", "user"] });
```

You can set up to 10 tags, with a total of 1000 characters. Tags are a great way to group cache together allowing you to invalidate them later.

This would invalidate all cache with the tag `user`. With the above example meaning all three cached data would be invalidated.

```ts
await invalidateByTag(["user"]);
```

This would invalidate cache that has both `user` and `three` tags. With the above example meaning only the third cached data would be invalidated.

```ts
await invalidateByTag(["user", "three"]);
```

### Cleaning up expired cache

0cache skips expired entries on read and deletes them individually, but expired rows are not automatically purged in bulk. To keep your table lean, set up a scheduled job that deletes rows whose `ttl` is in the past.

**PostgreSQL with pg_cron**

```sql
SELECT cron.schedule(
  'purge_expired_cache',
  '0 * * * *', -- every hour
  $$DELETE FROM zero_cache WHERE ttl < extract(epoch from now())$$
);
```

You can also handle this with any external cron runner or task scheduler — just run the equivalent `DELETE` query on your chosen interval.

### Custom adapters

You can create your own adapter by implementing the `DBAdapter` interface:

```ts
import type { DBAdapter } from "0cache";

const myAdapter: DBAdapter = {
  getCacheByKey: async (key) => {
    /* ... */
  },
  deleteCacheByKey: async (key) => {
    /* ... */
  },
  insertCache: async (key, data, tags, ttl) => {
    /* ... */
  },
  deleteCacheByTags: async (tags) => {
    /* ... */
  },
  clearAllCache: async () => {
    /* ... */
  },
};

const { cache } = ZeroCache({ dbAdapter: myAdapter });
```

## Why not a Redis database?

Redis is great, but tag-based invalidation gets messy. You either need to scan keys or maintain separate sets to track which keys belong to which tags, that means more round trips and extra bookkeeping just to delete a single group of entries.

With a relational database like PostgreSQL, tags can be stored as a text column and invalidated with a simple substring match in a single query. One `DELETE` statement with a `LIKE` or pattern check handles what would take multiple commands and bookkeeping in Redis, no extra data structures, no multi-step coordination.

If tag-based invalidation is core to your caching strategy, a relational database keeps things simpler and more predictable.

## Future

- [ ] Add support for non-json objects such as images etc with compression and s3 storage
- [ ] Storing larger responses in S3 bucket and mapping the ID to database

I'm open to suggestions and ideas that make caching even simpler, feel free to reach out!

## Inspiration & References:

- https://nextjs.org/docs/app/api-reference/functions/unstable_cache
- https://github.com/vercel/next.js/blob/8136842ca20ed6801327862f62ee6ec9b3809fac/packages/next/src/server/web/spec-extension/unstable-cache.ts#L342
- https://github.com/vercel/next.js/blob/8136842ca20ed6801327862f62ee6ec9b3809fac/packages/next/src/server/lib/incremental-cache/index.ts
