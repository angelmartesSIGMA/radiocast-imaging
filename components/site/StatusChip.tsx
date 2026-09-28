import { BRIEF_STATUSES, type BriefStatus } from "@/lib/db/types";
import css from "./site.module.css";

export function StatusChip({ status }: { status: BriefStatus }) {
  const s = BRIEF_STATUSES.find((x) => x.id === status) ?? BRIEF_STATUSES[0];
  return (
    <span className={css.chip} data-tone={s.tone}>
      {s.label}
    </span>
  );
}
