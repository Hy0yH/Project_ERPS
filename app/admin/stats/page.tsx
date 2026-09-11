import { AdminStatsForm } from "@/components/AdminStatsForm";

export default function AdminStatsPage() {
  return (
    <>
      <section className="page-head">
        <div className="headline-block">
          <span className="headline-slash" aria-hidden="true" />
          <h1>내부 통계</h1>
          <p>관리자 토큰으로 최신 집계 현황을 확인합니다.</p>
        </div>
      </section>
      <AdminStatsForm />
    </>
  );
}
