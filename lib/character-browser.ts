import type { CharacterMeta } from "@/lib/types";
import { parseRankScope } from "@/lib/rank-scopes";

export const CHARACTER_SORTS = [
  ["tier", "추천 순서"], ["games", "게임 수"], ["winRate", "승률"],
  ["top3", "TOP3"], ["averageRank", "평균 순위"], ["name", "이름"]
] as const;
export type CharacterBrowseQuery = { rankScope?: string; q?: string; weapon?: string; sort?: string; minGames?: string };

export function parseCharacterBrowse(query: CharacterBrowseQuery) {
  return {
    rankScope: parseRankScope(query.rankScope), q: (query.q ?? "").trim().slice(0, 60),
    weapon: /^\d+$/.test(query.weapon ?? "") ? Number(query.weapon) : 0,
    sort: CHARACTER_SORTS.some(([key]) => key === query.sort) ? query.sort! : "tier",
    minGames: [0, 30, 100, 300].includes(Number(query.minGames)) ? Number(query.minGames) : 0
  };
}

export function browseCharacters(meta: CharacterMeta[], query: ReturnType<typeof parseCharacterBrowse>) {
  const search = query.q.replace(/\s/g, "").toLocaleLowerCase("ko-KR");
  return meta.filter((item) => item.games >= query.minGames && (!query.weapon || item.weapon_code === query.weapon) &&
    (!search || `${item.display_name} ${item.name_en ?? ""}`.replace(/\s/g, "").toLocaleLowerCase("ko-KR").includes(search)))
    .map((item, index) => ({ item, index })).sort((a, b) => {
      const left = a.item, right = b.item;
      const difference = query.sort === "games" ? right.games - left.games : query.sort === "winRate" ? right.win_rate - left.win_rate :
        query.sort === "top3" ? right.top3_rate - left.top3_rate : query.sort === "averageRank" ? left.average_rank - right.average_rank :
          query.sort === "name" ? left.display_name.localeCompare(right.display_name, "ko") : 0;
      return difference || a.index - b.index;
    }).map(({ item }) => item);
}

export function characterBrowseParams(query: ReturnType<typeof parseCharacterBrowse>) {
  const params = new URLSearchParams({ rankScope: query.rankScope });
  if (query.q) params.set("q", query.q);
  if (query.weapon) params.set("weapon", String(query.weapon));
  if (query.sort !== "tier") params.set("sort", query.sort);
  if (query.minGames) params.set("minGames", String(query.minGames));
  return params;
}
