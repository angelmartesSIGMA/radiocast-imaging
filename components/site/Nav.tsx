"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import css from "./site.module.css";

const LINKS = [
  { href: "/samples", label: "Samples" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className={css.nav}>
      <div className={`${css.container} ${css.navInner}`}>
        <Link href="/" className={css.brand}>
          <Image src="/radiocast-logo.png" alt="" width={24} height={24} />
          Radiocast <span className={css.brandSub}>Imaging</span>
        </Link>
        <nav className={css.navLinks} aria-label="Main">
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined} data-keep={l.href === "/dashboard" || undefined}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div className={css.navRight}>
          <Link href="/studio" className={`${css.btnPrimary} ${css.small}`} prefetch={false}>
            New session
          </Link>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className={css.footer}>
      <div className={`${css.container} ${css.footerInner}`}>
        <span>© {new Date().getFullYear()} Radiocast · Custom radio imaging</span>
        <span>
          <a href="mailto:contact@radiocast.net">contact@radiocast.net</a>
        </span>
      </div>
    </footer>
  );
}
