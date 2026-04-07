import { ZeroCache, postgresAdapter, postgres } from "../index";

const sql = postgres(process.env.DATABASE_URL!, {
  prepare: false,
});

const { cache, invalidateByTag } = ZeroCache({
  dbAdapter: postgresAdapter(sql),
  debug: true,
});

const getPDFData = async (url: string) => {
  const data = await fetch(url);
  const buffer = await data.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  //more complex operations
  setTimeout(() => {
    console.log("complex operation done");
  }, 3000);

  return {
    base64,
    url,
  };
};

const getDataCache = cache(getPDFData, {
  tags: ["user_1"],
});

const data = await getDataCache("https://arxiv.org/pdf/1706.03762");
console.log(data);

sql.end();
