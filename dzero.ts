export const DB = (url: string, header: Record<string, string>) => {
  const fetchDB = async (params?: any, path: string = "/") => {
    try {
      const resp = await fetch(url + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...header,
        },
        body: JSON.stringify(params),
      });

      const result = (await resp.json()) as any;

      if (!resp.ok) throw new Error(result?.message || result);

      return result;
    } catch (e: any) {
      throw e;
    }
  };

  const query = (sql?: string, params?: any[], method: "all" | "exec" = "all") => {
    return fetchDB({ sql, params, method });
  };

  const batch = (queries: { sql: string; params?: any[] }[]) => {
    return fetchDB({ batch: queries }) as Promise<any[]>;
  };

  const ask = (question: string) => {
    return fetchDB(
      {
        q: question,
      },
      "/ask"
    );
  };

  const dump = (option: {
    tables?: string[];
    schema?: boolean;
    data?: boolean;
  }) => {
    return fetchDB(option || {}, "/dump");
  };

  return { query, batch, ask, dump };
};

export type DZeroDB = ReturnType<typeof DB>;

// Usage
// export const db = DB("https://db.dzero.dev", { token: "your-database" });
// const result = await db.query("SELECT * FROM users");
