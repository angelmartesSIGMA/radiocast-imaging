"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/Icon";

export function SideLink({ href, icon, exact, children }: { href: string; icon: IconName; exact?: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const on = exact ? path === href : path.startsWith(href);
  return (
    <Link href={href} aria-current={on ? "page" : undefined}>
      <Icon name={icon} size={15} />
      {children}
    </Link>
  );
}
