import { buildPlayerAnalysis } from "@/lib/player-analysis";

export function playerFeedbackFixture() {
  const base = {
    character_code: 1, best_weapon: 1, game_rank: 4, player_kill: 1, player_assistant: 0,
    team_kill: 8, monster_kill: 10, best_weapon_level: 12, play_time: 1200,
    damage_to_monster: 4000, cc_time_to_player: 5, team_recover: 100, protect_absorb: 100,
    total_gain_vf_credit: 500, mmr_gain: 0, mmr_after: 7800, view_contribution: 20,
    version_season: 12, version_major: 6, version_minor: 0
  };
  const playerRows = Array.from({ length: 30 }, (_, index) => ({
    ...base, user_num: 999, game_id: 1000 + index, view_contribution: 40,
    damage_to_player: index < 10 ? 400 : 800,
    matches: { started_at: new Date(Date.UTC(2026, 9, 20, 0, -index)).toISOString(),
      version_season: 12, version_major: index < 20 ? 6 : 5, version_minor: 0 }
  }));
  const peers = Array.from({ length: 90 }, (_, index) => ({
    ...base, user_num: Math.floor(index / 3) + 1, game_id: index + 1,
    game_rank: index < 45 ? 2 : 6, damage_to_player: index < 45 ? 5000 : 1500,
    player_kill: index < 45 ? 3 : 2, player_assistant: index < 45 ? 4 : 2
  }));
  const analysis = buildPlayerAnalysis({ nickname: "피드백 검증", userNum: 999, playerRows, overallRows: peers,
    samePickRows: peers, characterNames: new Map([[1, "재키"]]), rank: { mmr: 7800 }, seasonId: 41,
    patchKey: "12.6.0", supplementalGames: 10, expandedBenchmark: false });
  analysis.pick_profile.picks[0].weapon_name = "단검";
  return analysis;
}
