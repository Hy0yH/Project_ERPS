# ERPS - Eternal Return Pick System

[웹사이트 바로가기](https://project-erps.vercel.app/)

이터널 리턴 랭크 스쿼드 경기 데이터를 수집해 실험체·무기별 메타, 2인/3인 조합, 패치 영향, 개인화 픽 추천과 플레이스타일 분석을 제공하는 웹 애플리케이션입니다. 기본 메타 화면은 미스릴 이상 표본을 사용하며, 실험체 티어 화면에서 수집 전체 또는 티어별 범위를 선택할 수 있습니다.

## 주요 기능

- 현재 패치 기준 실험체·무기별 게임 수, 승률, TOP3, 평균 순위와 티어 제공
- 아이언부터 미스릴까지 단일 티어 및 특정 티어 이상 랭크 범위 지원
- 실제 완성된 스쿼드를 기준으로 한 2인/3인 조합 통계
- 닉네임, 이번 시즌 개인 성과, 선택한 팀원, 상위권 메타, 최근 패치를 함께 반영한 픽 추천
- 플레이어의 최근 30경기를 비슷한 MMR 및 같은 실험체·무기 코호트와 비교하는 플레이스타일 분석
- 교전, 성장, 파밍, 팀 기여, 시야, 안정성의 6개 영역과 표본 신뢰도·분석 한계 표시
- 공식 패치노트 URL import 및 실험체별 변경 내역 저장
- Eternal Return Open API 기반 증분 수집, 재시도 가능한 경기 큐, 랭커별 수집 커서
- 현재 패치 스냅샷과 플레이어 비교 벤치마크 생성

추천 설명은 저장된 통계를 기반으로 항상 생성됩니다. `OPENAI_API_KEY`를 설정하면 플레이어 분석의 요약과 코칭 문구만 Responses API로 보강하며, 키가 없거나 호출이 실패하면 근거 기반 기본 문구를 사용합니다. 데이터 수집 작업은 OpenAI나 Codex를 호출하지 않습니다.

## 기술 구성

- Next.js 16 App Router, React 19, TypeScript
- Supabase Postgres, `@supabase/supabase-js`
- Eternal Return Open API
- OpenAI Responses API(선택 사항)
- Vitest
- Vercel Cron 설정 및 Windows 예약 수집 스크립트

## 화면

| 경로 | 내용 |
| --- | --- |
| `/` | 메타 요약, 상위 실험체·조합, 닉네임 검색 |
| `/characters` | 14일 실험체·무기 티어 및 랭크 범위 필터 |
| `/characters/[code]` | 실험체 통계, 추천 조합, 패치 히스토리 |
| `/recommend` | 닉네임과 팀원 최대 2명을 반영한 추천 |
| `/players/[nickname]` | 개인 전적 수집 및 플레이스타일 분석 |
| `/admin/patch-notes` | 공식 패치노트 URL import |
| `/admin/stats` | 관리자 토큰 인증 후 집계된 캐릭터·무기 수 조회 |

## 로컬 실행

### 1. 의존성 설치

```bash
pnpm install
```

### 2. 환경 변수 설정

`.env.example`을 복사해 `.env.local`을 만들고 값을 입력합니다.

```powershell
Copy-Item .env.example .env.local
```

최소 실행에 필요한 값은 다음과 같습니다.

| 변수 | 용도 |
| --- | --- |
| `ETERNAL_RETURN_API_KEY` | 전적, 랭커, 게임 데이터 수집 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버의 DB 읽기·쓰기 |
| `ER_SEASON_ID` | 수집할 공식 API 랭크 시즌 ID |
| `ER_TARGET_PATCH` | 선택 사항. 비워 두면 DB의 최신 수집 패치를 자동 사용하며, 값이 최신 데이터보다 오래되면 최신 패치를 우선합니다. |
| `ADMIN_TOKEN` | 패치노트 import 및 내부 통계 조회 보호 |
| `CRON_SECRET` | 수집·스냅샷 API 보호 |

선택 설정은 다음과 같습니다.

| 변수 | 기본/예시 값 | 용도 |
| --- | --- | --- |
| `OPENAI_API_KEY` | 비어 있음 | 플레이어 분석 문구 보강 |
| `OPENAI_MODEL` | `gpt-5-mini` | 분석 문구 생성 모델 |
| `ER_MIN_MMR` | `.env.example`의 `7000` | 랭커 탐색 최소 MMR |
| `ER_BATCH_LIMIT` | `200` | 배치 처리 단위 |
| `ER_RANKER_MATCH_LIMIT` | `100` | 랭커 한 명당 최대 탐색 경기 |
| `ER_COLLECTION_MAX_NEW_MATCHES` | `1000` | 실행당 큐에서 처리할 최대 경기 |
| `ER_DISCOVERY_RANKERS_PER_RUN` | `120` | 실행당 새 경기를 탐색할 랭커 수 |
| `ER_DISCOVERY_TIME_BUDGET_MINUTES` | `45` | 랭커 탐색 시간 제한 |
| `ER_REQUEST_DELAY_MS` | `1000` | Eternal Return API 요청 간격(ms) |
| `ER_MAX_RETRIES` | `2` | API 재시도 횟수 |
| `ER_RECOMMEND_PLAYER_MATCH_LIMIT` | `5000` | 개인 추천 프로필 최대 수집 경기 |
| `ER_RECOMMEND_MIN_SAMPLE_GAMES` | `10` | 추천 보통 신뢰도 최소 표본 |
| `ER_RECOMMEND_HIGH_SAMPLE_GAMES` | `30` | 추천 높은 신뢰도 최소 표본 |
| `ER_ANALYSIS_PLAYER_MATCH_LIMIT` | `30` | 분석용 개인 경기 수집 한도 |
| `ER_ANALYSIS_PEER_GAME_LIMIT` | `5` | 즉시 상세 수집할 최근 경기 수 |
| `PLAYER_ANALYSIS_CACHE_HOURS` | `6` | 분석 결과 캐시 시간 |
| `PLAYER_ANALYSIS_ENABLED` | `true` | 플레이어 분석 기능 활성화 |

`ER_SEASON_ID`와 `ER_TARGET_PATCH`는 서로 다른 번호 체계입니다. 시즌 ID는 공식 API 값과 맞춰야 하며, 패치는 자동 전환을 위해 `ER_TARGET_PATCH`를 비워 두는 구성을 권장합니다. 새 패치를 미리 고정해야 할 때만 값을 지정하세요.

플레이어 분석은 `ER_SEASON_ID`가 없거나 유효한 양의 정수가 아니면 최근 랭크 스쿼드 경기의 시즌을 자동으로 확인합니다. 수집한 공식 경기에서 더 최신 시즌이 확인되면 해당 시즌을 사용하며, 개인 기록·비교 표본·순위·캐시는 모두 같은 시즌을 따릅니다. 시즌을 확인할 수 없으면 시즌 0으로 분석하지 않고 오류를 반환합니다. 정기 수집 작업에는 여전히 올바른 `ER_SEASON_ID` 설정이 필요합니다.

프로덕션에서는 `ADMIN_TOKEN`과 `CRON_SECRET`을 반드시 비어 있지 않은 강한 값으로 설정하세요. 기존 패치노트·수집 API는 해당 환경 변수가 없으면 토큰 검사를 생략합니다. 내부 통계 API(`/api/admin/stats`)는 `ADMIN_TOKEN`이 없으면 조회를 차단합니다. `SUPABASE_SERVICE_ROLE_KEY`은 브라우저 코드에 노출하면 안 됩니다.

### 3. 데이터베이스 적용

`supabase/migrations`의 SQL을 번호 순서대로 Supabase에 적용합니다.

| 파일 | 주요 변경 |
| --- | --- |
| `001_initial_schema.sql` | 경기, 참가자, 메타, 조합, 패치, 수집 이력 및 `player_summary` RPC |
| `002_weapon_split_snapshots.sql` | 실험체·무기별 스냅샷과 무기 조합 키 |
| `003_player_character_profiles.sql` | 시즌/현재 패치 개인 실험체 프로필 |
| `004_player_playstyle_analysis.sql` | 상세 플레이 지표, 비교 벤치마크, 분석 캐시 |
| `005_rank_scoped_snapshots.sql` | 티어별/티어 이상 랭크 범위 스냅샷 |
| `006_player_uid_identity.sql` | 최신 API의 외부 사용자 UID 저장 |
| `007_collection_queue.sql` | 증분 수집 커서와 경기 처리 큐 |

### 4. 개발 서버 실행

```bash
pnpm dev
```

기본 주소는 `http://localhost:3000`입니다. Supabase 환경 변수가 없어도 화면 골격은 열리지만 실제 데이터 조회·수집·추천·분석에는 위 설정과 마이그레이션이 필요합니다.

## 데이터 수집과 스냅샷

배치는 아래 순서로 실행합니다.

1. `POST /api/cron/collect-rankers`
2. `POST /api/cron/build-snapshots`

두 요청 모두 `CRON_SECRET`을 `Authorization: Bearer ...` 또는 `x-cron-secret` 헤더로 전달해야 합니다. 스냅샷 API는 `?periodDays=14`처럼 집계 기간을 받을 수 있습니다.

```powershell
$headers = @{ Authorization = "Bearer $env:CRON_SECRET" }
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/cron/collect-rankers -Headers $headers
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/cron/build-snapshots?periodDays=14" -Headers $headers
```

수집 파이프라인은 다음 순서로 동작합니다.

1. 실험체와 `CharacterMastery`를 동기화합니다.
2. 이전 실행에서 남은 `match_ingestion_queue`를 먼저 처리합니다.
3. 오래 확인하지 않은 랭커부터 제한된 인원·시간 범위에서 새 경기 ID를 찾습니다.
4. 발견한 경기는 큐에 저장하고, 랭커별 마지막 확인 지점은 `ranker_collection_cursors`에 기록합니다.
5. 상세 경기와 참가자를 저장한 뒤 현재 패치의 실험체·무기 메타, 조합, MMR 벤치마크를 생성합니다.

처리되지 않은 큐는 다음 실행에서 이어집니다. 허용되지 않은 실험체·무기 숙련 조합은 스냅샷에서 제외되며, 실험체 메타는 전체·단일 티어·특정 티어 이상 범위로 생성됩니다. 2인/3인 조합은 미스릴 이상 플레이어가 포함된 완성 스쿼드를 기준으로 집계됩니다.

배치 작업은 한 번에 오래 실행될 수 있으므로 Vercel Cron에는 등록하지 않습니다. 아래 Windows 예약 작업이 계속 Supabase 데이터를 갱신하며, Vercel에 배포된 웹사이트는 같은 Supabase 데이터를 읽습니다.

## GitHub 연동 웹 배포

이 앱은 서버 렌더링과 API 라우트를 사용하므로 정적 호스팅인 GitHub Pages가 아니라 Vercel에 GitHub 저장소를 연결해 배포합니다.

1. Vercel의 **New Project**에서 `Hy0yH/Project_ERPS` 저장소를 가져옵니다.
2. Framework Preset은 자동 감지된 `Next.js`를 사용하고 Root Directory는 저장소 루트로 둡니다.
3. `.env.local`의 필수 변수를 Vercel Project Settings의 Environment Variables에 동일하게 등록합니다. `OPENAI_API_KEY`는 선택 사항입니다.
4. Production Branch를 `main`으로 둔 채 배포합니다.

연결 후에는 `main` 브랜치에 푸시할 때마다 프로덕션 웹사이트가 자동으로 다시 배포됩니다. `.env.local`과 `SUPABASE_SERVICE_ROLE_KEY` 같은 비밀값은 GitHub에 커밋하지 않습니다.

## Windows 로컬 자동 수집

예약 작업은 별도의 Next.js 프로덕션 서버를 `3101` 포트에 실행하고, 2시간마다 수집과 스냅샷 생성을 순서대로 호출합니다.

먼저 프로덕션 빌드를 만들고 설정을 점검합니다.

```powershell
pnpm build
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\collect-scheduled.ps1 -DryRun
```

그다음 Windows 예약 작업을 등록합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\install-collection-schedule.ps1 -IntervalMinutes 120 -Port 3101 -RunNow
```

환경에 따라 예약 작업 등록 권한이 필요할 수 있습니다. 중복 실행은 잠금 파일로 차단하며, 오래된 잠금은 자동 정리합니다. 로그는 `.scheduler/collect.log`, 전용 서버 출력은 `.scheduler/next-dev.out.log`와 `.scheduler/next-dev.err.log`에서 확인할 수 있습니다.

```powershell
Get-Content .\.scheduler\collect.log -Tail 80
```

## 플레이어 추천과 분석

닉네임 없이 추천하면 현재 패치 메타와 상위권 조합을 중심으로 후보를 계산합니다. 닉네임을 입력하면 해당 시즌에 실제 사용한 실험체만 후보로 삼고, 최대 `ER_RECOMMEND_PLAYER_MATCH_LIMIT`판을 확인해 개인 전투·생존·지원·시야 기록을 반영합니다. 직접 선택한 팀원이 있으면 그 조합을 우선 제약으로 사용합니다.

플레이어 분석은 현재 패치 경기를 우선해 최대 30판을 사용하고, 부족하면 같은 시즌 기록으로 보완합니다. 기본 500 MMR 구간의 전체 코호트와 같은 실험체·무기 코호트를 비교하며 표본이 부족하면 인접 구간으로 확장합니다. 같은 픽 표본이 부족한 역할 의존 지표는 평가에서 제외하고, 결과에는 캐시 상태와 데이터 한계를 함께 표시합니다.

`004_player_playstyle_analysis.sql` 이후 마이그레이션이 모두 적용되어야 최신 분석과 UID 기반 수집이 정상 동작합니다. 출시 전 기능을 숨기려면 `PLAYER_ANALYSIS_ENABLED=false`로 설정할 수 있습니다.

## API

| 메서드 | 경로 | 설명 |
| --- | --- | --- |
| `GET` | `/api/characters/meta?periodDays=14&rankScope=above:mythril` | 실험체·무기 메타 |
| `GET` | `/api/characters/[characterCode]/patch-history` | 실험체 패치 내역 |
| `GET` | `/api/comps?characters=1,2&periodDays=14` | 포함 실험체 기준 조합 |
| `GET` | `/api/player/[nickname]/summary` | 저장된 플레이어 요약 |
| `POST` | `/api/player/[nickname]/analysis` | 플레이스타일 분석, 본문 `{ "forceRefresh": false }` |
| `POST` | `/api/recommendations` | 추천 계산 |
| `POST` | `/api/admin/patch-notes/import` | 패치노트 import |
| `POST` | `/api/cron/collect-rankers` | 랭커 경기 수집 |
| `POST` | `/api/cron/build-snapshots` | 메타·조합·벤치마크 생성 |

추천 요청 예시:

```json
{
  "nickname": "플레이어닉네임",
  "teammateCharacterCodes": [1, 2],
  "playerDataScope": "season",
  "limit": 5
}
```

`teammateCharacterCodes`는 최대 2개, `playerDataScope`는 `season` 또는 `current_patch`, `limit`은 1~10입니다.

패치노트 import는 `ADMIN_TOKEN`을 `Authorization: Bearer ...` 또는 `x-admin-token`으로 전달하고 본문에 `{ "url": "https://..." }`를 보냅니다.

## 검증

```bash
pnpm typecheck
pnpm test
pnpm build
```

테스트는 통계 점수와 표본 보정, 조합 추천, 랭크 범위, 무기 코드, Eternal Return 응답 호환성, 증분 수집·플레이어 식별, 패치노트 파싱, 플레이스타일 비교 로직을 다룹니다.
