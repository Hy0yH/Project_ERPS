export type Confidence = "high" | "medium" | "low";

export type Character = {
  character_code: number;
  name_ko: string;
  name_en: string | null;
  role: string | null;
  weapon_types: string[] | null;
  is_active: boolean;
};

export type CharacterMeta = Character & {
  games: number;
  pick_rate: number;
  win_rate: number;
  top3_rate: number;
  average_rank: number;
  confidence_score: number;
  tier: string;
};

export type TeamCompStat = {
  comp_key: string;
  character_codes: number[];
  comp_size: number;
  games: number;
  wins: number;
  top3: number;
  win_rate: number;
  top3_rate: number;
  average_rank: number;
  confidence_score: number;
};

export type PlayerCharacterSummary = {
  character_code: number;
  games: number;
  wins: number;
  top3: number;
  win_rate: number;
  top3_rate: number;
  average_rank: number;
};

export type PlayerSummary = {
  user_num: number;
  nickname: string;
  total_games: number;
  favorite_characters: PlayerCharacterSummary[];
};

export type PatchChange = {
  patch_version: string;
  character_code: number;
  change_type: "buff" | "nerf" | "adjustment" | "bugfix" | "indirect";
  target_type: string | null;
  target_name: string | null;
  before_value: string | null;
  after_value: string | null;
  raw_change_text: string;
  impact_score: number;
  reviewed: boolean;
};

export type RecommendationInput = {
  nickname?: string;
  preferredCharacterCodes?: number[];
  teammateCharacterCodes?: number[];
  limit?: number;
};

export type Recommendation = {
  character: Character;
  score: number;
  confidence: Confidence;
  metrics: {
    metaScore: number;
    compScore: number;
    userScore: number;
    patchScore: number;
    games: number;
    winRate: number;
    top3Rate: number;
    averageRank: number;
  };
  explanation: string;
  patchSummary: string[];
};
