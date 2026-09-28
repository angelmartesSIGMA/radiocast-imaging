import Image from "next/image";
import Link from "next/link";
import { db, supabaseConfigured } from "@/lib/supabase/server";
import { adminLogout } from "../actions";
import { SideLink } from "./side-link";
import css from "../admin.module.css";

export const dynamic = "force-dynamic";

async function newBriefs() {
  if (!supabaseConfigured()) return 0;
  const { count } = await db().from("briefs").select("id", { count: "exact", head: true }).eq("status", "new");
  return count ?? 0;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const fresh = await newBriefs().catch(() => 0);
  return (
    <div className={css.shell}>
      <aside className={css.side} aria-label="Admin">
        <Link href="/admin" className={css.sideBrand}>
          <Image src="/radiocast-logo.png" alt="" width={22} height={22} />
          Radiocast <span>Admin</span>
        </Link>
        <SideLink href="/admin" exact icon="gauge">
          Overview
        </SideLink>
        <SideLink href="/admin/briefs" icon="send">
          Briefs {fresh > 0 && <span className={css.badge}>{fresh}</span>}
        </SideLink>
        <SideLink href="/admin/samples" icon="music">
          Samples
        </SideLink>
        <SideLink href="/admin/sessions" icon="rowsTall">
          Sessions
        </SideLink>
        <div className={css.sideFoot}>
          <SideLink href="/dashboard" icon="panelLeft">
            Back to site
          </SideLink>
          <form action={adminLogout}>
            <button type="submit">Sign out</button>
          </form>
        </div>
      </aside>
      <div className={css.content}>{children}</div>
    </div>
  );
}
