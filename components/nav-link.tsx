"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLinkProps = {
  children: ReactNode;
  exact?: boolean;
  href: string;
};

export function NavLink({ children, exact = false, href }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      aria-current={isActive ? "page" : undefined}
      className={isActive ? "nav-link nav-link-active" : "nav-link"}
      href={href}
    >
      {children}
    </Link>
  );
}
