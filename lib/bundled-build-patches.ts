import type { BuildPatchChange } from "@/lib/build-stats";

const source_url = "https://playeternalreturn.com/posts/news/3924?hl=ko-KR";
// Names are resolved against the official catalog at read/import time. Never guess codes.
export const BUNDLED_BUILD_PATCHES: BuildPatchChange[] = [
  { patch_version: "12.7", entity_type: "tactical_skill", target_code: null, target_name: "진실의 칼날",
    raw_change_text: "진실의 칼날: 쿨다운 10/8초 → 9/7초", before_value: "10/8초", after_value: "9/7초", change_type: "buff", reviewed: true, source_url },
  { patch_version: "12.7", entity_type: "item", target_code: null, target_name: "이단심판관",
    raw_change_text: "이단심판관 / 차원 균열: 피해량 12(+스킬 증폭의 4%) → 12(+스킬 증폭의 5%)", before_value: "12(+스킬 증폭의 4%)", after_value: "12(+스킬 증폭의 5%)", change_type: "buff", reviewed: true, source_url },
  { patch_version: "12.7", entity_type: "item", target_code: null, target_name: "서슬가시 체인",
    raw_change_text: "서슬가시 체인: 방어 관통 12 → 13", before_value: "12", after_value: "13", change_type: "buff", reviewed: true, source_url }
];
