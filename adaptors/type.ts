export type DBAdapter = {
  getCacheByKey: (full_key: string) => Promise<any>;
  deleteCacheByKey: (full_key: string) => Promise<any>;
  insertCache: (full_key: string, data: string, tagString: string, ttl: number) => Promise<any>;
  deleteCacheByTags: (tags: string[]) => Promise<any>;
  clearAllCache: () => Promise<any>;
};
