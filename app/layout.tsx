import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "ERPS - 이터널 리턴 메타 추천",
  description: "이터널 리턴 랭크 스쿼드 메타, 조합, 패치 기반 추천 MVP"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <header className="topbar">
          <Link className="brand" href="/">
            ERPS
          </Link>
          <nav>
            <Link href="/characters">캐릭터 티어</Link>
            <Link href="/recommend">추천</Link>
            <Link href="/admin/patch-notes">패치 import</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
