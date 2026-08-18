const WEAPON_NAMES_KO: Record<number, string> = {
  1: "\uae00\ub7ec\ube0c",
  2: "\ud1a4\ud30c",
  3: "\ubc29\ub9dd\uc774",
  4: "\ucc44\ucc0d",
  5: "\ud22c\ucc99",
  6: "\uc554\uae30",
  7: "\ud65c",
  8: "\uc11d\uad81",
  9: "\uad8c\ucd1d",
  10: "\ub3cc\uaca9\uc18c\ucd1d",
  11: "\uc800\uaca9\ucd1d",
  13: "\ub9dd\uce58",
  14: "\ub3c4\ub07c",
  15: "\ub2e8\uac80",
  16: "\uc591\uc190\uac80",
  17: "\uc7a5\ubcd1\uae30",
  18: "\uc30d\uac80",
  19: "\ucc3d",
  20: "\uc30d\uc808\uace4",
  21: "\ub808\uc774\ud53c\uc5b4",
  22: "\uae30\ud0c0",
  23: "\uce74\uba54\ub77c",
  24: "\uc544\ub974\uce74\ub098",
  25: "VF\uc758\uc218"
};

const WEAPON_TYPE_BY_CODE: Record<number, string> = {
  1: "Glove",
  2: "Tonfa",
  3: "Bat",
  4: "Whip",
  5: "HighAngleFire",
  6: "DirectFire",
  7: "Bow",
  8: "CrossBow",
  9: "Pistol",
  10: "AssaultRifle",
  11: "SniperRifle",
  13: "Hammer",
  14: "Axe",
  15: "OneHandSword",
  16: "TwoHandSword",
  17: "Polearm",
  18: "DualSword",
  19: "Spear",
  20: "Nunchaku",
  21: "Rapier",
  22: "Guitar",
  23: "Camera",
  24: "Arcana",
  25: "VFArm"
};

export function weaponName(weaponCode: number | null | undefined) {
  const code = Number(weaponCode ?? 0);
  if (!code) return "\ubb34\uae30 \ubbf8\uc0c1";
  return WEAPON_NAMES_KO[code] ?? `\ubb34\uae30 ${code}`;
}

export function weaponType(weaponCode: number | null | undefined) {
  return WEAPON_TYPE_BY_CODE[Number(weaponCode ?? 0)];
}

export function isCharacterWeapon(
  characterWeaponTypes: string[] | null | undefined,
  weaponCode: number
) {
  const type = weaponType(weaponCode);
  return Boolean(type && characterWeaponTypes?.includes(type));
}

export function characterWeaponKey(characterCode: number, weaponCode: number) {
  return `${characterCode}:${weaponCode || 0}`;
}

export function parseCharacterWeaponKey(key: string) {
  const [characterCode, weaponCode] = key.split(":").map(Number);
  return {
    characterCode: Number.isFinite(characterCode) ? characterCode : 0,
    weaponCode: Number.isFinite(weaponCode) ? weaponCode : 0
  };
}
