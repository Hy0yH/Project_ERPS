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
  weapon_code: number;
  weapon_name: string;
  display_name: string;
  games: number;
  pick_rate: number;
  win_rate: number;
  top3_rate: number;
  average_rank: number;
  confidence_score: number;
  tier: string;
  rank_scope: string;
  sample_status: "insufficient" | "provisional" | "standard" | "high";
};

export type RecommendedCharacter = Character &
  Partial<Pick<CharacterMeta, "weapon_code" | "weapon_name" | "display_name" | "tier">>;

export type TeamCompStat = {
  comp_key: string;
  character_codes: number[];
  character_weapon_keys: string[];
  character_names: string[];
  comp_name: string;
  tier: string;
  comp_size: number;
  games: number;
  wins: number;
  top3: number;
  win_rate: number;
  top3_rate: number;
  average_rank: number;
  confidence_score: number;
};

export type PatchVersion = {
  patch_key: string;
  version_season: number;
  version_major: number;
  version_minor: number;
  patch_start_at: string;
  latest_match_at: string;
};

export type SnapshotSummary = {
  scope: "current_patch" | "rolling_period";
  patch_key: string | null;
  period_days: number;
  period_start: string;
  period_end: string;
  sample_players: number;
  character_count: number;
  comp_count: number;
  rank_scope: string;
};

export type PlayerCharacterSummary = {
  character_code: number;
  weapon_code?: number;
  games: number;
  wins: number;
  top3: number;
  win_rate: number;
  top3_rate: number;
  average_rank: number;
  average_kills?: number;
  average_assists?: number;
  average_damage_to_player?: number;
  average_damage_from_player?: number;
  average_basic_damage?: number;
  average_skill_damage?: number;
  average_heal_amount?: number;
  average_team_recover?: number;
  average_protect_absorb?: number;
  average_view_contribution?: number;
  average_vision_actions?: number;
  average_survivable_time?: number;
  average_cc_time_to_player?: number;
};

export type PlayerSummary = {
  user_num: number;
  nickname: string;
  total_games: number;
  collected_at?: string;
  favorite_characters: PlayerCharacterSummary[];
};

export type PlayerDataScope = "season" | "current_patch";

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
  teammateCharacterCodes?: number[];
  playerDataScope?: PlayerDataScope;
  limit?: number;
};

export type Recommendation = {
  character: RecommendedCharacter;
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
    metaGames: number;
    metaWinRate: number;
    metaTop3Rate: number;
    metaAverageRank: number;
  };
  context: RecommendationContext;
  explanation: string;
  patchSummary: string[];
};

export type RecommendationContext = {
  source: "selected_teammates" | "global_comp" | "global_meta";
  title: string;
  dataScope: PlayerDataScope;
  baseCharacters: RecommendationContextCharacter[];
  playerPerformance?: PlayerCharacterSummary;
  compName?: string;
  compGames?: number;
  compWinRate?: number;
  compTop3Rate?: number;
  compAverageRank?: number;
  collectionNotice?: string;
  details: string[];
};

export type RecommendationContextCharacter = {
  character_code: number;
  name_ko: string;
  games?: number;
  win_rate?: number;
  top3_rate?: number;
  average_rank?: number;
  average_damage_to_player?: number;
  average_damage_from_player?: number;
  average_heal_amount?: number;
  average_team_recover?: number;
  average_protect_absorb?: number;
  average_view_contribution?: number;
  average_vision_actions?: number;
  average_survivable_time?: number;
  average_cc_time_to_player?: number;
};

export type PlayerAnalysisMetricId =
  | "damage_per_minute"
  | "kill_participation"
  | "cc_per_minute"
  | "hunts_per_minute"
  | "monster_damage_per_minute"
  | "weapon_level_per_minute"
  | "credits_per_minute"
  | "support_per_minute"
  | "vision_actions_per_minute"
  | "top3_rate"
  | "win_rate"
  | "average_rank"
  | "mmr_gain"
  | "rank_stability";

export type PlayerAnalysisDimensionKey =
  | "combat"
  | "growth"
  | "farming"
  | "team"
  | "vision"
  | "stability";

export type PlayerAnalysisComparisonStatus =
  | "available"
  | "insufficient_cohort"
  | "same_pick_required"
  | "insufficient_player_games"
  | "insufficient_peer_history";

export type PlayerAnalysisMetric = {
  id: PlayerAnalysisMetricId;
  label: string;
  value: number;
  unit: "count" | "per_minute" | "percent" | "rank" | "mmr";
  direction: "higher" | "lower";
  cohort_mean: number | null;
  same_pick_mean: number | null;
  reference_mean: number | null;
  reference_value: number | null;
  reference_type: "same_pick" | "mmr" | null;
  delta_percent: number | null;
  delta_absolute: number | null;
  relative_score: number | null;
  raw_percentile: number | null;
  score_reliability: number;
  comparison_status: PlayerAnalysisComparisonStatus;
  comparison_note: string | null;
  player_games: number;
  sample_games: number;
  sample_players: number;
  confidence: Confidence;
};

export type PlayerAnalysisDimension = {
  key: PlayerAnalysisDimensionKey;
  label: string;
  score: number | null;
  confidence: Confidence;
  available_metrics: number;
  total_metrics: number;
  metrics: PlayerAnalysisMetric[];
};

export type PlayerAnalysisPick = {
  character_code: number;
  character_name: string;
  weapon_code: number;
  weapon_name: string;
  games: number;
  pick_rate: number;
  win_rate: number;
  top3_rate: number;
  average_rank: number;
};

export type PlayerAnalysisInsight = {
  title: string;
  detail: string;
  metric_ids: PlayerAnalysisMetricId[];
};

export type PlayerAnalysis = {
  player: {
    user_num: number;
    nickname: string;
    mmr: number | null;
    rank: number | null;
    server_rank: number | null;
    rank_percent: number | null;
  };
  scope: {
    season_id: number;
    patch_key: string | null;
    requested_games: number;
    analyzed_games: number;
    supplemental_games: number;
    latest_game_at: string | null;
    confidence: Confidence;
  };
  pick_profile: {
    concentration: number;
    unique_picks: number;
    picks: PlayerAnalysisPick[];
  };
  dimensions: PlayerAnalysisDimension[];
  strengths: PlayerAnalysisInsight[];
  improvement_priorities: PlayerAnalysisInsight[];
  ai_summary: string;
  benchmark_coverage: {
    mmr_bucket_start: number | null;
    mmr_bucket_end: number | null;
    expanded: boolean;
    overall_games: number;
    overall_players: number;
    same_pick_games: number;
    same_pick_players: number;
    minimum_overall_games: number;
    minimum_overall_players: number;
    minimum_same_pick_games: number;
    minimum_same_pick_players: number;
  };
  caveats: string[];
  generated_at: string;
  cache_status?: "fresh" | "stale" | "miss";
};
