"use client";

import { FormEvent, useState } from "react";

export function AdminImportForm() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setStatus("import 중");
    const response = await fetch("/api/admin/patch-notes/import", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-admin-token": token
      },
      body: JSON.stringify({ url })
    });
    const json = await response.json();
    setStatus(response.ok ? `완료: ${json.data.importedChanges}개 변경 감지` : json.error);
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
      <button type="submit">패치노트 가져오기</button>
      {status ? <p>{status}</p> : null}
    </form>
  );
}
