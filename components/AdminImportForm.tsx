"use client";

import { FormEvent, useState } from "react";
import type { BuildPatchChange } from "@/lib/build-stats";

export function AdminImportForm() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [changes, setChanges] = useState<Array<BuildPatchChange & { id: number }>>([]);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setStatus("import 중");
    try {
    const response = await fetch("/api/admin/patch-notes/import", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": token
      },
      body: JSON.stringify({ url })
    });
    const json = await response.json();
    setStatus(response.ok ? `완료: 실험체 ${json.data.importedChanges}개, 아이템·특성·전술 스킬 ${json.data.importedBuildChanges}개 변경 감지` : json.error);
    setChanges(response.ok ? json.data.buildChanges ?? [] : []);
    } catch { setStatus("패치노트를 가져오지 못했습니다."); }
    finally { setPending(false); }
  }

  async function review(change: BuildPatchChange & { id: number }) {
    setPending(true);
    try {
      const response = await fetch("/api/admin/patch-notes/import", { method: "PATCH", headers: { "content-type": "application/json", "x-admin-token": token },
        body: JSON.stringify({ id: change.id, reviewed: !change.reviewed, ...(change.target_code ? { targetCode: change.target_code } : {}) }) });
      const json = await response.json();
      if (!response.ok) { setStatus(json.error); return; }
      setChanges((previous) => previous.map((entry) => entry.id === change.id ? json.data : entry));
      setStatus("검수 상태를 저장했습니다.");
    } catch { setStatus("검수 상태를 저장하지 못했습니다."); }
    finally { setPending(false); }
  }

  return (
    <form className="panel stack" onSubmit={onSubmit}>
      <label>
        관리자 토큰
        <input value={token} onChange={(event) => setToken(event.target.value)} type="password" />
      </label>
      <label>
        공식 패치노트 URL
        <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
      </label>
      <button type="submit" disabled={pending}>패치노트 가져오기</button>
      {status ? <p role="status">{status}</p> : null}
      {changes.map((change) => <article className="item-card stack" key={change.id}>
        <strong>{change.target_name} · {change.change_type}</strong><p>{change.raw_change_text}</p>
        <label>공식 대상 코드<input type="number" min={1} value={change.target_code ?? ""} disabled={pending || change.reviewed}
          onChange={(event) => setChanges((previous) => previous.map((entry) => entry.id === change.id ? { ...entry, target_code: event.target.value ? Number(event.target.value) : null } : entry))} /></label>
        <button type="button" disabled={pending || (!change.reviewed && !change.target_code)} onClick={() => review(change)}>{change.reviewed ? "검수 취소" : "원문·코드 확인 후 검수 완료"}</button>
      </article>)}
    </form>
  );
}
