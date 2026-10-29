import type {
  CombatArchetypeReviewStatus,
  CombatFunction,
  CombatMetricWeightId,
  CombatRangeProfile,
  CombatScoreProfile
} from "@/lib/combat-archetypes";
import type { PlayerMatchDetails } from "@/lib/match-details";
import type { BuildMeta, BuildStats } from "@/lib/build-stats";

export type Confidence = "high" | "medium" | "low";

export type Character = {
  character_code: number;
  name_ko: string;
  name_en: string | null;
  role: string | null;
  official_archetype_primary?: string | null;
  official_archetype_secondary?: string | null;
  official_range_type?: string | null;
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
  weapon_codes?: number[];
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
  teammates?: Array<{ nickname?: string; characterCode?: number; weaponCode?: number }>;
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
  scoreBreakdown?: Array<{ key: string; label: string; score: number; weight: number; contribution: number }>;
};

export type RecommendationContext = {
  buildMeta?: BuildMeta;
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
  teammateProfiles?: Array<{ nickname: string; characterCode: number; weaponCode?: number; games: number }>;
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
  | "view_contribution_per_minute"
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
  | "insufficient_peer_history"
  | "not_applicable";

export type PlayerAnalysisMetric = {
  id: PlayerAnalysisMetricId;
  label: string;
  value: number;
  unit: "count" | "per_minute" | "percent" | "rank" | "mmr";
  direction: "higher" | "lower";
  cohort_mean: number | null;
  same_pick_mean: number | null;
  role_mean: number | null;
  reference_mean: number | null;
  reference_value: number | null;
  reference_type: "same_pick" | "role" | "mmr" | null;
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
  player_scope: {
    kind: "main_pick" | "all_picks";
    character_code: number | null;
    weapon_code: number | null;
    patch_key: string | null;
    current_patch_games: number;
    supplemental_games: number;
    unknown_patch_games: number;
  };
  recent_trend: {
    recent_games: number;
    previous_games: number;
    recent_value: number;
    previous_value: number;
    delta_absolute: number;
  } | null;
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

export type PlayerPickGrade = "S" | "A+" | "A" | "B+" | "B" | "C+" | "C" | "D+" | "D" | "F+" | "F";

export type PlayerPickEvaluation = {
  grade: PlayerPickGrade | null;
  score: number | null;
  status: "rated" | "provisional" | "insufficient_player_games" | "insufficient_benchmark";
  confidence: Confidence;
  reason: string;
  basis: "mmr_results" | "match_results";
  metrics: Array<{
    id: "average_rank" | "top3_rate" | "win_rate";
    label: string;
    weight: number;
    value: number;
    reference_mean: number | null;
    percentile: number | null;
    adjusted_score: number | null;
    sample_games: number;
    sample_players: number;
  }>;
  details: {
    damage_per_minute: number | null;
    deaths_per_game: number | null;
    mmr_gain_per_game: number | null;
  };
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
  evaluation: PlayerPickEvaluation;
};

export type PlayerAnalysisInsight = {
  id: string;
  title: string;
  detail: string;
  metric_ids: PlayerAnalysisMetricId[];
  hypothesis: string | null;
  action: string | null;
  review: string | null;
  coaching_note?: string;
};

export type PlayerAnalysisStatistics = {
  games: number;
  metrics: Array<{
    id: string;
    label: string;
    group: PlayerAnalysisDimensionKey;
    unit: "count" | "minutes" | "seconds" | "mmr" | "percent" | "rank";
    value: number | null;
    total: number | null;
    sample_games: number;
  }>;
};

export type PlayerAnalysis = {
  build_meta?: BuildMeta[];
  build_usage?: BuildStats;
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
    excluded_games: number;
    latest_game_at: string | null;
    confidence: Confidence;
    selected_pick_key?: string;
    available_games?: number;
    analysis_version?: number;
  };
  pick_profile: {
    concentration: number;
    unique_picks: number;
    picks: PlayerAnalysisPick[];
  };
  available_picks?: Array<{ character_code: number; character_name: string; weapon_code: number; weapon_name: string; games: number }>;
  combat_context: {
    score_profile: CombatScoreProfile;
    label: string;
    range_profile: CombatRangeProfile;
    primary_function: CombatFunction;
    secondary_function: CombatFunction | null;
    classification_confidence: Confidence;
    review_status: CombatArchetypeReviewStatus;
    classification_version: number;
    benchmark_eligible: boolean;
    metric_weights: Record<CombatMetricWeightId, number>;
    reference_type: "same_pick" | "role" | "mmr" | null;
  } | null;
  dimensions: PlayerAnalysisDimension[];
  statistics: PlayerAnalysisStatistics;
  recent_matches: Array<{
    game_id: number;
    started_at: string;
    character_code: number;
    weapon_code: number;
    rank: number;
    damage: number | null;
    deaths: number | null;
    active_seconds: number | null;
    mmr_gain: number | null;
    details?: PlayerMatchDetails;
  }>;
  strengths: PlayerAnalysisInsight[];
  improvement_priorities: PlayerAnalysisInsight[];
  feedback: {
    status: "ready" | "insufficient_evidence" | "no_clear_weakness" | "insufficient_action_evidence";
    message: string;
    reliable_metrics: number;
    total_actionable_metrics: number;
  };
  ai_summary: string;
  benchmark_coverage: {
    mmr_bucket_start: number | null;
    mmr_bucket_end: number | null;
    expanded: boolean;
    overall_games: number;
    overall_players: number;
    same_pick_games: number;
    same_pick_players: number;
    role_games: number;
    role_players: number;
    minimum_overall_games: number;
    minimum_overall_players: number;
    minimum_same_pick_games: number;
    minimum_same_pick_players: number;
    minimum_role_games: number;
    minimum_role_players: number;
    minimum_combat_peer_games: number;
  };
  caveats: string[];
  generated_at: string;
  cache_status?: "fresh" | "stale" | "miss";
};
