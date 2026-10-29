# 데이터 수집 안정성 보완

기준일: **2026-10-29 KST**. 관련 변경: [CHG-022](change-log.md#chg-022).

## 구현 결과

| 문제 | 변경 |
| --- | --- |
| [ERPS-032](issue-log.md#erps-032) 참가자 중복 | UID 우선 키를 개인·정기 수집에 공통 적용. 기존 UID 해시 형식은 유지. 경기 전체 저장은 해당 경기의 참가자를 한 트랜잭션에서 교체하며, 부분 저장은 동일 식별자의 기존 행을 정리 |
| [ERPS-033](issue-log.md#erps-033) 부분 전적의 완료 오인 | 전체 상세를 검증한 경기에만 완료 시각·실제 참가자 수·분석/상세 버전 저장. 개인 부분 저장은 완료 표시를 만들지 않고 기존 전체 상세를 덮어쓰지 않음 |
| [ERPS-034](issue-log.md#erps-034) 실패 경기 누락 | 일시 오류는 시도 횟수와 관계없이 지연 재시도. 영구 HTTP 오류는 `dead_letter`로 분리. 인증된 선택 재개 API와 관리자 화면 추가 |
| [ERPS-035](issue-log.md#erps-035) 실행 상태 잔존 | DB의 시작/heartbeat/종료 RPC로 소유권 확인. 30초 heartbeat·10분 lease, 만료 실행의 중단 분류와 해당 큐 선점 회수. 종료 기록 오류는 성공 응답으로 숨기지 않음 |
| [ERPS-036](issue-log.md#erps-036) 전체 실패의 성공 분류 | 정상 0건·일부 실패·전체 실패를 구분. 전체 실패는 HTTP 503, 일부 실패는 명시적 상태와 정제한 코드·건수 제공 |
| [ERPS-006 / QA-005](issue-log.md#erps-006) 중간 집계 공개 | 250행씩 임시 저장하고 건수·집계 범위·lease를 검증한 뒤 세 집계 테이블을 한 DB 트랜잭션으로 교체. 중간 오류 시 이전 결과와 준비 배치 보존 |

수집 시즌은 양의 정수를 요구한다. 수집 한도·시간·재시도 설정은 정수와 허용 범위를 검사하며 음수·소수·무한값을 조용히 사용하지 않는다. 잘못된 경기 시각은 현재 시각으로 대체하지 않고 저장을 거부한다. 전체 응답의 중복 참가자·다른 경기 ID 혼입·잘못된 필수 식별/순위/팀 값도 저장 전에 거부한다.

## 데이터베이스 계약

마이그레이션: [20261029121254_collection_reliability.sql](../supabase/migrations/20261029121254_collection_reliability.sql). 공식 Supabase CLI의 `migration new collection_reliability`로 생성했다. 기존 001~009 이후에 적용한다.

- `matches`: `detail_collected_at`, `detail_player_count`, `detail_analysis_version`, `detail_build_version`. 과거 경기에는 완료를 추정해 채우지 않는다.
- `match_ingestion_queue`: 다음 처리 가능 시각과 선점 실행 ID, `dead_letter` 상태. 기존 failed/attempts=4 행도 보존하며 다음 처리 대상이 될 수 있다.
- `ingestion_runs`: heartbeat·lease 토큰·단계, `partial_success`·`interrupted` 상태. 기존 heartbeat는 마지막 종료/시작 시각으로 보완한다. 과거 running 기록을 마이그레이션 시 임의로 성공 처리하지 않는다.
- `snapshot_staging_batches`: 공개 전 임시 결과. 공개 실패 시 배치는 남고 live 테이블 변경은 롤백한다. 후속 실행 시작 때 종료된 준비 작업을 정리한다. 영구적인 배치 계산 재개 기능은 이번 범위가 아니며 다음 실행에서 다시 계산한다.
- RPC는 `SECURITY INVOKER`와 빈 search path를 사용하며 `anon`·`authenticated`·`PUBLIC`의 실행 권한을 회수하고 서버 `service_role`에만 부여했다. 임시 테이블에는 RLS를 적용했다.

개인 저장과 전체 저장은 경기 행 잠금으로 직렬화한다. 전체 상세가 있는 경기에 개인 전적을 추가해 기존 상세가 낮은 정보량으로 바뀌는 것을 막는다. 자동 과거 전체 정리나 닉네임만으로 다른 UID를 통합하는 작업은 수행하지 않는다. 현재 패치의 완료 표시가 없는 경기는 실행당 한도 내에서 다시 받아 검증한다.

집계 공개는 기존 세 테이블을 같은 트랜잭션에서 변경하는 방식이다. 공개 포인터나 새 스냅샷 버전별 조회 API를 추가하지 않아 기존 읽기 경로와 호환된다. 공개 시각을 모든 행에 동일하게 사용하며 준비 결과는 읽기 API에 노출되지 않는다. 트랜잭션 공개 중 오류는 앞서 반영한 집계 테이블도 되돌린다. 이미 캐시된 응답의 TTL이나 서로 다른 요청 사이에 새 집계가 공개되는 경계까지 하나의 읽기 트랜잭션으로 묶는 것은 아니다.

## 운영 적용 순서

이 작업은 코드·마이그레이션·GitHub 반영 범위다. 운영 DB 적용, 예약 작업 재시작, 프로덕션 웹 배포는 아직 수행하지 않았다.

1. 운영 DB와 `.scheduler/collection-state.json`의 백업·현재 실행 상태를 확인한다.
2. 기존 예약 수집과 개인 전적을 저장하는 이전 웹 코드의 쓰기를 중단한다. 이전·새 writer를 병행하지 않는다.
3. 기존 001~009 적용 여부를 확인한 뒤 새 마이그레이션을 트랜잭션으로 적용하고 아래 읽기 전용 사전 조회로 계약을 확인한다.
4. 새 웹 코드와 수집 서버를 배포·빌드한다. 기본 `.next`의 빌드는 전용 서버가 중단된 상태에서 수행한다. 이 작업의 빌드 검증은 운영 서버의 `.next`를 유지하도록 `.next-qa`에 했다.
5. 수집을 한 번 실행해 현재 패치의 기존 경기도 완료 표시와 함께 보완되는지 확인하고 집계를 실행한다. 현재 패치의 후보가 많으면 한도 내에서 후속 실행에 이어진다. 초기 집계는 재검증 완료된 경기 범위만 포함한다.
6. 성공/일부 실패/실패 상태, 재시도 예정·확인 필요 건수, heartbeat·완료 시각, 운영 API의 새 집계를 확인하고 예약 수집을 재개한다.

```sql
select to_regprocedure('public.save_ingested_game(jsonb,jsonb,boolean)') as game_writer,
       to_regprocedure('public.begin_ingestion_run(text,uuid)') as job_lease,
       to_regprocedure('public.publish_snapshot_build(bigint,uuid,integer,timestamptz,timestamptz,text,jsonb)') as snapshot_publish,
       to_regprocedure('public.retry_ingestion_matches(bigint[])') as selected_retry;
select column_name from information_schema.columns
where table_schema='public' and table_name='matches' and column_name like 'detail_%';
```

문제 발생 시 먼저 쓰기를 중단한다. 이전 writer는 완료 표시·lease를 모르므로 스키마가 남아 있다는 이유만으로 함께 실행하거나 바로 이전 코드로 되돌려 쓰기를 재개하지 않는다. 운영 롤백은 해당 데이터 범위와 완료 표시 정합성을 점검한 뒤 진행한다.

## 재시도와 관리자 API

`next_retry_at`은 최소 1분부터 시도 횟수에 따라 증가하고 최대 6시간이다. 실제 재처리는 이 시각 이후의 다음 예약 실행에서 이루어진다. 요청 내부의 API 재시도와 경기 큐의 재시도는 별개다. 403/429·5xx·통신 오류는 지연 재시도하고 400/401/404/410/422는 확인 필요로 구분한다. 인증 설정 등 원인을 고친 뒤 필요한 행을 선택해 재개한다.

`POST /api/admin/operations`는 기존 `ADMIN_TOKEN` 인증을 요구하고 본문은 `{"gameIds":[100,101]}` 형태다. 1~100개의 중복 없는 양의 안전한 정수만 허용하며 failed/dead_letter 행만 pending으로 바꾼다. 경기 ID를 추측해 전체 큐를 일괄 초기화하지 않는다. `/admin/operations`에 같은 기능을 제공한다.

## 검증 결과와 제한

- Windows, Vitest 3.2.4: **43파일·294테스트 통과**, 타입 검사 통과.
- PGlite 0.5.13의 실제 Postgres 엔진에서 기존 001~009와 새 마이그레이션을 순서대로 적용하고 쿼리·함수 실행을 검증했다. 경기 저장 순서·9/24명 응답·부분 8행·중복 정리·쓰기 실패 롤백, 집계 세 테이블 공개/후속 실패 롤백·누락 배치·범위 불일치, lease 소유권·만료 큐 회수, 선택 재개와 함수 권한/RLS를 확인했다.
- 인증 실패·잘못된 관리자 입력은 DB 쓰기 전에 차단하고 DB 오류의 내부 문자열을 응답에 노출하지 않는 API 검사를 추가했다. 종료 기록 실패·heartbeat 소유권 상실·타이머 종료와 전체 실패 상태도 확인했다.
- 별도 `.next-qa`의 프로덕션 빌드 성공. 최종 소스 검증 결과는 [검증 증거](evidence/collection-reliability-validation-2026-10-29.json)에 기록한다.
- 실제 Supabase Data API를 통한 새 RPC 호출, 여러 OS 프로세스의 동시 부하, 대규모 운영 집계, Windows 다음 예약 실행과 브라우저 화면은 미검증이다. 단일 연결 엔진의 lease 조건 검사는 실제 다중 연결 경합 검증을 대신하지 않는다.
- 상위 API 키의 프로세스 간 합산 제한(QA-010), 탐색 페이지별 영구 커서 저장, 외부 알림과 장기 표본 대표성 지표는 이번 변경 범위가 아니다.
