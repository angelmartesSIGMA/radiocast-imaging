import Link from "next/link";
import { StatusChip } from "@/components/site/StatusChip";
import s from "@/components/site/site.module.css";
import type { BriefRow } from "@/lib/db/types";
import { ago } from "@/lib/format-site";

export function BriefTable({ rows }: { rows: Pick<BriefRow, "id" | "ref" | "station" | "contact_email" | "status" | "created_at" | "deliverables">[] }) {
  if (!rows.length)
    return (
      <div className={s.empty}>
        <strong>No briefs</strong>
        <span>Briefs appear here when someone uses “Send to producers” in the studio.</span>
      </div>
    );
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th>Ref</th>
            <th>Station</th>
            <th>Contact</th>
            <th>Deliverables</th>
            <th>Status</th>
            <th>Received</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td>
                <Link href={`/admin/briefs/${b.id}`} className="mono">
                  {b.ref}
                </Link>
              </td>
              <td>{b.station || <span className={s.muted}>—</span>}</td>
              <td>{b.contact_email}</td>
              <td>{b.deliverables.join(", ")}</td>
              <td>
                <StatusChip status={b.status} />
              </td>
              <td className={s.num}>{ago(b.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
