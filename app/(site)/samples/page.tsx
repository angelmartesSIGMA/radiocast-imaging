import type { Metadata } from "next";
import { SampleBrowser } from "@/components/site/SampleBrowser";
import { NotConfigured } from "@/components/site/NotConfigured";
import css from "@/components/site/site.module.css";
import { publishedSamples } from "@/lib/db/media";
import { supabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Samples · Radiocast Imaging" };

export default async function SamplesPage() {
  const ok = supabaseConfigured();
  const samples = ok ? await publishedSamples() : [];
  return (
    <div className={css.container}>
      <div className={css.pageHead}>
        <div>
          <h1 className={css.h1}>Sample library</h1>
          <p className={css.lead}>Beds, sweeps, hits and stingers from the Radiocast team. Preview anything, then drop it straight into a new session.</p>
        </div>
      </div>
      {ok ? <SampleBrowser samples={samples} /> : <NotConfigured />}
    </div>
  );
}
