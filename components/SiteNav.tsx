"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="site-nav" aria-label="주요 메뉴">
      <NavLink href="/characters" active={pathname === "/characters" || pathname.startsWith("/characters/")}>
        티어표
      </NavLink>
      <NavLink href="/players" active={pathname === "/players" || pathname.startsWith("/players/")}>
        플레이 피드백
      </NavLink>
      <NavLink href="/recommend" active={pathname === "/recommend"}>
        픽 추천
      </NavLink>
      <span className="nav-divider" aria-hidden="true" />
      <Link className="nav-admin" href="/admin/patch-notes">
        패치 관리
      </Link>
      <Link className="nav-admin" href="/admin/operations">운영 상태</Link>
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
    <Link className={`nav-link${active ? " active" : ""}`} href={href} aria-current={active ? "page" : undefined}>
      {children}
    </Link>
  );
}
