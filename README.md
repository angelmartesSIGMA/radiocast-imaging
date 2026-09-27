# Radiocast Imaging Studio32323232

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

Import the repo in Vercel; it detects Next.js automatically.

### Password protection (Basic Auth)

The whole site sits behind HTTP Basic Auth (`proxy.ts`). Set these in **Vercel → Project → Settings → Environment Variables** for Production and Preview, then redeploy:

| Variable | Example |
| --- | --- |
| `BASIC_AUTH_USER` | `radiocast` |
| `BASIC_AUTH_PASSWORD` | a long random password |

If either variable is missing, a deployed build returns `503` instead of going public. `npm run dev` stays open without them. To test auth locally, copy `.env.example` to `.env.local`.

## Layout

```
app/                    layout, fonts, global tokens
components/studio/      Header (transport), Library, Toolbar, Timeline, Inspector, SendDrawer, Overlays
components/ui/          Icon set and shared controls (buttons, chips, sliders, switches)
lib/audio/              engine (Web Audio scheduling, meters, offline render), synth generators, DSP helpers
lib/studio/             store (state + actions + undo history), clock (60fps playhead), templates, IndexedDB audio store
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
- Empty-session onboarding, ARIA roles and labels, and `prefers-reduced-motion` support.

### Visual design

- Geist typeface, a neutral dark palette, and an accent colour taken from the logo's magenta.
- Each track gets its own colour (a second FX track is pink, not another amber). Clips use tinted gradients, show higher-resolution waveforms, and hide their labels when they're too narrow to read.
- A single transport pill in the header (play, record, loop, time, target status and a gradient level meter). The session title shows its save status underneath.
- A grouped, segmented toolbar; a library with a segmented filter and section headings; and a quieter inspector with compact switches.

- Tracks grow to fill the timeline, each with a type icon (mic, music, bolt) and a live level meter in its header.

### Interaction and usability pass

- **Command palette (⌘K).** Search and run any action, add any sound at the playhead, start a template or set a target length.
- **Double-click an empty spot on a track** to search for a sound and drop it right there.
- **Templates.** Station ID :20 / :10, Sweeper :05, Liner :15 and Blank, from the header's New menu or from the empty-session cards. Starting one can be undone.
- **Undo right in the toast** after deleting a clip, removing a track, splitting or starting a template.
- **Autosave.** The session (clips, tracks, mix) is kept in localStorage, and uploads and recorded takes are kept in IndexedDB, so a reload restores everything. A header badge shows the save status.
- **Record count-in.** 3-2-1 beeps with a big countdown. Press R or Esc to cancel, and switch it off in the inspector.
- **Tooltips everywhere** that show the matching keyboard shortcut.
- **Timeline feedback.** A hover line with a time readout, clips that light up while they play, and a progress bar on library previews.
- **Precise clip editing.** Click Start or Length in the inspector to type a value, or nudge it with −/+. Double-click a library sound to add it at the playhead.
- Quick duplicate and delete buttons appear in the toolbar when a clip is selected.
