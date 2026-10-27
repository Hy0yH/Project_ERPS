import Link from "next/link";
export default function NotFound() {
  return <section className="panel stack"><h1>요청한 페이지를 찾을 수 없습니다.</h1>
    <p>실험체와 주소를 다시 확인해 주세요.</p><Link href="/characters">실험체 티어표로 이동</Link></section>;
}
