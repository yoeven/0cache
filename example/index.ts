import { ZeroCache } from "../index";

const { cache } = ZeroCache({
  dzero_token: process.env.DZERO_TOKEN!,
});

const getData = async (id: string) => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return {
    id: id,
  };
};

const r = cache(getData, ["testtag1"]);
const data = await r("1");

console.log(data);

// await invalidateByTag(["testtag1"]);
