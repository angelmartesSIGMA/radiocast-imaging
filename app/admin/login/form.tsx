"use client";

import { useActionState } from "react";
import s from "@/components/site/site.module.css";
import { adminLogin } from "../actions";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(adminLogin, undefined);
  return (
    <form action={action} style={{ width: "100%" }}>
      <input type="hidden" name="next" value={next} />
      <label className={s.label} htmlFor="pw">
        Password
      </label>
      <input id="pw" name="password" type="password" className={s.input} autoFocus required autoComplete="current-password" />
      {state?.error && <p className={s.error}>{state.error}</p>}
      <button type="submit" className={s.btnPrimary} disabled={pending} style={{ width: "100%", marginTop: 16 }}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
