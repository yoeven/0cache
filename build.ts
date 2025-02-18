import type { BuildConfig } from "bun";
import dts from "bun-plugin-dts";

//https://github.com/wobsoriano/bun-lib-starter

const defaultBuildConfig: BuildConfig = {
  entrypoints: ["./index.ts"],
  outdir: "./dist",
};

await Promise.all([
  Bun.build({
    ...defaultBuildConfig,
    plugins: [dts()],
    format: "esm",
    naming: "[dir]/[name].js",
    minify: true,
  }),
  Bun.build({
    ...defaultBuildConfig,
    format: "cjs",
    naming: "[dir]/[name].cjs",
    minify: true,
  }),
]);
