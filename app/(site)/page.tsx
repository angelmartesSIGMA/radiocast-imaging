import Link from "next/link";
import { SampleBrowser } from "@/components/site/SampleBrowser";
import s from "@/components/site/site.module.css";
import { sampleMedia } from "@/lib/db/media";
import type { SampleRow } from "@/lib/db/types";
import { TEMPLATES } from "@/lib/studio/templates";
import { db, supabaseConfigured } from "@/lib/supabase/server";
import css from "./landing.module.css";

export const dynamic = "force-dynamic";

async function featured() {
  if (!supabaseConfigured()) return [];
  try {
    const { data } = await db().from("samples").select("*").eq("published", true).eq("featured", true).order("sort").limit(8);
    return sampleMedia((data ?? []) as SampleRow[]);
  } catch {
    return [];
  }
}

const STEPS = [
  { n: "1", title: "Sketch it in the studio", body: "Drag beds, sweeps and hits onto the timeline, record a guide read, and hit your :05 to :60 length." },
  { n: "2", title: "Send it to a producer", body: "Your session, a rendered mix and your script go to the Radiocast team in one click." },
  { n: "3", title: "Get finished drafts", body: "Pro voice, full production, broadcast-loud — delivered back to your dashboard." },
];

export default async function Landing() {
  const samples = await featured();
  return (
    <>
      <section className={css.hero}>
        <div className={s.container}>
          <p className={css.kicker}>Radiocast Imaging Studio</p>
          <h1 className={css.title}>
            Station IDs, sweepers and liners —<br />
            <span className={css.grad}>sketched in minutes, finished by pros.</span>
          </h1>
          <p className={css.sub}>
            A browser studio built for radio imaging: target lengths, broadcast voice processing, loudness-matched exports. When the idea’s
            there, our producers take it the rest of the way.
          </p>
          <div className={css.ctas}>
            <Link href="/studio" className={s.btnPrimary} prefetch={false}>
              Start a session
            </Link>
            <Link href="/samples" className={s.btn}>
              Browse samples
            </Link>
          </div>
        </div>
      </section>

      <section className={s.container}>
        <div className={css.steps}>
          {STEPS.map((st) => (
            <div key={st.n} className={css.step}>
              <span className={css.stepN}>{st.n}</span>
              <p className={css.stepTitle}>{st.title}</p>
              <p className={css.stepBody}>{st.body}</p>
            </div>
          ))}
        </div>

        <div className={s.sectionHead}>
          <h2 className={s.h2}>Start from a template</h2>
        </div>
        <div className={css.templates}>
          {TEMPLATES.map((t) => (
            <Link key={t.id} href={`/studio?template=${t.id}`} className={css.template} prefetch={false}>
              <span className={css.templateLen}>{t.target ? `:${String(t.target).padStart(2, "0")}` : "—"}</span>
              <span className={css.templateName}>{t.name}</span>
              <span className={css.templateBlurb}>{t.blurb}</span>
            </Link>
          ))}
        </div>

        {samples.length > 0 && (
          <>
            <div className={s.sectionHead}>
              <h2 className={s.h2}>Featured samples</h2>
              <Link href="/samples" className={`${s.btnGhost} ${s.small}`}>
                See all
              </Link>
            </div>
            <SampleBrowser samples={samples} compact />
          </>
        )}
      </section>
    </>
  );
}
