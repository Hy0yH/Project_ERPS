"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <section className="panel stack" role="alert"><h1>데이터를 불러오지 못했습니다.</h1>
    <p>잠시 후 다시 시도해 주세요. 조회 실패를 기록이 없는 상태로 표시하지 않습니다.</p>
    <button type="button" onClick={reset}>다시 불러오기</button></section>;
}
