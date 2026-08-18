"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="site-nav" aria-label="주요 메뉴">
      <NavLink href="/characters" active={pathname.startsWith("/characters")}>
        캐릭터 티어
      </NavLink>
      <NavLink href="/recommend" active={pathname.startsWith("/recommend")}>
        추천
      </NavLink>
      <span className="nav-divider" aria-hidden="true" />
      <Link className="nav-cta" href="/recommend">
        추천 열기
      </Link>
      <Link className="nav-admin" href="/admin/patch-notes">
        패치 관리
      </Link>
    </nav>
  );
}

function NavLink({
  href,
  active,
  children
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link className={`nav-link${active ? " active" : ""}`} href={href}>
      {children}
    </Link>
  );
}
