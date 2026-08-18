import type { Metadata } from "next";
import Link from "next/link";
import { SiteNav } from "@/components/SiteNav";
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
          <div className="topbar-inner">
            <Link className="brand" href="/">
              ERPS
            </Link>
            <SiteNav />
          </div>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
