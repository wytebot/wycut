/**
 * Frame-accurate manual cutting helpers. Pure functions (no React, no DOM) so they can be unit tested.
 * A "segment" is a range of the SOURCE video that stays in the final edit.
 */
export type Segment = { start: number; end: number };

export const MIN_SEGMENT_SECONDS = 0.1;
export const DEFAULT_FPS = 30;

/** Snap a time to the nearest frame boundary. Cuts on frame boundaries never land between two frames. */
export function snapToFrame(t: number, fps = DEFAULT_FPS): number {
  const f = Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS;
  return Math.max(0, Math.round(t * f) / f);
}

/** Length of one frame in seconds. */
export function frameDuration(fps = DEFAULT_FPS): number {
  return 1 / (Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS);
}

/** Index of the segment that contains t, or -1 when t is in a removed gap. */
export function segmentAt(segments: Segment[], t: number): number {
  return segments.findIndex(s => t >= s.start - 1e-6 && t < s.end - 1e-6);
}

/**
 * Split the segment under `t` into two. Returns null when t is too close to an edge (would make a sliver),
 * so the caller can tell the user instead of creating an unusable clip.
 */
export function splitAt(segments: Segment[], t: number, fps = DEFAULT_FPS): { segments: Segment[]; index: number } | null {
  const at = snapToFrame(t, fps);
  const i = segmentAt(segments, at);
  if (i < 0) return null;
  const s = segments[i];
  const minLen = Math.max(MIN_SEGMENT_SECONDS, frameDuration(fps));
  if (at - s.start < minLen || s.end - at < minLen) return null;
  const next = [...segments];
  next.splice(i, 1, { start: s.start, end: at }, { start: at, end: s.end });
  return { segments: next, index: i + 1 };
}

/** Move one edge of a segment. The edge is frame-snapped, kept inside the video and kept clear of the neighbouring segment. */
export function trimEdge(segments: Segment[], index: number, edge: 'start' | 'end', t: number, duration: number, fps = DEFAULT_FPS): Segment[] {
  const s = segments[index];
  if (!s) return segments;
  const minLen = Math.max(MIN_SEGMENT_SECONDS, frameDuration(fps));
  let value = snapToFrame(t, fps);
  if (edge === 'start') value = Math.min(Math.max(0, value), s.end - minLen);
  else value = Math.max(Math.min(duration, value), s.start + minLen);
  if (Math.abs(value - s[edge]) < 1e-9) return segments;
  return segments.map((x, j) => (j === index ? { ...x, [edge]: value } : x));
}

/** Remove a segment. Always keeps at least one. */
export function removeSegment(segments: Segment[], index: number): Segment[] {
  if (segments.length <= 1 || index < 0 || index >= segments.length) return segments;
  return segments.filter((_, i) => i !== index);
}

/** Time ranges of the source that are NOT part of the edit (shown dimmed on the timeline). */
export function gapsOf(segments: Segment[], duration: number): Segment[] {
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const gaps: Segment[] = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start - cursor > 0.02) gaps.push({ start: cursor, end: s.start });
    cursor = Math.max(cursor, s.end);
  }
  if (duration - cursor > 0.02) gaps.push({ start: cursor, end: duration });
  return gaps;
}

/**
 * While previewing, jump over removed parts so playback matches the exported edit.
 * Returns the time to jump to, null when no jump is needed, or Infinity when playback has run past the last segment.
 */
export function playbackJump(segments: Segment[], t: number): number | null {
  if (!segments.length) return null;
  if (segmentAt(segments, t) >= 0) return null;
  const later = segments.filter(s => s.start > t).sort((a, b) => a.start - b.start)[0];
  return later ? later.start : Infinity;
}

/** Total length of the edit in seconds, after the removed parts are gone. */
export function editedLength(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + Math.max(0, s.end - s.start), 0);
}

/** Playhead time on the edited timeline for a source time (used by the clock so it shows the real final length). */
export function sourceToEdited(segments: Segment[], t: number): number {
  let acc = 0;
  for (const s of segments) {
    if (t >= s.end) acc += s.end - s.start;
    else if (t > s.start) return acc + (t - s.start);
    else return acc;
  }
  return acc;
}

/**
 * Turns a measured frame rate into the exact rate the file uses. Phones and cameras record 29.97 / 23.976 / 59.94,
 * and treating those as 30 / 24 / 60 would drift by several frames over a few minutes, so a cut would land on the wrong frame.
 */
export function normalizeFps(measured: number): number {
  if (!Number.isFinite(measured) || measured < 10 || measured > 240) return DEFAULT_FPS;
  const known = [24000 / 1001, 24, 25, 30000 / 1001, 30, 48, 50, 60000 / 1001, 60, 120];
  let best = known[0];
  for (const k of known) if (Math.abs(k - measured) < Math.abs(best - measured)) best = k;
  return Math.abs(best - measured) / best < 0.02 ? best : Math.round(measured * 1000) / 1000;
}
