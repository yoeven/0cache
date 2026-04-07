# 0cache

0cache allows you to cache expensive async/sync operations in your code by simply wrapping your function with the `cache` function. Bring your own database — 0cache uses a pluggable adapter pattern so you can store cache data wherever you want. Inspired by [Vercel's unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache).

- 🔌 Plug and play into any JS/TS project
- 🎯 Simple wrapper syntax on any function
- 🕑 Full cache control with tags & TTL
- 🔄 Manual cache invalidation with tags
- ∑ Caching of any function, not just async functions
- ▫︎ Compression for large payloads
- 🗄️ Bring your own database with adapters (PostgreSQL, [Dzero DB](https://dzero.dev))

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

Create a cache instance with a **database adapter**. Use `postgresAdapter` with [postgres.js](https://github.com/porsager/postgres) for PostgreSQL, or `dzeroAdapter` with [Dzero DB](https://dzero.dev).

### Caching (PostgreSQL)

```ts
import { ZeroCache, postgresAdapter, postgres } from "0cache";

const sql = postgres(process.env.DATABASE_URL!);

const { cache } = ZeroCache({
  dbAdapter: postgresAdapter(sql),
});

const userID = "123";

const getCachedUser = cache(async (id: string) => getUser(id), [userID]);

const user = await getCachedUser(userID);
```

The `postgresAdapter` expects a `zero_cache` table with `key` as a unique primary key. Example DDL:

```sql
CREATE TABLE zero_cache (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  tags TEXT,
  ttl BIGINT NOT NULL
);
```

### Caching (Dzero)

```ts
import { ZeroCache, dzeroAdapter, DB } from "0cache";

const { cache } = ZeroCache({
  dbAdapter: dzeroAdapter(
    DB("https://db.dzero.dev", {
      token: process.env.DZERO_TOKEN!,
    })
  ),
});

const userID = "123";

const getCachedUser = cache(async (id: string) => getUser(id), [userID]);

const user = await getCachedUser(userID);
```

### Manual cache invalidation

Use `invalidateByTag` from the **same** `ZeroCache` instance you used for `cache`:

```ts
const { cache, invalidateByTag } = ZeroCache({
  dbAdapter: postgresAdapter(sql),
});

await invalidateByTag([userID]);
```

`ZeroCache` also returns `clearCache()` to wipe the entire cache table.

### Other options

Pass `debug: true` on `ZeroCache` to log cache keys and hits/misses.

```ts
const { cache } = ZeroCache({
  dbAdapter: postgresAdapter(sql),
  debug: true,
  maxSizeMB: 8,
});

const getCachedUser = cache(async (id: string) => getUser(id), [], {
  revalidate: 1000 * 60 * 60 * 24,
  waitUntil: waitUntil,
  parser: (data: string) => JSON.parse(data),
  shouldCache: (data: any) => data.length > 100,
  maxSizeMB: 2,
});
```

| Option        | Description                                                                                                                                                                                                                                                                                                                                                                                                              | Type                        | Default           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ----------------- |
| `revalidate`  | The time to live (TTL) for the cache in milliseconds, up to 1 month                                                                                                                                                                                                                                                                                                                                                      | `number`                    | `604800` (1 week) |
| `waitUntil`   | A feature that allows for promises to run in the background even when you have returned a response which is supported on platforms like [Vercel](https://vercel.com/docs/functions/vercel-functions-package#waituntil) & [Cloudflare workers](https://developers.cloudflare.com/workers/runtime-apis/context/#waituntil). Pass a `waitUntil` function and caching processes will use waitUntil to run in the background. | `(p: Promise<any>) => void` | `undefined`       |
| `parser`      | A custom parser for data retrieved from cache for special formats you would like to handle that is non-json                                                                                                                                                                                                                                                                                                              | `(data: string) => any`     | `undefined`       |
| `shouldCache` | A custom function that will be called to determine if the data should be cached dynamically based on response.                                                                                                                                                                                                                                                                                                           | `(data: any) => boolean`    | `undefined`       |
| `maxSizeMB`   | Maximum size in MB of the data to cache. Can also be set globally on `ZeroCache` config.                                                                                                                                                                                                                                                                                                                                 | `number`                    | `4`               |

### How tagging & invalidation works

```ts
const getCachedOne = cache(async (id: string) => getUser(id), ["one", "user"]);

const getCachedTwo = cache(async (id: string) => getUser(id), ["two", "user"]);

const getCachedThree = cache(async (id: string) => getUser(id), ["three", "user"]);
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

## Future

- [ ] Add support for non-json objects such as images etc with compression and s3 storage

I'm open to suggestions and ideas that make caching even simpler, feel free to reach out!

## Inspiration & References:

- https://nextjs.org/docs/app/api-reference/functions/unstable_cache
- https://github.com/vercel/next.js/blob/8136842ca20ed6801327862f62ee6ec9b3809fac/packages/next/src/server/web/spec-extension/unstable-cache.ts#L342
- https://github.com/vercel/next.js/blob/8136842ca20ed6801327862f62ee6ec9b3809fac/packages/next/src/server/lib/incremental-cache/index.ts
