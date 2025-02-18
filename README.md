# Alt Cache

Alt cache allows you to cache expensive operations in your code by simply wrapping your function with the `cache` function. This project was inspired by [Vercel's unstable_cache](https://nextjs.org/docs/app/api-reference/functions/unstable_cache) simplicity and built on top of [Dzero's DB](https://dzero.dev) for fast caching and smooth invalidation.

## Installation

```bash
npm i altcache
# or
yarn add altcache
# or
pnpm add altcache
# or
bun add altcache
```

## Usage

```ts
import { altcache } from "altcache";

const { cache } = altcache({
  dzero_token: process.env.DZERO_TOKEN!,
});

const getCachedUser = cache(async (id) => getUser(id), ["my-app-user"]);
```
