type Listener = (t: number) => void;

/**
 * The playhead position lives outside React state so it can move at 60fps
 * without re-rendering the timeline. Components subscribe and write to the
 * DOM directly (time readout, playhead line, ruler head).
 */
class Clock {
  t = 0;
  private listeners = new Set<Listener>();

  set(t: number) {
    this.t = Math.max(0, t);
    this.listeners.forEach((fn) => fn(this.t));
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.t);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

export const clock = new Clock();

/** DOM handles that non-React code (zoom anchoring, auto-scroll) needs. */
export const dom: { scroll: HTMLDivElement | null; fileInput: HTMLInputElement | null } = {
  scroll: null,
  fileInput: null,
};
