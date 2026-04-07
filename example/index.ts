import { ZeroCache, postgresAdapter, postgres } from "../index";

console.log(process.env.DATABASE_URL);

const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
});

const { cache, invalidateByTag } = ZeroCache({
  dbAdapter: postgresAdapter(sql),
  debug: true,
});

const getData = async (id: string) => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return {
    hey: "you",
    id,
  };
};

const getDataCache = cache(getData, ["testtag1"]);
const data = await getDataCache("1");
console.log(data);
