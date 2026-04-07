import { ZeroCache, postgresAdapter, postgres } from "../index";

const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
});

const { cache, invalidateByTag } = ZeroCache({
  dbAdapter: postgresAdapter(sql),
  debug: true,
});

const getData = async ({ id }: { id: string }) => {
  await new Promise((resolve) => setTimeout(resolve, 2000));
  return {
    hey: "you",
    id,
  };
};

const getDataCache = cache(getData, {
  tags: ["user_1"],
});

const data = await getDataCache({ id: "1" });
console.log(data);

sql.end();
