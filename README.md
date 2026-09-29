# Radiocast Imaging 2

A website for building radio imaging (station IDs, sweepers, liners) in the browser and sending it to Radiocast producers:

- **`/`** is the landing page, with templates and featured samples.
- **`/samples`** is the public sample library: search, filter, preview, and "Use" (which starts a session with that sample).
- **`/dashboard`** lists your sessions, the briefs you've sent (with status and producer deliveries to download), and your uploads.
- **`/studio`** starts a new session. **`/studio/[id]`** is the studio itself, and every change is saved to the database automatically.
- **`/admin`** is the producer side:
  - overview
  - the brief queue, with status changes, history, internal notes and delivery uploads
  - the sample library, with upload, edit, publish and feature
  - sessions

It uses Next.js (App Router), TypeScript and Zustand, with **self-hosted Supabase** for Postgres and Storage. It deploys to Vercel.

There are no user accounts yet. Every table has a nullable `owner_id` column so a separate auth system can be added later.

## Setup

### 1. Database and buckets

Open the SQL editor of your self-hosted Supabase (Studio → SQL editor) and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). It is safe to run more than once. It creates:

- **Tables:** `sessions`, `assets`, `samples`, `briefs`, `brief_events` and `brief_files`, all with RLS on and no policies. Only the service role can read or write them.
- **Private buckets:**
  - `user-audio` and `samples` (100 MB per file)
  - `briefs` (250 MB per file)

On the Supabase side (the stack's own `.env`, not Vercel):
- Set Storage's `FILE_SIZE_LIMIT` to at least `104857600` (100 MB) or larger. Bucket limits can't exceed it.
- Kong must serve `/storage/v1` publicly over **HTTPS**. Browsers upload and download audio directly through signed URLs on that host.

### 2. Environment variables

Set these in **Vercel → Project → Settings → Environment Variables** for Production and Preview, and in `.env.local` for local work (see `.env.example`):

| Variable | Example | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | `https://supabase.example.com` | Public Kong URL of your stack |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJ…` | `SERVICE_ROLE_KEY` from the Supabase `.env`. **Server only.** Never prefix it with `NEXT_PUBLIC_` |
| `BASIC_AUTH_USER` | `radiocast` | Site-wide testing gate |
| `BASIC_AUTH_PASSWORD` | long random | |
| `ADMIN_PASSWORD` | long random | Password for `/admin/login` |
| `ADMIN_SESSION_SECRET` | 32+ random chars | Signs the admin cookie (for example `openssl rand -hex 32`) |

If either Basic Auth variable is missing, a deployed build returns `503` instead of going public. `npm run dev` stays open without them. If Supabase isn't configured, the studio and dashboard show a setup notice instead of crashing.

### Checking the setup

If Supabase is missing or misconfigured, pages don't crash. They show a checklist of what's wrong: an unreachable URL, the anon key used instead of the service role key, missing tables or missing buckets. Open **`/api/health`** on the deployment to see the same checks as JSON.

### 3. Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

## How it fits together

- **The browser never holds a Supabase key.** All database access goes through route handlers and server actions, using the service role (`lib/supabase/server.ts`, `import "server-only"`).
- **Audio goes straight to Storage.** The server hands out a signed upload URL, and the browser uploads the file to it with a progress bar, which avoids Vercel's request-size limit. A finalize call then marks the row as uploaded. Downloads use signed URLs that last 1 hour. The studio caches decoded audio in IndexedDB, so reopening a session doesn't download everything again.
- **Sound ids:**
  - built-in synth sounds keep their names (`pulse`, `riser`, …)
  - uploads and takes are `a_<uuid>` (table `assets`, bucket `user-audio`)
  - library samples are `s_<uuid>` (table `samples`, bucket `samples`)
- **Autosave:** changes to clips, tracks, mix or target are debounced for 800 ms, then `PATCH`ed to `/api/sessions/[id]`. The header badge shows *Saving… / Saved / Not saved · Retry*.
- **Send brief:**
  1. Saves the session.
  2. Creates the `briefs` row, which returns a short ref like `F30758`.
  3. Renders the mix at the export loudness and uploads it to `briefs/<id>/mix.wav`.

  Producers work through the brief in `/admin/briefs`. Deliveries are uploaded to `briefs/<id>/deliveries/` and appear on the dashboard as downloads.
- **Admin gate:**
  - `proxy.ts` runs Basic Auth on everything except build assets and images.
  - `/admin/**` and `/api/admin/**` also need the `rc_admin` cookie: an HMAC-signed expiry that lasts 7 days, set by `/admin/login`.
- **Older sessions:** a session saved in the browser before the database existed can be imported from the dashboard.

## Layout

```
app/(site)/             landing, /samples, /dashboard (site nav + footer)
app/studio/             /studio (creates a session) and /studio/[id]
app/admin/              login + panel: overview, briefs, samples, sessions
app/api/                sessions, assets, samples, briefs, admin/* (JSON, service role)
components/studio/      Header (transport), Library, Toolbar, Timeline, Inspector, SendDrawer, Overlays
components/site/        site shell, sample browser, status chips
components/ui/          Icon set and shared controls (buttons, chips, sliders, switches)
lib/audio/              engine (Web Audio scheduling, meters, offline render), synth generators, DSP, loudness
lib/studio/             store (state + actions + undo history), clock, templates, API client, IndexedDB cache
lib/db/, lib/supabase/  row types, validation, signed media URLs, server client
supabase/migrations/    SQL to run on the Supabase instance
design/                 the original design file
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

- Each track shows a type icon (mic, music, bolt) and a live level meter in its header.

### Imaging tools

- **Adjustable track height.** Drag any track's bottom edge, or use the thinner/taller buttons in the toolbar. Double-click the edge to reset. Below about 60px, tracks switch to a compact one-line layout.
- **Track processing presets** (`lib/audio/fx.ts`), picked from the FX pill on each track or in the inspector:
  - Broadcast (the default on voice tracks)
  - Big voice
  - Telephone
  - Megaphone
  - Hall reverb
  - Echo

  They are built from Web Audio nodes, so export sounds the same as playback, and reverb/echo tails are rendered.
- **Reverse clips** from the inspector, the right-click menu or ⌘K. The waveform flips and gets a REV badge. Fades swap so the clip keeps the same shape.
- **Beats grid.** Switch the ruler to bars and beats and set the BPM. Snapping and nudging then follow the beat.
- **Loudness.** The export target can be off, −23, −16, −14 or −10 LUFS. Export normalizes to the target (BS.1770 K-weighting, gated), then runs a look-ahead limiter to a −1 dBFS ceiling. Measured against pyloudnorm, the difference was 0.03 LU. **Measure** shows the loudness of the current mix.
- **New sounds:** cinematic boom, downlifter, tape stop, rewind and radio tune. The templates use them, and set track FX where it helps (hall on the liner's chime, echo on the sweeper's tail).

### Arranging

- **No hidden overlaps.** A clip dropped, moved, duplicated or recorded on top of another clip on the same track goes to the nearest same-type track with room, or to a new track created just below. A toast says where it went and offers Undo. Trims and arrow-key nudges stop at the neighbouring clip. Sessions saved before this change are spread out when they load.
- **Drop below the tracks to make a new one.** Dragging a clip, a library sound or an audio file into the space under the last track creates a new track of the right type and places the audio there. A dashed zone and a preview show where it will land.
- **Reorder tracks** by dragging a track's icon. A line shows where the track will land.
- Tracks keep their colour for life, so inserting a track never reshuffles colours.
- The timeline auto-scrolls when you drag near its edges.

### Right-click menus

Menus support submenus and full keyboard use (↑ ↓ to move, → to open a submenu, ← to go back, Enter to run, Esc to close).

- **Clips:**
  - Cut, Copy, Paste after, Duplicate
  - Split here, Split at playhead, Trim start/end to playhead
  - Reverse, Mute clip (M), Normalise to −1 dB
  - Gain ▸ (+3, −3, −6, reset)
  - Fades ▸ (de-click, fade in/out presets, fade to end of target, remove)
  - Move to track ▸ (any track, or a new one)
  - Play from clip start, Move playhead here, Open in inspector, Delete
- **Track headers:**
  - Rename, Mute, Solo, Processing ▸, Reset volume
  - Record on this track (voice tracks)
  - Add track below ▸, Duplicate track (with its clips), Move up/down
  - Clear clips, Delete track
- **Empty track space:** Paste here, Add sound here…, Record here (voice tracks), Play from here, Move playhead here, the track's own menu, Add track below ▸.
- **Ruler:** Play from here, Move playhead here, Split all clips here, Target length ▸, Loop, Grid ▸ (time or bars & beats, snap), zoom.
- **Library sounds:** Preview, Add at playhead, Add to track ▸ (any track, or a new one), and Delete from library for your own uploads.

⌘C / ⌘X / ⌘V copy, cut and paste clips; pasting goes to the playhead on the selected clip's track.

### Interaction and usability pass

- **Command palette (⌘K).** Search and run any action, add any sound at the playhead, start a template or set a target length.
- **Double-click an empty spot on a track** to search for a sound and drop it right there.
- **Templates.** Station ID :20 / :10, Sweeper :05, Liner :15 and Blank, from the header's New menu or from the empty-session cards. Starting one can be undone.
- **Undo right in the toast** after deleting a clip, removing a track, splitting or starting a template.
- **Record count-in.** 3-2-1 beeps with a big countdown. Press R or Esc to cancel, and switch it off in the inspector.
- **Tooltips everywhere** that show the matching keyboard shortcut.
- **Timeline feedback.** A hover line with a time readout, clips that light up while they play, and a progress bar on library previews.
- **Precise clip editing.** Click Start or Length in the inspector to type a value, or nudge it with −/+. Double-click a library sound to add it at the playhead.
- Quick duplicate and delete buttons appear in the toolbar when a clip is selected.
