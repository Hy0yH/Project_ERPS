// A short process-local read cache. It does not enforce a shared API quota.
export function createAsyncCache<T>(ttlMs: number, capacity = 32) {
  const values = new Map<string, { expires: number; value: Promise<T> }>();
  return {
    get(key: string, read: () => Promise<T>): Promise<T> {
      const existing = values.get(key);
      if (existing && existing.expires > Date.now()) return existing.value;
      if (values.size >= capacity) values.delete(values.keys().next().value!);
      const value = read().catch((error) => { if (values.get(key)?.value === value) values.delete(key); throw error; });
      values.set(key, { expires: Date.now() + ttlMs, value });
      return value;
    },
    clear() { values.clear(); }
  };
}
