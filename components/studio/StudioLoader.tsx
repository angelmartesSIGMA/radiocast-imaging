"use client";

import dynamic from "next/dynamic";
import Image from "next/image";

/** The studio is Web Audio + window-sized layout, so it only renders on the client. */
const Studio = dynamic(() => import("./Studio"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100vh",
        display: "grid",
        placeItems: "center",
        background: "var(--bg)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, opacity: 0.8 }}>
        <Image src="/radiocast-logo.png" alt="" width={28} height={28} priority />
        <span className="eyebrow">Loading studio</span>
      </div>
    </div>
  ),
});

export default function StudioLoader({ sessionId }: { sessionId: string }) {
  return <Studio sessionId={sessionId} />;
}
