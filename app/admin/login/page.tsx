import type { Metadata } from "next";
import Image from "next/image";
import { LoginForm } from "./form";
import css from "../admin.module.css";

export const metadata: Metadata = { title: "Admin login · Radiocast Imaging" };

export default async function AdminLogin({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className={css.loginPage}>
      <div className={css.loginCard}>
        <Image src="/radiocast-logo.png" alt="" width={36} height={36} />
        <h1>Admin</h1>
        <p>Enter the admin password to manage briefs, samples and sessions.</p>
        <LoginForm next={next ?? "/admin"} />
      </div>
    </div>
  );
}
