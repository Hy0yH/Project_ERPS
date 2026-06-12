# 이터널 리턴 메타 분석/추천 웹 프로젝트 프롬프트

## 프로젝트 목표

이터널 리턴의 실험체 데이터를 기반으로 캐릭터 메타, 패치 영향, 팀 조합 성과, 추천 픽을 분석하는 웹사이트를 만든다.

기존 DAK.GG처럼 캐릭터 티어와 통계를 보여주는 데서 더 나아가, 2주마다 공개되는 공식 패치노트의 버프/너프 기록을 누적하고, 다음 패치 이후 특정 캐릭터의 평가가 오를지 내려갈지 예측하는 기능을 제공한다.

이터널 리턴은 3인 스쿼드 기반 게임이므로, 특정 캐릭터가 어떤 캐릭터들과 함께 플레이할 때 승률이나 TOP3 비율이 높은지도 분석한다. 최종적으로는 사용자의 주캐, 최근 많이 플레이한 캐릭터, 팀원 픽을 바탕으로 AI가 한국어로 추천 픽과 근거를 설명하는 서비스를 목표로 한다.

## MVP 범위

- 내 주캐 분석
- 최근 많이 플레이한 캐릭터 분석
- 캐릭터별 패치 버프/너프/조정 히스토리
- 2인/3인 캐릭터 조합 승률 및 TOP3 비율
- 캐릭터 티어표 및 메타 통계
- 한국어 설명형 AI 추천
- 관리자용 패치노트 수집/검수 흐름

## 데이터 전략

- 공식 Eternal Return Open API를 중심으로 데이터를 수집한다.
- DAK.GG는 UI와 지표 구성의 참고 자료로만 사용하고, 스크래핑하지 않는다.
- 공식 API에서 닉네임, 유저 번호, 최근 90일 매치, 단일 매치 상세, 게임 데이터 테이블을 수집한다.
- Top ranker API를 seed로 사용해 상위권 유저들의 최근 매치를 수집하고, gameId를 기준으로 중복 제거한다.
- 초기 분석 대상은 랭크 스쿼드 모드로 제한한다.
- 무료 티어 운영을 고려해 실시간 전체 수집이 아니라 6~24시간 주기 배치 수집으로 시작한다.

## 기술 방향

- Frontend/Backend: Next.js + TypeScript
- Database: Supabase Postgres
- Hosting: Vercel
- Batch/Scheduler: Vercel Cron 또는 Supabase Edge Function
- AI 추천 설명: OpenAI API 또는 호환 가능한 LLM API
- 환경 변수:
  - ETERNAL_RETURN_API_KEY
  - DATABASE_URL 또는 Supabase 관련 키
  - OPENAI_API_KEY

## 주요 화면

### 내 분석

- 닉네임 입력으로 유저를 조회한다.
- 주캐와 최근 많이 플레이한 캐릭터를 보여준다.
- 캐릭터별 최근 승률, TOP3 비율, 평균 순위, 플레이 수를 보여준다.
- 사용자의 플레이 성향과 현재 메타를 비교한다.

### 캐릭터 티어

- 캐릭터별 pick rate, win rate, TOP3 rate, average rank, 표본 수를 보여준다.
- 티어는 단순 승률만이 아니라 표본 수, TOP3, 평균 순위, 최근 패치 영향까지 반영한다.
- 필터는 기간, 시즌, 티어 구간, 캐릭터 역할군을 고려한다.

### 조합 분석

- 특정 캐릭터를 기준으로 같이 플레이했을 때 성과가 좋은 캐릭터를 보여준다.
- 2인 조합과 3인 조합을 분리해서 제공한다.
- 주요 지표는 games, wins, top3, winRate, top3Rate, avgRank다.
- 표본 수가 낮은 조합은 신뢰도 낮음으로 표시한다.

### 추천

- 사용자의 주캐 또는 최근 많이 플레이한 캐릭터를 기준으로 추천한다.
- 팀원 픽 1~2개가 입력되면 남은 한 자리 추천을 제공한다.
- 추천 결과는 점수, 핵심 지표, 패치 영향, AI 설명을 함께 제공한다.
- AI는 점수를 직접 만들지 않고, 이미 계산된 통계와 패치 근거를 한국어로 설명한다.

### 패치 히스토리

- 공식 패치노트의 Character 섹션을 수집한다.
- 캐릭터별 변경 내역을 버프, 너프, 조정, 버그 수정, 간접 영향으로 분류한다.
- 각 변경은 스킬/스탯, 이전 값, 변경 값, 영향 점수로 저장한다.
- 자동 분류 결과는 관리자 화면에서 수정 가능하게 한다.

## 주요 데이터 모델

### characters

- character_code
- name_ko
- name_en
- role
- weapon_types
- is_active

### matches

- game_id
- season_id
- matching_mode
- matching_team_mode
- version_season
- version_major
- version_minor
- server_name
- started_at

### match_players

- game_id
- user_num
- nickname
- team_number
- character_code
- game_rank
- player_kill
- player_assistant
- mmr_before
- mmr_gain
- mmr_after
- best_weapon
- equipment

### character_stats_snapshot

- character_code
- period_start
- period_end
- season_id
- tier_filter
- games
- pick_rate
- win_rate
- top3_rate
- average_rank
- confidence_score

### team_comp_stats

- comp_key
- character_codes
- comp_size
- period_start
- period_end
- games
- wins
- top3
- win_rate
- top3_rate
- average_rank
- confidence_score

### patch_notes

- patch_version
- published_at
- source_url
- raw_text
- imported_at

### character_patch_changes

- patch_version
- character_code
- change_type
- target_type
- target_name
- before_value
- after_value
- raw_change_text
- impact_score
- reviewed

## 추천 로직

추천 점수는 다음 요소를 조합한다.

- 조합 승률
- 조합 TOP3 비율
- 평균 순위
- 표본 수 기반 신뢰도
- 최근 패치 영향 점수
- 캐릭터 자체 메타 점수
- 사용자의 주캐 및 최근 플레이 이력

AI 설명은 다음 원칙을 따른다.

- 통계에 없는 사실을 단정하지 않는다.
- 추천 근거를 승률, TOP3, 표본 수, 패치 영향 중심으로 설명한다.
- 낮은 표본 수나 불확실한 예측은 명확히 말한다.
- 한국어로 짧고 실전적인 조언을 제공한다.

예시:

> 팀원이 레온과 아드리아나를 선택했다면, 현재 데이터에서는 특정 캐릭터가 TOP3 비율과 평균 순위에서 안정적인 편입니다. 최근 직접 너프도 없어 다음 패치 전까지는 무난한 추천 픽으로 볼 수 있습니다.

## API 설계 초안

- GET /api/player/:nickname/summary
- GET /api/characters/meta
- GET /api/characters/:characterCode/patch-history
- GET /api/comps?characters=...
- POST /api/recommendations
- POST /api/admin/patch-notes/import

## 테스트 계획

- PROJECT_PROMPT.md가 프로젝트 루트에 존재하는지 확인한다.
- 닉네임으로 userNum 조회가 성공/실패 케이스를 모두 처리하는지 확인한다.
- 같은 gameId가 중복 저장되지 않는지 확인한다.
- 랭크 스쿼드 필터가 정확히 적용되는지 확인한다.
- TOP3는 gameRank <= 3 기준으로 계산한다.
- 3인 조합은 캐릭터 코드를 정렬해 동일 조합으로 dedupe한다.
- 표본 수가 낮은 조합은 신뢰도 낮음으로 표시한다.
- 패치노트의 숫자 변경이 before/after로 파싱되는지 확인한다.
- 쿨다운 감소, 데미지 증가, 방어력 감소 등의 방향성이 올바르게 버프/너프로 분류되는지 확인한다.
- 팀원 픽 없음, 1개, 2개 입력 케이스에서 추천이 정상 동작하는지 확인한다.
- AI 설명이 통계 근거 밖의 내용을 단정하지 않는지 확인한다.

## 기본 가정

- 초기 언어는 한국어다.
- 초기 게임 모드는 랭크 스쿼드 중심이다.
- 공식 API 키는 별도로 신청하고 .env에 저장한다.
- 광고, 후원, 수익화는 공식 API 약관 이슈가 있으므로 MVP에서 제외한다.
- 오래된 패치노트는 공식 사이트에서 접근 가능한 범위부터 백필한다.
- 누락된 패치노트는 관리자 화면에서 수동 URL 등록을 허용한다.
- 첫 버전은 정확한 예측 모델보다 신뢰 가능한 통계 수집, 조합 분석, 설명형 추천에 집중한다.

## 참고 자료

- Eternal Return Open API 문서: https://developer.eternalreturn.io/static/media/Docs_EN_20250710.pdf
- Eternal Return API Terms of Use: https://support.playeternalreturn.com/hc/en-us/articles/49090866623257-API-Terms-of-Use-2025-07-22
- 공식 패치노트 예시: https://playeternalreturn.com/posts/news/3606
