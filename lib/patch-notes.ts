import type { PatchChange } from "@/lib/types";
import type { BuildPatchChange } from "@/lib/build-stats";

export type ParsedPatchNote = {
  patchVersion: string;
  publishedAt: string | null;
  rawText: string;
  changes: Omit<PatchChange, "reviewed">[];
  buildChanges: BuildPatchChange[];
};

export async function fetchPatchNoteText(url: string) {
  const response = await fetch(url, { headers: { accept: "text/html,text/plain" } });
  if (!response.ok) throw new Error(`Failed to fetch patch note: ${response.status}`);
  const html = await response.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|h1|h2|h3|div)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parsePatchNote(rawText: string, url: string): ParsedPatchNote {
  const patchVersion =
    rawText.match(/(\d+\.\d+(?:[a-z]|\.\d+)?)\s*(?:패치\s*노트|patch\s*notes?)/i)?.[1] ??
    rawText.match(/(?:version|ver\.?|v)\s*([0-9]+\.[0-9]+[^\s]*)/i)?.[1] ??
    rawText.match(/(?<![\d.])(\d{1,3}\.\d{1,2}(?:[a-z]|\.\d{1,2})?)(?![\d.])/i)?.[1] ??
    new URL(url).pathname.split("/").filter(Boolean).at(-1) ??
    "unknown";

  const characterSection = extractCharacterSection(rawText);
  const lines = characterSection
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const changes = lines
    .filter((line) => hasBalanceSignal(line))
    .slice(0, 200)
    .map((line) => classifyChange(line, patchVersion));

  return {
    patchVersion,
    publishedAt: null,
    rawText,
    changes,
    buildChanges: parseBuildPatchChanges(rawText, patchVersion)
  };
}

// Parse general-mode build sections separately from character and Cobalt changes.
// Unknown names remain unreviewed; import resolves only exact catalog matches.
export function parseBuildPatchChanges(text: string, patchVersion: string): BuildPatchChange[] {
  let type: BuildPatchChange["entity_type"] | null = null;
  let target = "";
  let excludedMode = false;
  const changes: BuildPatchChange[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\u00a0/g, " ").trim();
    if (!line) continue;
    if (/^(?:코발트|cobalt|론울프)/i.test(line)) { excludedMode = true; type = null; target = ""; continue; }
    if (/^(?:일반 모드|normal mode)$/i.test(line)) { excludedMode = false; continue; }
    if (excludedMode) continue;
    if (/^(?:아이템|무기|방어구|items?|weapons?|armou?r)$/i.test(line)) { type = "item"; target = ""; continue; }
    if (/^(?:특성|traits?|augments?)$/i.test(line)) { type = "trait"; target = ""; continue; }
    if (/^(?:전술 스킬|tactical skills?)$/i.test(line)) { type = "tactical_skill"; target = ""; continue; }
    if (/^(?:실험체|캐릭터|characters?|코발트.*|cobalt.*|론울프.*|시스템.*|system.*|버그 수정.*|bug fixes?.*|신규.*|스킨.*)$/i.test(line)) { type = null; target = ""; continue; }
    if (!type || /^(?:옷|머리|팔|다리|장식|팔\/장식|핵심|보조|공격|방어|지원)$/.test(line)) continue;
    if (!hasBalanceSignal(line) && !/→|->/.test(line)) {
      if (line.length <= 50 && !/[.!?。]|고유|지속 효과|사용 효과/.test(line)) target = line;
      continue;
    }
    const inline = line.match(/^(.+?)\s+(?:공격력|방어력|방어 관통|스킬 증폭|체력|쿨다운|피해량)\s+\d/);
    if (inline && inline[1].length < 40) target = inline[1].trim();
    if (!target) continue;
    const [beforeText, afterText] = line.split(/\s*(?:→|->)\s*/);
    const before = afterText ? beforeText.replace(/^[^0-9+-]*/, "").trim() : null;
    const after = afterText?.trim() ?? null;
    let changeType: BuildPatchChange["change_type"] = /버그|수정|bug/i.test(line) ? "bugfix" : "adjustment";
    if (changeType !== "bugfix" && before && after) {
      const numbers = (value: string) => value.match(/-?\d+(?:\.\d+)?/g)?.map(Number) ?? [];
      const left = numbers(before), right = numbers(after);
      const directions = left.length === right.length ? right.map((value, i) => Math.sign(value - left[i])).filter(Boolean) : [];
      if (directions.length && directions.every((value) => value === directions[0])) {
        const beneficial = directions[0] * (/쿨다운|cooldown/i.test(line) ? -1 : 1);
        changeType = beneficial > 0 ? "buff" : "nerf";
      }
    }
    changes.push({ patch_version: patchVersion, entity_type: type, target_code: null, target_name: target,
      raw_change_text: `${target}: ${line}`.slice(0, 2000), before_value: before, after_value: after, change_type: changeType, reviewed: false });
  }
  return [...new Map(changes.map((change) => [`${change.entity_type}:${change.target_name}:${change.raw_change_text}`, change])).values()].slice(0, 500);
}

function extractCharacterSection(text: string) {
  const start = text.search(/(character|characters|실험체|캐릭터)/i);
  if (start < 0) return text;
  const section = text.slice(start);
  const end = section.search(/\n\s*(weapon|item|mode|system|bug|무기|아이템|시스템|모드)\b/i);
  return end > 0 ? section.slice(0, end) : section;
}

function hasBalanceSignal(line: string) {
  return /(\d+(\.\d+)?\s*(%|초|s)?\s*(→|->|에서|to)|증가|감소|상향|하향|버프|너프|cooldown|damage|defense|attack|duration)/i.test(
    line
  );
}

function classifyChange(line: string, patchVersion: string): Omit<PatchChange, "reviewed"> {
  const type = inferChangeType(line);
  const [beforeValue, afterValue] = extractBeforeAfter(line);
  return {
    patch_version: patchVersion,
    character_code: 0,
    change_type: type,
    target_type: inferTargetType(line),
    target_name: null,
    before_value: beforeValue,
    after_value: afterValue,
    raw_change_text: line,
    impact_score: impactScoreForType(type)
  };
}

function inferChangeType(line: string): PatchChange["change_type"] {
  if (/버그|bug/i.test(line)) return "bugfix";
  if (/너프|하향|감소|decreased|reduced/i.test(line)) return "nerf";
  if (/버프|상향|증가|increased/i.test(line)) return "buff";
  return "adjustment";
}

function inferTargetType(line: string) {
  if (/쿨다운|cooldown/i.test(line)) return "cooldown";
  if (/피해|데미지|damage/i.test(line)) return "damage";
  if (/방어|defense/i.test(line)) return "defense";
  if (/체력|hp|health/i.test(line)) return "health";
  return "unknown";
}

function extractBeforeAfter(line: string): [string | null, string | null] {
  const arrow = line.match(/([0-9]+(?:\.[0-9]+)?%?)\s*(?:→|->|to)\s*([0-9]+(?:\.[0-9]+)?%?)/i);
  if (arrow) return [arrow[1], arrow[2]];
  return [null, null];
}

function impactScoreForType(type: PatchChange["change_type"]) {
  if (type === "buff") return 2;
  if (type === "nerf") return -2;
  if (type === "bugfix") return 0.5;
  return 0;
}
