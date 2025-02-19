import { ZeroCache } from "../index";

const { cache } = ZeroCache({
  dzero_token: process.env.DZERO_TOKEN!,
});

const getData = async (id: string) => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return {
    hey: "you",
  };
};

const getDataCache = cache(getData, ["testtag1"]);
const data = await getDataCache("1");

console.log(data);
