import { NotConfigured } from "@/components/site/NotConfigured";
import s from "@/components/site/site.module.css";
import { supabaseConfigured } from "@/lib/supabase/server";
import { SampleManager } from "./manager";

export default function AdminSamples() {
  return (
    <>
      <div className={s.pageHead}>
        <div>
          <h1 className={s.h1}>Samples</h1>
          <p className={s.lead}>
            Upload beds, sweeps, hits and stingers. Published samples appear on the Samples page and in every studio library; featured ones show
            on the home page.
          </p>
        </div>
      </div>
      {supabaseConfigured() ? <SampleManager /> : <NotConfigured />}
    </>
  );
}
