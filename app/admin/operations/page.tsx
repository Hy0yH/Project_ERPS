import { OperationsPanel } from "@/components/OperationsPanel";
export default function OperationsPage() {
  return <><section className="page-head"><div className="headline-block"><h1>수집·집계 운영 상태</h1>
    <p>최근 성공·실패와 통계 갱신 시각, 경기 처리 대기열을 확인합니다.</p></div></section><OperationsPanel /></>;
}
