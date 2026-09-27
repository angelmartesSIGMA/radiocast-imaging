export function normalize(chs: Float32Array[], peak = 0.89): void {
  let m = 0;
  for (const c of chs)
    for (let i = 0; i < c.length; i += 3) {
      const a = Math.abs(c[i]);
      if (a > m) m = a;
    }
  if (!m) return;
  const k = peak / m;
  for (const c of chs) for (let i = 0; i < c.length; i++) c[i] *= k;
}

/** Mirrored peak envelope as an SVG path in a 100×40 viewBox. */
export function wavePath(ch: Float32Array, bins = 160): string {
  const n = ch.length;
  const step = Math.max(1, Math.floor(n / bins));
  const peaks: number[] = [];
  let m = 0;
  for (let b = 0; b < bins; b++) {
    let mx = 0;
    const s = b * step;
    const e = Math.min(n, s + step);
    for (let i = s; i < e; i += 4) {
      const a = Math.abs(ch[i]);
      if (a > mx) mx = a;
    }
    peaks.push(mx);
    if (mx > m) m = mx;
  }
  m = m || 1;
  let top = "M0 20";
  let bot = "";
  for (let b = 0; b < bins; b++) {
    const x = (((b + 0.5) / bins) * 100).toFixed(2);
    const h = Math.max(0.5, (peaks[b] / m) * 19);
    top += ` L${x} ${(20 - h).toFixed(2)}`;
    bot = ` L${x} ${(20 + h).toFixed(2)}` + bot;
  }
  return `${top} L100 20${bot} Z`;
}

/** 16-bit PCM WAV. */
export function encodeWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i));
  };
  w(0, "RIFF");
  out.setUint32(4, 36 + len * ch * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  w(36, "data");
  out.setUint32(40, len * ch * 2, true);
  const data: Float32Array[] = [];
  for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < len; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, data[c][i]));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  return new Blob([out], { type: "audio/wav" });
}

/** Peak (linear) of a rendered buffer. */
export function bufferPeak(buf: AudioBuffer): number {
  let m = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > m) m = a;
    }
  }
  return m;
}
