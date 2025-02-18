# Alt Cache

Alt cache allows you to cache expensive operations in your code by simply wrapping your function with the `cache` function. This project was inspired by [Vercel's unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache) simple syntax and is built on top of [Dzero's DB](https://dzero.dev) for fast caching and smooth invalidation

- 🔌 Plug and play into any JS/TS project
- 🎯 Simple wrapper syntax on any function
- 🕑 Full cache control with tags & TTL
- 🔄 Manual cache invalidation with tags
- 🚫 < 30ms invalidation of cached data
- ∑ Caching of any function, not just async functions
- ▫︎ Compression for large payloads
- 🔒 Secure & private cache storage
- ⚡ Blazing fast global edge cache

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

Caching

```ts
import { ZeroCache } from "0cache";

const { cache } = ZeroCache({
  dzero_token: process.env.DZERO_TOKEN!,
});

const userID = "123";

const getCachedUser = cache(async (id: string) => getUser(id), [userID]);

const user = await getCachedUser(userID);
```

Manual Cache Invalidation

```ts
const { invalidateByTag } = ZeroCache();

await invalidateByTag(userID);
```

TTL

```ts
const getCachedUser = cache(async (id: string) => getUser(id), [userID], {
  ttl: 1000 * 60 * 60 * 24, // 1 day, up to 1 month
});
```

References:

- https://github.com/vercel/next.js/blob/8136842ca20ed6801327862f62ee6ec9b3809fac/packages/next/src/server/web/spec-extension/unstable-cache.ts#L342
- https://github.com/vercel/next.js/blob/8136842ca20ed6801327862f62ee6ec9b3809fac/packages/next/src/server/lib/incremental-cache/index.ts
