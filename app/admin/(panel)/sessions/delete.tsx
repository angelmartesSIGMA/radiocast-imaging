"use client";

import { useTransition } from "react";
import s from "@/components/site/site.module.css";
import { deleteSession } from "@/app/(site)/dashboard/actions";

export function AdminDeleteSession({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={`${s.btnGhost} ${s.small}`}
      disabled={pending}
      onClick={() => confirm(`Delete “${name}”?`) && start(() => deleteSession(id))}
    >
      {pending ? "Deleting…" : "Delete"}
    </button>
  );
}
