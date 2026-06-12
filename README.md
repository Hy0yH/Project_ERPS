# ERPS - Eternal Return Pick System

이터널 리턴의 미스릴 이상 랭크 스쿼드 데이터를 수집해 캐릭터 메타, 2인/3인 조합, 패치 영향, 추천 픽을 제공하는 MVP입니다.

## 구현된 범위

- Next.js App Router 기반 화면: 홈, 캐릭터 티어, 캐릭터 상세, 추천, 플레이어 요약, 패치노트 관리자
- API 라우트: 플레이어 요약, 캐릭터 메타, 패치 히스토리, 조합 조회, 추천, 패치노트 import, 배치 수집, 스냅샷 생성
- Supabase Postgres 마이그레이션과 `player_summary` RPC
- Eternal Return Open API 수집 서비스와 12시간 Vercel Cron 설정
- OpenAI Responses API 기반 한국어 추천 설명
- 통계/조합/추천 핵심 순수 로직 테스트

## 시작

1. 의존성을 설치합니다.
   ```bash
   pnpm install
   ```
2. `.env.example`을 참고해 `.env.local`을 채웁니다.
3. `supabase/migrations/001_initial_schema.sql`을 Supabase에 적용합니다.
4. 개발 서버를 실행합니다.
   ```bash
   pnpm dev
   ```

## 배치 순서

1. `POST /api/cron/collect-rankers`
2. `POST /api/cron/build-snapshots`

둘 다 `CRON_SECRET`을 `Authorization: Bearer ...` 또는 `x-cron-secret`으로 전달해야 합니다.

## 관리자

`/admin/patch-notes`에서 공식 패치노트 URL을 입력하면 원문과 초벌 변경 내역을 저장합니다. `ADMIN_TOKEN`을 입력해야 import API가 동작합니다.
