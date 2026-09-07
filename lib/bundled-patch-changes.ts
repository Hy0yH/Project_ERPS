import type { PatchChange } from "@/lib/types";

export const PATCH_12_2_SOURCE_URL = "https://playeternalreturn.com/posts/news/3783?hl=ko-KR";
export const PATCH_12_2B_SOURCE_URL = "https://playeternalreturn.com/posts/news/3801?hl=ko-KR";
export const PATCH_12_3_SOURCE_URL = "https://playeternalreturn.com/posts/news/3813?hl=ko-KR";

type BundledPatchChange = Omit<PatchChange, "reviewed"> & { reviewed: true };

function change(
  characterCode: number,
  changeType: "buff" | "nerf",
  targetName: string,
  rawChangeText: string,
  weaponCodes?: number[]
): BundledPatchChange {
  return {
    patch_version: "12.2",
    character_code: characterCode,
    weapon_codes: weaponCodes,
    change_type: changeType,
    target_type: "character",
    target_name: targetName,
    before_value: null,
    after_value: null,
    raw_change_text: rawChangeText,
    impact_score: changeType === "buff" ? 2 : -2,
    reviewed: true
  };
}

function hotfixChange(
  characterCode: number,
  changeType: "buff" | "nerf" | "adjustment",
  targetName: string,
  rawChangeText: string,
  weaponCodes?: number[]
): BundledPatchChange {
  return {
    patch_version: "12.2b",
    character_code: characterCode,
    weapon_codes: weaponCodes,
    change_type: changeType,
    target_type: "character",
    target_name: targetName,
    before_value: null,
    after_value: null,
    raw_change_text: rawChangeText,
    impact_score: changeType === "buff" ? 2 : changeType === "nerf" ? -2 : 0,
    reviewed: true
  };
}

function patch12_3Change(
  characterCode: number,
  changeType: "buff" | "nerf" | "adjustment",
  targetName: string,
  rawChangeText: string,
  weaponCodes?: number[]
): BundledPatchChange {
  return {
    patch_version: "12.3",
    character_code: characterCode,
    weapon_codes: weaponCodes,
    change_type: changeType,
    target_type: "character",
    target_name: targetName,
    before_value: null,
    after_value: null,
    raw_change_text: rawChangeText,
    impact_score: changeType === "buff" ? 2 : changeType === "nerf" ? -2 : 0,
    reviewed: true
  };
}

/**
 * 공식 패치노트의 일반 모드 실험체 밸런스 변경입니다.
 * 코발트 프로토콜 전용 보정과 무기·방어구를 통한 간접 변경은 포함하지 않습니다.
 */
export const BUNDLED_PATCH_CHANGES: BundledPatchChange[] = [
  // 2026-09-03 12.3 일반 모드 실험체 밸런스 변경
  patch12_3Change(76, "nerf", "억누른 고통(W) / 처형식(R)", "억누른 고통(W) 받는 피해 감소 50% → 45% · 처형식(R) 속박 지속 시간 0.8초 → 0.7초"),
  patch12_3Change(6, "nerf", "늑대 맹습(R)", "늑대 맹습(R) 추가 공격력 계수 80% → 75%", [8]),
  patch12_3Change(34, "buff", "기본 체력 / 슬로우 셔터(P)", "기본 체력 905 → 930 · 슬로우 셔터(P) 피해량 30/60/90 → 40/70/100"),
  patch12_3Change(33, "buff", "격투 액션(Q)", "격투 액션(Q) 미적중 시 후딜레이 0.13초 삭제"),
  patch12_3Change(37, "buff", "걸작(R)", "걸작(R) 종료 피해 공격력 계수 90% → 95%"),
  patch12_3Change(74, "nerf", "방망이 무기 숙련도", "방망이 무기 숙련도 레벨 당 기본 공격 증폭 1.7% → 1.6%", [3]),
  patch12_3Change(69, "buff", "에어 호른! 건(E)", "피해 스킬 증폭 계수 45% → 55% · 보호막 스킬 증폭 계수 20% → 25%"),
  patch12_3Change(29, "nerf", "인간 어뢰(P)", "인간 어뢰(P) 피해량 30/45/60 → 30/40/50"),
  patch12_3Change(90, "buff", "무엄하시네요!(E)", "무엄하시네요!(E) 쿨다운 14/13/12/11/10초 → 13/12/11/10/9초"),
  patch12_3Change(10, "buff", "취호격파산(R)", "최소 피해 공격력 계수 60% → 70% · 최대 피해 공격력 계수 90% → 105%"),
  patch12_3Change(57, "nerf", "재생(P)", "방송 중 기본 공격 피해 공격력 계수 55% → 52%"),
  patch12_3Change(45, "buff", "캣 워크(E)", "캣 워크(E) 쿨다운 18/17/16/15/14초 → 17/16/15/14/13초"),
  patch12_3Change(42, "buff", "흡혈귀(P)", "흡혈귀(P) 대상 최대 체력 비례 피해 5% → 8%"),
  patch12_3Change(88, "buff", "천벌 받아라!(W) / 신명나게 놀아보자!(R)", "천벌 받아라!(W) 보호막 30/60/90/120/150(+최대 체력의 12%) → 50/75/100/125/150(+최대 체력의 13%) · 신명나게 놀아보자!(R) 최대 체력 증가 150/300/450 → 150/325/500"),
  patch12_3Change(73, "buff", "치유의 빛(W)", "치유의 빛(W) 체력 회복 스킬 증폭 계수 15% → 18%"),
  patch12_3Change(13, "buff", "창 무기 숙련도", "창 무기 숙련도 레벨 당 스킬 증폭 4.4% → 4.7%", [19]),
  patch12_3Change(18, "buff", "부당거래(P)", "부당거래(P) 단검 투척 피해량 50/80/110 → 60/90/120"),
  patch12_3Change(28, "nerf", "마음의 양식(P)", "피해량 70/120/170 → 50/100/150 · 주변 범위 피해량 50/80/110 → 40/70/100"),
  patch12_3Change(15, "buff", "윌슨! 도와줘(Q)", "윌슨! 도와줘(Q) 경로 피해 스킬 증폭 계수 30% → 35%"),
  patch12_3Change(52, "adjustment", "루미너리(Q)", "기본 피해 스킬 증폭 계수 60% → 65% · 해 컨정션 효과 스킬 증폭 계수 100% → 90%"),
  patch12_3Change(52, "buff", "트라인 에스펙트(W)", "피해량 70/90/110/130/150(+스킬 증폭의 60%) → 80/105/130/155/180(+스킬 증폭의 65%) · 달 컨정션 1회 당 피해량 50/90/130/170(+스킬 증폭의 45%) → 50/100/150/200(+스킬 증폭의 50%)"),
  patch12_3Change(52, "buff", "폴 디그니티(E)", "폴 디그니티(E) 1타 피해 스킬 증폭 계수 40% → 45%"),
  patch12_3Change(66, "buff", "님루드의 비석(E/RE)", "님루드의 비석(E) 및 님루드의 문(RE) 피해 스킬 증폭 계수 55% → 60%"),
  patch12_3Change(35, "buff", "위빙(E)", "위빙(E) 기본 공격 강화 피해의 적 최대 체력 계수 5% → 6%"),
  patch12_3Change(50, "nerf", "겨울여왕의 영지(P) / 더블 악셀(W)", "겨울여왕의 영지(P) 쿨다운 6/4/2초 → 7/5/3초 · 더블 악셀(W) 추가 체력 계수 12% → 10%"),
  patch12_3Change(77, "buff", "풍인(W)", "풍인(W) 강화 피해 스킬 증폭 계수 75% → 85%"),
  patch12_3Change(11, "nerf", "빗겨치고 일격(E)", "빗겨치고 일격(E) 쿨다운 15/14/13/12/11초 → 16/15/14/13/12초"),
  patch12_3Change(61, "buff", "고양이로 펑!(이렘 R)", "기본 공격 강화 피해 스킬 증폭 계수 25/30/35/40% → 30/35/40/45%"),
  patch12_3Change(63, "nerf", "레벨 당 체력", "레벨 당 체력 94 → 91"),
  patch12_3Change(1, "nerf", "단검 무기 숙련도", "레벨 당 기본 공격 증폭 2.1% → 1.3% · 레벨 당 공격 속도 4.1% → 2.7%", [15]),
  patch12_3Change(1, "buff", "양손검 무기 숙련도", "양손검 무기 숙련도 레벨 당 공격 속도 3.6% → 4%", [16]),
  patch12_3Change(1, "buff", "도끼 무기 숙련도", "도끼 무기 숙련도 레벨 당 공격 속도 3% → 3.4%", [14]),
  patch12_3Change(1, "buff", "쌍검 무기 숙련도", "쌍검 무기 숙련도 레벨 당 공격 속도 4% → 4.4%", [18]),
  patch12_3Change(1, "nerf", "피의 축제(P) / 전기톱 살인마(R)", "피의 축제(P) 출혈 피해 공격력 계수 25% → 20% · 전기톱 살인마(R) 공격 속도 증가 20/30/40% → 20/25/30%"),
  patch12_3Change(39, "nerf", "브엘따(Q)", "브엘따(Q) 피해 공격력 계수 70% → 65%"),
  patch12_3Change(23, "nerf", "쌍검 무기 숙련도", "쌍검 무기 숙련도 레벨 당 스킬 증폭 4.8% → 4.6%", [18]),
  patch12_3Change(71, "buff", "기본 공격력", "기본 공격력 34 → 37"),
  patch12_3Change(89, "nerf", "포커스 샷(마탄 Q)", "포커스 샷(마탄 Q) 피해 스킬 증폭 계수 85% → 80%"),
  patch12_3Change(89, "nerf", "스윕 킥 / 백플립(W)", "스윕 킥 / 백플립(W) 쿨다운 11/10.5/10/9.5/9초 → 12/11.5/11/10.5/10초"),
  patch12_3Change(89, "buff", "스윕 킥(W)", "스윕 킥 피해량 30/55/80/105/130 → 40/65/90/115/140 · 적중 시 쿨다운 감소 15% → 20%"),
  patch12_3Change(89, "buff", "컴뱃 롤(E)", "컴뱃 롤(E) 피해 스킬 증폭 계수 55% → 60%"),
  patch12_3Change(14, "nerf", "부정의 손길(Q)", "부정의 손길(Q) 피해 스킬 증폭 계수 65% → 60%"),
  patch12_3Change(51, "buff", "대지의 메아리(R)", "대지의 메아리(R) 받는 피해 감소 40% → 50%"),
  patch12_3Change(3, "buff", "뚜셰(P)", "뚜셰(P) 체력 회복량 20/40/60 → 20/50/80"),
  patch12_3Change(8, "buff", "Flanger(E)", "Flanger(E) 피해 공격력 계수 60% → 65%"),
  patch12_3Change(83, "buff", "시계바늘(Q) - 분침(Q1)", "분침(Q1) 피해 스킬 증폭 계수 60% → 65%"),
  patch12_3Change(12, "nerf", "활 무기 숙련도", "활 무기 숙련도 레벨 당 스킬 증폭 4.8% → 4.7%", [7]),
  patch12_3Change(78, "buff", "거합일섬(W) - 일도양단(W1)", "일도양단(W1) 보호막 추가 공격력 계수 30% → 35%"),
  change(6, "nerf", "석궁 무기 숙련도", "석궁 무기 숙련도 레벨 당 기본 공격 증폭 1.3% → 1.2%", [8]),
  change(74, "nerf", "기본 공격력 / 수금(W)", "기본 공격력 42 → 40 · 수금(W) 보호막량 50/90/130/170/210 → 50/85/120/155/190"),
  change(65, "buff", "방어력 / 휠 댄스(데비 W)", "레벨 당 방어력 3 → 3.2 · 휠 댄스(데비 W) 추가 공격력 계수 60% → 75%"),
  change(47, "nerf", "황혼의 도둑(R)", "보호막량 90/120/150(+스킬 증폭의 20%) → 80/110/140(+스킬 증폭의 15%)"),
  change(20, "buff", "위풍당당(P)", "보호막량 최대 체력의 7/10/13% → 8/11/14%"),
  change(69, "buff", "방어력 / 뿅! 망치(W)", "레벨 당 방어력 2.8 → 3 · 뿅! 망치(W) 아군 이동 속도 증가 스킬 증폭 계수 2% → 2.5%"),
  change(69, "buff", "권총 무기 숙련도", "권총 무기 숙련도 레벨 당 스킬 증폭 4.2% → 4.4%", [9]),
  change(21, "buff", "스핀샷(W) / 셈텍스 탄 Mk-II(R)", "스핀샷(W) 방어력 감소 8/9/10/11/12% → 10/11/12/13/14% · 셈텍스 탄 Mk-II(R) 즉시 폭발 피해량 6/9/12% → 7/10/13%"),
  change(75, "buff", "스타카토(Q)", "동일 대상에게 연속 적중 시 피해량 감소 55% → 50%"),
  change(45, "buff", "숄 장막(W)", "받는 피해 감소 25/27/29/31/33% → 25/28/31/34/37%"),
  change(53, "nerf", "전투 교범(Q)", "체력 회복량 입힌 피해량의 130% → 120%"),
  change(4, "nerf", "기본 체력", "기본 체력 1070 → 1030"),
  change(64, "nerf", "몽환 나비(P)", "보호막량 30/65/100(+스킬 증폭의 30%) → 30/60/90(+스킬 증폭의 30%)"),
  change(84, "buff", "레벨 당 체력", "레벨 당 체력 86 → 89"),
  change(88, "buff", "신명나게 놀아보자!(R)", "시전 중 받는 피해 감소 30% → 40%"),
  change(28, "nerf", "마음의 양식(P) / 오딧세이(Q) / 돈키호테(E)", "마음의 양식(P) 피해량 100/160/220 → 70/120/170 · 오딧세이(Q) 이동 속도 감소 50/55/60/65/70% → 40/45/50/55/60% · 돈키호테(E) 이동 속도 감소 50% → 30%"),
  change(24, "buff", "레이피어 무기 숙련도", "레이피어 무기 숙련도 레벨 당 스킬 증폭 4.6% → 4.7%", [21]),
  change(17, "nerf", "레벨 당 체력", "레벨 당 체력 76 → 74"),
  change(52, "buff", "루미너리(Q) / 트라인 에스펙트(W) / 폴 디그니티(E)", "루미너리(Q) 해 천체 추가 피해량 20(+스킬 증폭의 15%) → 30(+스킬 증폭의 25%) · 트라인 에스펙트(W) 해 천체 추가 피해량 20(+스킬 증폭의 15%) → 30(+스킬 증폭의 25%) · 폴 디그니티(E) 해 천체 추가 피해량 10(+스킬 증폭의 10%) → 20(+스킬 증폭의 15%)"),
  change(66, "buff", "바빌론의 입방체(W/RW)", "1타 스킬 증폭 계수 45% → 50% (바빌론의 주사위(RW)에도 적용)"),
  change(9, "buff", "기본 체력 / 셈텍스 폭탄(Q)", "기본 체력 900 → 920 · 셈텍스 폭탄(Q) 공격력 계수 25% → 35%"),
  change(35, "buff", "위빙(E)", "스킬 증폭 계수 50% → 60%"),
  change(46, "buff", "과전하(P)", "과전하 종료 시 이동 속도 증가 7/10/13% → 10/13/16%"),
  change(41, "buff", "인도하는 빛(E)", "이동 속도 증가 스킬 증폭 계수 1% → 2%"),
  change(36, "nerf", "VF 방출(R)", "피해량 8/12/16 → 6/10/14 · 5스택 추가 피해량 30/50/70 → 30/45/60"),
  change(63, "nerf", "해방(R)", "공포 지속 시간 0.9/1.1/1.3초 → 0.9/1/1.1초"),
  change(5, "buff", "암기 무기 숙련도", "암기 무기 숙련도 레벨 당 스킬 증폭 3.9% → 4%", [6]),
  change(1, "nerf", "단검 무기 숙련도", "단검 무기 숙련도 레벨 당 기본 공격 증폭 2.8% → 2.4%", [15]),
  change(1, "nerf", "양손검 무기 숙련도", "양손검 무기 숙련도 레벨 당 기본 공격 증폭 2.3% → 2.2%", [16]),
  change(1, "buff", "도끼 무기 숙련도", "도끼 무기 숙련도 레벨 당 기본 공격 증폭 1.9% → 2.1%", [14]),
  change(38, "buff", "페르소나(E)", "스킬 증폭 계수 58% → 60%"),
  change(39, "nerf", "씨에레(W)", "공격력 계수 20% → 18%"),
  change(54, "nerf", "작살 장전(P) / 구속의 사슬(R)", "작살 장전(P) 충전 시간 13/11/9초 → 14/12/10초 · 구속의 사슬(R) 이동 속도 감소 40/45/50% → 30/35/40%"),
  change(40, "buff", "살아 있는 마리오네트(P) / 공격 명령(Q)", "니나 추가 방어력 15/30/45 → 20/35/50 · 공격 명령(Q) 니나 공격력 계수 75% → 80%"),
  change(60, "buff", "파라디소(R)", "대검 적중 피해량 60/100/140(+스킬 증폭의 40%) → 70/120/170(+스킬 증폭의 45%)"),
  change(51, "buff", "대지의 메아리(R)", "스킬 증폭 계수 60% → 65%"),
  change(3, "nerf", "레이피어 무기 숙련도", "레이피어 무기 숙련도 레벨 당 스킬 증폭 4.2% → 4.1%", [21]),
  change(83, "buff", "시간 도약(E)", "스킬 증폭 계수 60% → 70%"),
  change(7, "buff", "도그파이트(P)", "체력 회복량 최대 체력의 5/8/11% → 6/9/12%"),
  change(78, "buff", "거합일섬(W) - 일륜난무(W3)", "일륜난무(W3) 기본 피해량 10 → 20"),
  hotfixChange(90, "adjustment", "랭크 대전", "이제 랭크 대전에서 사용할 수 있습니다."),
  hotfixChange(90, "adjustment", "영애의 소양(P)", "피해량 20/60/100(+스킬 증폭의 55%) → 30/70/110(+스킬 증폭의 50%)"),
  hotfixChange(90, "buff", "화려한 낭만(Q) / 총사의 예법(R)", "화려한 낭만(Q) 사거리 7m → 7.5m · 총사의 예법(R) 수정이 부여된 적 적중 시 기절 지속 시간 0.6초 → 0.7초"),
  hotfixChange(1, "nerf", "단검 무기 숙련도", "단검 무기 숙련도 레벨 당 기본 공격 증폭 2.4% → 2.1%", [15]),
  hotfixChange(89, "nerf", "컴뱃 롤(E)", "컴뱃 롤(E) 쿨다운 13/12.5/12/11.5/11초 → 14/13.5/13/12.5/12초")
];

export function getBundledPatchChanges(characterCode?: number, weaponCode?: number) {
  return BUNDLED_PATCH_CHANGES.filter((item) =>
    (characterCode === undefined || item.character_code === characterCode) &&
    patchChangeAppliesToWeapon(item, weaponCode)
  );
}

export function patchChangeAppliesToWeapon(change: PatchChange, weaponCode?: number) {
  if (!change.weapon_codes?.length) return true;
  return weaponCode !== undefined && change.weapon_codes.includes(weaponCode);
}

export function mergePatchChanges(...groups: PatchChange[][]) {
  const unique = new Map<string, PatchChange>();
  for (const item of groups.flat()) {
    const key = `${item.patch_version}:${item.character_code}:${item.change_type}:${item.raw_change_text}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()].sort((left, right) =>
    right.patch_version.localeCompare(left.patch_version, undefined, { numeric: true })
  );
}

export function patchChangeLabel(type: PatchChange["change_type"]) {
  if (type === "buff") return "버프";
  if (type === "nerf") return "너프";
  if (type === "bugfix") return "버그 수정";
  if (type === "indirect") return "간접 변경";
  return "조정";
}

export function patchSourceUrl(patchVersion: string) {
  if (patchVersion === "12.3") return PATCH_12_3_SOURCE_URL;
  if (patchVersion === "12.2b") return PATCH_12_2B_SOURCE_URL;
  if (patchVersion === "12.2") return PATCH_12_2_SOURCE_URL;
  return null;
}

export function patchChangeSections(
  change: Pick<PatchChange, "target_name" | "raw_change_text">
) {
  const targets = (change.target_name ?? "")
    .split(/\s+\/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const details = change.raw_change_text
    .split(/\s+·\s+|\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (targets.length === details.length) {
    return targets.map((target, index) => ({ target, details: [details[index]] }));
  }

  return [{ target: change.target_name, details }];
}
