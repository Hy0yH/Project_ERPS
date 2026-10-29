// Investigation evidence for source commit f29f01c. REVIEW cases assert observed defects, not desired behavior.
// Generates isolated mocked tests only; does not contact real APIs or mutate operational data.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
fs.mkdirSync(path.join(root, '.scheduler'), { recursive: true });
let source = execFileSync('git', ['show', 'f29f01cce75486455269560e3b4518c33274c810:tests/collection-run.test.ts'], { cwd: root, encoding: 'utf8' });
source = source.replace('collectRankerMatches, CollectionBusyError', 'collectRankerMatches, CollectionBusyError, saveGame');
source = source.replace('select: () => query, order: () => query, or: () => query,', `select: () => query, order: () => query, or: () => query,
      neq: (key: string, value: unknown) => { predicates.push((row) => row[key] !== value); return query; },
      ilike: (key: string, value: string) => { predicates.push((row) => String(row[key]).toLowerCase() === value.toLowerCase()); return query; },
      delete: () => { operation = () => { const removed = selected(); tables[table] = tables[table].filter((row) => !removed.includes(row)); return removed; }; return query; },`);
const extra = `
  it('REVIEW-1: personal save followed by ranker save duplicates one UID', async () => {
    const detail = await fetchGame(100);
    const players = detail.gamePlayers as any[];
    players.forEach((player, index) => { delete player.userNum; player.uid = 'stable-user-' + index; });
    players[0].uid = 'stable-user';
    await saveGame({ gamePlayers: [players[0]] }, { identity: { userId: 'stable-user', nickname: 'player-0' } });
    expect(tables.match_players).toHaveLength(1);
    await saveGame(detail);
    expect(tables.match_players).toHaveLength(25);
    expect(tables.match_players.filter((row) => row.external_user_id === 'stable-user')).toHaveLength(2);
  });

  it('REVIEW-2: four failed queue attempts disappear from retry and pending count', async () => {
    vi.mocked(fetchUserGamesPageByUserId).mockResolvedValue({ userGames: [] });
    vi.mocked(fetchGame).mockClear();
    vi.mocked(fetchGame).mockRejectedValue(new Error('temporary outage'));
    tables.match_ingestion_queue = [{ game_id: 100, status: 'pending', attempts: 0, game_started_at: null }];
    const results = [];
    for (let attempt = 0; attempt < 5; attempt++) results.push(await collectRankerMatches());
    expect(vi.mocked(fetchGame)).toHaveBeenCalledTimes(4);
    expect(tables.match_ingestion_queue[0]).toMatchObject({ status: 'failed', attempts: 4 });
    expect(results[3].failedMatches).toBe(1);
    expect(results[3].pendingMatches).toBe(0);
    expect(results[4].failedMatches).toBe(0);
    expect(results[4].pendingMatches).toBe(0);
  });

  it('REVIEW-3: all ranker history requests fail but run status is success', async () => {
    vi.mocked(fetchUserGamesPageByUserId).mockRejectedValue(new Error('temporary history outage'));
    const result = await collectRankerMatches();
    expect(result.failedRankers).toBe(1);
    expect(result.savedMatches).toBe(0);
    expect(tables.ingestion_runs[0].status).toBe('success');
    expect(tables.ingestion_runs[0].error_message).toContain('1 ranker history requests failed');
  });

  it('REVIEW-4: failed run-finalization update still returns successful result', async () => {
    const storage = database();
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from: (table: string) => {
      const query = storage.from(table);
      if (table === 'ingestion_runs') query.update = () => ({ eq: async () => ({ error: new Error('run finalization unavailable') }) });
      return query;
    } } as any);
    const result = await collectRankerMatches();
    expect(result.savedMatches).toBe(1);
    expect(tables.ingestion_runs[0].status).toBe('running');
    expect(tables.ingestion_runs[0].finished_at).toBeUndefined();
  });

  it('REVIEW-5: eight personal partial saves falsely complete a 24-player queued match', async () => {
    const detail = await fetchGame(100);
    const players = detail.gamePlayers as any[];
    for (const player of players.slice(0, 8)) {
      await saveGame({ gamePlayers: [player] }, { identity: { userId: 'uid-' + player.nickname, nickname: player.nickname } });
    }
    expect(tables.match_players).toHaveLength(8);
    tables.match_ingestion_queue = [{ game_id: 100, status: 'pending', attempts: 0, game_started_at: null }];
    vi.mocked(fetchUserGamesPageByUserId).mockResolvedValue({ userGames: [] });
    vi.mocked(fetchGame).mockClear();
    const result = await collectRankerMatches();
    expect(vi.mocked(fetchGame)).not.toHaveBeenCalled();
    expect(tables.match_players).toHaveLength(8);
    expect(result.savedMatches).toBe(0);
    expect(tables.match_ingestion_queue[0].status).toBe('completed');
  });
`;
const ending = source.lastIndexOf('});');
source = source.slice(0, ending) + extra + source.slice(ending);
fs.writeFileSync(path.join(root, '.scheduler', 'collection-review.test.ts'), source);

fs.writeFileSync(path.join(root, '.scheduler', 'collection-review.vitest.mjs'), "import { defineConfig } from 'vitest/config';\nimport { fileURLToPath } from 'node:url';\n\nexport default defineConfig({\n  test: { environment: 'node', include: ['.scheduler/collection-review.test.ts'] },\n  resolve: { alias: { '@': fileURLToPath(new URL('../', import.meta.url)) } }\n});\n");
