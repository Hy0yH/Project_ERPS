import { fetchKoreanL10n } from "@/lib/eternal-return";
import { createAsyncCache } from "@/lib/async-cache";
const catalog = createAsyncCache<Record<string, string>>(24 * 60 * 60 * 1000, 1);
export async function getKoreanGameNames() {
  if (!process.env.ETERNAL_RETURN_API_KEY) return {};
  return catalog.get("ko", fetchKoreanL10n).catch(() => ({}));
}
