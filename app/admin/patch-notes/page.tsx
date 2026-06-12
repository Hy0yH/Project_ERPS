import { AdminImportForm } from "@/components/AdminImportForm";
import { SetupNotice } from "@/components/SetupNotice";

export default function AdminPatchNotesPage() {
  return (
    <>
      <section className="page-head">
        <div>
          <h1>패치노트 import</h1>
          <p>공식 패치노트 URL을 가져와 원문과 초벌 변경 내역을 저장합니다.</p>
        </div>
      </section>
      <div className="stack">
        <SetupNotice />
        <AdminImportForm />
      </div>
    </>
  );
}
