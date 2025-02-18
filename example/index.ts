import { altcache } from "../index";

const { cache } = altcache({
  dzero_token: process.env.DZERO_TOKEN!,
});

const getData = async () => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return {
    name: "John Doe",
    age: 30,
    city: "New York",
  };
};

const r = cache(() => getData(), ["testtag1"]);

console.log(r);

// await invalidateByTag(["testtag1"]);
