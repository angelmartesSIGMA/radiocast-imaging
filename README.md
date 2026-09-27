# Radiocast Imaging Studio

A browser-based studio for building radio imaging (station IDs, sweepers, liners) and sending the session to Radiocast producers. This is a UI prototype: all audio is synthesized or decoded in the browser with Web Audio, and "Send brief" doesn't submit anywhere yet.

Built with Next.js (App Router), TypeScript, and Zustand. Deploys to Vercel with no configuration.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

## Deploy

Import the repo in Vercel. It detects Next.js automatically and needs no environment variables.

## Layout

```
app/                    layout, fonts, global tokens
components/studio/      Header (transport), Library, Toolbar, Timeline, Inspector, SendDrawer, Overlays
components/ui/          Icon set and shared controls (buttons, chips, sliders, switches)
lib/audio/              engine (Web Audio scheduling, meters, offline render), synth generators, DSP helpers
lib/studio/             store (state + actions + undo history), clock (60fps playhead), constants, formatting
design/                 the original design file this prototype was built from
```

The playhead runs outside React state (`lib/studio/clock.ts`), so playback doesn't re-render the timeline every frame.

## What changed from the design file

It's a port of `design/imaging-studio-v2.reference.html` with these additions:

- **Target length.** Pick :05–:60 in the toolbar. The timeline shows a marker, the transport shows over/under time, and the inspector shows a length bar.
- **Loop playback** (`L`). Loops to the target length, or to the end of the session when no target is set.
- **Safety limiter and output ceiling** on the master bus. The demo mix in the original design exported at +2.1 dBFS (clipping). It now exports at a -0.3 dBFS peak, and the export toast reports the peak level.
- **Clip context menu** (right-click): split, duplicate, move the playhead to the clip, delete.
- **Track rename** (double-click the name), plus track removal that also removes the track's clips and can be undone.
- **Add at playhead** button on each library row, so you can add sounds without dragging.
- **Keyboard shortcuts dialog** (`?`), zoom with `+`/`−`, and `←`/`→` to move the playhead when no clip is selected.
- **Clip indicator** on the output meter that stays lit until you click it.
- **Send brief form**: deliverables, turnaround, a script word count with estimated read time checked against the target length, inline validation, and a summary screen after sending.
- **Responsive layout.** Below 1024px the library becomes an overlay, and below 900px the inspector does too.
- **Saved preferences.** Session name, mix settings, target length and brief details are kept in localStorage. Audio isn't saved.
- Empty-session onboarding, ARIA roles and labels, and `prefers-reduced-motion` support.
