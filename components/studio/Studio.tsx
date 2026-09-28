"use client";

import Link from "next/link";
import { useEffect } from "react";
import { getEngine } from "@/lib/audio/engine";
import { clock, dom } from "@/lib/studio/clock";
import { useStudio, type StudioState } from "@/lib/studio/store";
import { Header } from "./Header";
import { Inspector } from "./Inspector";
import { Library } from "./Library";
import { TooltipLayer } from "@/components/ui/Tooltip";
import { Overlays } from "./Overlays";
import { Palette } from "./Palette";
import { SendDrawer } from "./SendDrawer";
import { Timeline } from "./Timeline";
import { Toolbar } from "./Toolbar";
import css from "./Studio.module.css";

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

/** Fields that make up the saved session; any change to them schedules an autosave. */
const SAVED_KEYS = ["clips", "lanes", "projectName", "master", "duck", "duckDb", "limiter", "target", "bpm", "gridMode", "loudTarget"] as const;

export default function Studio({ sessionId }: { sessionId: string }) {
  const ready = useStudio((s) => s.ready);
  const loadError = useStudio((s) => s.loadError);
  const libOpen = useStudio((s) => s.libOpen);
  const inspOpen = useStudio((s) => s.inspOpen);
  const vw = useStudio((s) => s.vw);
  const set = useStudio((s) => s.set);
  const narrow = vw < 1024;

  useEffect(() => {
    const st = useStudio.getState;
    void st().init(sessionId);

    // Autosave: debounce edits, then PATCH the session row.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubSave = useStudio.subscribe((a, b) => {
      if (!a.sessionId || !a.ready || a.loadError) return;
      if (!SAVED_KEYS.some((k) => a[k] !== b[k])) return;
      // Live drags update clips every frame; save once the gesture settles.
      clearTimeout(timer);
      if (a.saveState !== "saving") useStudio.setState({ saveState: "idle" });
      timer = setTimeout(() => void st().save(), 800);
    });
    const onUnload = (e: BeforeUnloadEvent) => {
      const s = st();
      if (timer || s.saveState === "saving" || s.sounds.some((x) => x.status === "uploading")) {
        clearTimeout(timer);
        void s.save();
        if (s.sounds.some((x) => x.status === "uploading")) e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onUnload);

    // transport clock
    let raf = 0;
    const loop = () => {
      st().tick();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    // whole-window file drag & drop
    let depth = 0;
    const reset = () => {
      depth = 0;
      st().set({ fileDrag: false, fileMark: null, libHover: false });
    };
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      if (!st().fileDrag) st().set({ fileDrag: true });
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (!depth) reset();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      reset();
      void st().importFiles(Array.from(e.dataTransfer?.files ?? []), null);
    };
    const onResize = () => {
      const prev = st().vw;
      const vw = window.innerWidth;
      const patch: Partial<StudioState> = { vw };
      // Collapse side panels as the window crosses into narrower layouts.
      if (prev >= 1024 && vw < 1024) patch.libOpen = false;
      if (prev >= 900 && vw < 900) patch.inspOpen = false;
      st().set(patch);
    };
    const onKey = (e: KeyboardEvent) => handleKey(e);

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);
    window.addEventListener("studio:filedrop-reset", reset);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("studio:filedrop-reset", reset);
      window.removeEventListener("beforeunload", onUnload);
      unsubSave();
      clearTimeout(timer);
      getEngine().stop();
    };
  }, [sessionId]);

  if (loadError) {
    return (
      <div className={css.state} data-studio>
        <p className={css.stateTitle}>Couldn’t open this session</p>
        <p className={css.stateSub}>{loadError}</p>
        <div className={css.stateActions}>
          <Link href="/dashboard">Back to dashboard</Link>
          <button type="button" onClick={() => location.reload()}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={css.shell} data-studio>
      {!ready && (
        <div className={css.loading} role="status">
          <span className={css.spinner} />
          Loading session…
        </div>
      )}
      <Header />
      <div className={css.body}>
        {libOpen && (
          <>
            {narrow && <div className={css.scrim} onClick={() => set({ libOpen: false })} />}
            <Library floating={narrow} />
          </>
        )}
        <input
          ref={(el) => {
            dom.fileInput = el;
          }}
          type="file"
          accept="audio/*,.wav,.mp3,.aif,.aiff,.m4a,.ogg,.flac"
          multiple
          hidden
          onChange={(e) => {
            void useStudio.getState().importFiles(Array.from(e.target.files ?? []), "library");
            e.target.value = "";
          }}
        />
        <main className={css.main}>
          <Toolbar />
          <div className={css.workspace}>
            <Timeline />
            {inspOpen && <Inspector floating={vw < 900} />}
          </div>
        </main>
      </div>
      <Overlays />
      <SendDrawer />
      <Palette />
      <TooltipLayer />
    </div>
  );
}

function handleKey(e: KeyboardEvent) {
  const s = useStudio.getState();
  const el = e.target as HTMLElement;
  const tag = (el.tagName || "").toLowerCase();
  const typing = tag === "textarea" || tag === "select" || (tag === "input" && (el as HTMLInputElement).type !== "range");

  if (e.key === "Escape") {
    if (s.countIn != null) return void s.toggleRecord();
    if (s.menu) return s.set({ menu: null });
    if (s.shortcuts) return s.set({ shortcuts: false });
    if (s.drawer) return s.set({ drawer: false });
    if (typing) return el.blur();
    return s.set({ selected: null });
  }
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === "k") {
    e.preventDefault();
    s.set({ palette: s.palette ? null : {} });
    return;
  }
  if (typing || s.drawer || s.palette || el.isContentEditable) return;

  const key = e.key.toLowerCase();
  const sel = s.selected;

  if (e.code === "Space") {
    e.preventDefault();
    s.togglePlay();
  } else if (mod && key === "z") {
    e.preventDefault();
    if (e.shiftKey) s.redo();
    else s.undo();
  } else if (mod && key === "y") {
    e.preventDefault();
    s.redo();
  } else if (mod && key === "d") {
    e.preventDefault();
    s.duplicate();
  } else if (mod && key === "c" && sel) {
    e.preventDefault();
    s.copyClip();
  } else if (mod && key === "x" && sel) {
    e.preventDefault();
    s.cutClip();
  } else if (mod && key === "v") {
    e.preventDefault();
    const lane = s.clips.find((c) => c.id === sel)?.lane ?? null;
    s.paste(lane, clock.t);
  } else if (mod) {
    return;
  } else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
    e.preventDefault();
    s.removeClip(sel);
  } else if (key === "s") s.split();
  else if (key === "r") void s.toggleRecord();
  else if (key === "l") s.set({ loop: !s.loop });
  else if (key === "m" && sel) {
    const c = s.clips.find((x) => x.id === sel);
    if (c) {
      s.commit();
      s.updateClip(sel, { muted: !c.muted }, false);
      s.restartIfPlaying();
    }
  }
  else if (e.key === "?") s.set({ shortcuts: !s.shortcuts });
  else if (e.key === "=" || e.key === "+") s.zoomBy(1.5);
  else if (e.key === "-") s.zoomBy(1 / 1.5);
  else if (e.key === "Home") s.seek(0);
  else if (e.key === "End") s.seek(s.sessionEnd());
  else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && sel && tag !== "input") {
    e.preventDefault();
    const step = (e.shiftKey ? 1 : s.scale()[1]) * (e.key === "ArrowLeft" ? -1 : 1);
    const c = s.clips.find((x) => x.id === sel);
    if (!c) return;
    if (!e.repeat) s.commit();
    // Nudging stops at the neighbouring clip instead of sliding under it.
    const [lo, hi] = s.roomFor(sel);
    const start = Math.min(Math.max(lo, +(c.start + step).toFixed(3)), hi - c.len);
    s.updateClip(sel, { start: Math.max(0, start) }, false);
    s.restartIfPlaying();
  } else if ((e.key === "ArrowLeft" || e.key === "ArrowRight") && tag !== "input") {
    e.preventDefault();
    s.seek(clock.t + (e.shiftKey ? 1 : s.scale()[1]) * (e.key === "ArrowLeft" ? -1 : 1));
  }
}
