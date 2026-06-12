import type { PatchChange } from "@/lib/types";

export type ParsedPatchNote = {
  patchVersion: string;
  publishedAt: string | null;
  rawText: string;
  changes: Omit<PatchChange, "reviewed">[];
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
    rawText.match(/(?:version|ver\.?|v)\s*([0-9]+\.[0-9]+[^\s]*)/i)?.[1] ??
    rawText.match(/([0-9]+\.[0-9]+[a-z0-9.-]*)/)?.[1] ??
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
    changes
  };
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
