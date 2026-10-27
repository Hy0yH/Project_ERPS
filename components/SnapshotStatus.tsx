import { getOperationsStatus } from "@/lib/operations";
export async function SnapshotStatus() {
  const status = await getOperationsStatus();
  const format = (value: string | null) => value ? new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "집계 없음";
  return <section className="snapshot-status panel" aria-label="통계 갱신 기준">
    <strong>통계 갱신 기준</strong>
    {status.database !== "ready" ? <p role="status">{status.database === "unconfigured" ? "데이터 저장소가 아직 연결되지 않았습니다." : "최신 갱신 상태를 확인하지 못했습니다."}</p> : <>
      <span>실험체 {format(status.snapshots.characters)} · 조합 {format(status.snapshots.compositions)} (KST)</span>
      {status.inconsistent ? <p className="warn" role="status">실험체와 조합의 집계 시점이 다릅니다. 추천 근거의 기준 시각을 함께 확인해 주세요.</p> : null}
      {status.stale ? <p className="muted">일부 집계가 없거나 6시간 이상 지연되어 있습니다.</p> : null}
    </>}
  </section>;
}
