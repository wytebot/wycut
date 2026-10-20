/**
 * Versioned, renderer-neutral timeline model.
 *
 * Existing WyCut projects are migrated at the boundary; new editing code should use
 * this model rather than adding more fields to the legacy single-plan object.
 */
export const TIMELINE_SCHEMA_VERSION = 1 as const;
export type LaneType = 'video' | 'sound' | 'filter' | 'template';
export const LANE_ORDER: readonly LaneType[] = ['video', 'sound', 'filter', 'template'];

export type TimelineClip = {
  id: string;
  laneId: string;
  kind: 'video' | 'image' | 'audio' | 'filter' | 'text' | 'template' | 'sticker';
  name: string;
  sourceId?: string;
  sourceStart: number;
  sourceEnd: number;
  start: number;
  duration: number;
  locked?: boolean;
  premiumAssetId?: string;
  effects?: Array<{ id: string; params: Record<string, unknown> }>;
  keyframes?: Array<{ time: number; property: string; value: number | string; easing?: string }>;
  audio?: { volume: number; fadeIn: number; fadeOut: number; reverse?: boolean; speed?: number };
};
export type TimelineLane = { id: string; type: LaneType; name: string; clipIds: string[]; locked?: boolean };
export type TimelineProject = {
  schemaVersion: typeof TIMELINE_SCHEMA_VERSION;
  duration: number;
  mainVideoLaneId: string;
  lanes: TimelineLane[];
  clips: Record<string, TimelineClip>;
  updatedAt: number;
};
export type LegacyTimelineInput = {
  duration?: number;
  video?: { id?: string; name?: string; duration?: number; sourceStart?: number; sourceEnd?: number };
  sounds?: Array<{ id?: string; name?: string; startSeconds?: number; durationSeconds?: number; volume?: number }>;
  filters?: Array<{ id?: string; name?: string; start?: number; duration?: number }>;
  texts?: Array<{ id?: string; name?: string; start?: number; duration?: number }>;
};

const makeId = (prefix: string) => `${prefix}_${Math.random().toString(36).slice(2, 10)}_${Date.now().toString(36)}`;
const finite = (n: unknown, fallback = 0) => Number.isFinite(Number(n)) ? Number(n) : fallback;
const nonnegative = (n: unknown) => Math.max(0, finite(n));
function laneTypeFor(kind: TimelineClip['kind']): LaneType {
  if (kind === 'video' || kind === 'image') return 'video';
  if (kind === 'audio') return 'sound';
  if (kind === 'filter') return 'filter';
  return 'template';
}
export function sortLanes(lanes: TimelineLane[]): TimelineLane[] {
  return [...lanes].sort((a, b) => LANE_ORDER.indexOf(a.type) - LANE_ORDER.indexOf(b.type));
}
export function createTimelineProject(): TimelineProject {
  const mainId = 'lane_main_video';
  return {
    schemaVersion: TIMELINE_SCHEMA_VERSION, duration: 0, mainVideoLaneId: mainId,
    lanes: [{ id: mainId, type: 'video', name: 'Main video', clipIds: [], locked: true }],
    clips: {}, updatedAt: Date.now(),
  };
}
export function migrateLegacyTimeline(input: LegacyTimelineInput): TimelineProject {
  const project = createTimelineProject();
  const add = (kind: TimelineClip['kind'], value: { id?: string; name?: string; start?: number; startSeconds?: number; duration?: number; durationSeconds?: number; sourceStart?: number; sourceEnd?: number; volume?: number }) => {
    const laneType = laneTypeFor(kind);
    let lane = project.lanes.find(l => l.type === laneType && (laneType !== 'video' || l.id === project.mainVideoLaneId));
    if (!lane) {
      lane = { id: makeId(`lane_${laneType}`), type: laneType, name: laneType === 'sound' ? 'Sound' : laneType === 'filter' ? 'Filters' : 'Text & templates', clipIds: [] };
      project.lanes.push(lane);
    }
    const start = nonnegative(value.start ?? value.startSeconds);
    const duration = Math.max(0.01, nonnegative(value.duration ?? value.durationSeconds) || (kind === 'video' ? finite(input.video?.duration, 0) : 1));
    const clip: TimelineClip = {
      id: value.id || makeId('clip'), laneId: lane.id, kind, name: value.name || kind,
      sourceStart: nonnegative(value.sourceStart), sourceEnd: Math.max(nonnegative(value.sourceEnd), nonnegative(value.sourceStart) + duration),
      start, duration, ...(kind === 'audio' ? { audio: { volume: Math.max(0, Math.min(200, finite(value.volume, 100))), fadeIn: 0, fadeOut: 0, speed: 1 } } : {}),
    };
    project.clips[clip.id] = clip; lane.clipIds.push(clip.id);
    project.duration = Math.max(project.duration, clip.start + clip.duration);
  };
  if (input.video) add('video', { ...input.video, duration: input.video.duration });
  for (const item of input.sounds || []) add('audio', item);
  for (const item of input.filters || []) add('filter', item);
  for (const item of input.texts || []) add('text', item);
  project.lanes = sortLanes(project.lanes);
  project.duration = Math.max(project.duration, nonnegative(input.duration));
  project.updatedAt = Date.now();
  return project;
}
export function addTimelineClip(project: TimelineProject, input: Omit<TimelineClip, 'id' | 'laneId'> & { id?: string; laneId?: string }): TimelineProject {
  const next = structuredClone(project);
  const id = input.id || makeId('clip');
  const type = laneTypeFor(input.kind);
  let lane = input.laneId ? next.lanes.find(l => l.id === input.laneId) : undefined;
  if (lane && lane.type !== type) throw new Error(`A ${input.kind} clip cannot be placed in a ${lane.type} lane.`);
  if (!lane) lane = next.lanes.find(l => l.type === type && (type !== 'video' || l.id === next.mainVideoLaneId));
  if (!lane) {
    lane = { id: makeId(`lane_${type}`), type, name: type === 'sound' ? 'Sound' : type === 'filter' ? 'Filters' : 'Text & templates', clipIds: [] };
    next.lanes.push(lane);
  }
  if (next.clips[id]) throw new Error(`Clip ID already exists: ${id}`);
  const clip: TimelineClip = { ...input, id, laneId: lane.id, sourceStart: nonnegative(input.sourceStart), sourceEnd: Math.max(nonnegative(input.sourceEnd), nonnegative(input.sourceStart) + Math.max(0.01, input.duration)), start: nonnegative(input.start), duration: Math.max(0.01, nonnegative(input.duration)) };
  next.clips[id] = clip; lane.clipIds.push(id); next.lanes = sortLanes(next.lanes);
  next.duration = Math.max(next.duration, clip.start + clip.duration); next.updatedAt = Date.now();
  return next;
}
export function moveTimelineClip(project: TimelineProject, clipId: string, targetLaneId: string, start: number): TimelineProject {
  const next = structuredClone(project); const clip = next.clips[clipId]; const target = next.lanes.find(l => l.id === targetLaneId);
  if (!clip || !target) throw new Error('Clip or target lane does not exist.');
  if (target.type !== laneTypeFor(clip.kind)) throw new Error(`Cannot move ${clip.kind} into ${target.type} lane.`);
  if (clip.locked) throw new Error('This clip is locked.');
  const from = next.lanes.find(l => l.id === clip.laneId)!;
  from.clipIds = from.clipIds.filter(id => id !== clipId);
  if (!target.clipIds.includes(clipId)) target.clipIds.push(clipId);
  clip.laneId = target.id; clip.start = nonnegative(start);
  next.duration = Math.max(0, ...Object.values(next.clips).map(c => c.start + c.duration)); next.updatedAt = Date.now();
  return next;
}
export function convertTimelineLane(project: TimelineProject, laneId: string, type: LaneType): TimelineProject {
  const next = structuredClone(project); const lane = next.lanes.find(l => l.id === laneId);
  if (!lane) throw new Error('Lane does not exist.');
  if (lane.id === next.mainVideoLaneId && type !== 'video') throw new Error('The main video lane cannot be converted away from video.');
  if (lane.clipIds.some(id => laneTypeFor(next.clips[id].kind) !== type)) throw new Error('Move or convert the lane clips first; this lane contains incompatible clip types.');
  lane.type = type; lane.name = type === 'video' ? 'Video / Image' : type === 'sound' ? 'Sound' : type === 'filter' ? 'Filters' : 'Text & templates';
  next.lanes = sortLanes(next.lanes); next.updatedAt = Date.now(); return next;
}
export function splitTimelineClip(project: TimelineProject, clipId: string, atProjectTime: number): TimelineProject {
  const next = structuredClone(project); const clip = next.clips[clipId];
  if (!clip || clip.locked) throw new Error('Clip is missing or locked.');
  const offset = atProjectTime - clip.start;
  if (offset <= 0.01 || offset >= clip.duration - 0.01) throw new Error('Split point must be inside the clip.');
  const rightId = makeId('clip');
  const left = next.clips[clipId]; const right = { ...left, id: rightId, start: atProjectTime, duration: left.duration - offset, sourceStart: left.sourceStart + offset };
  left.duration = offset; left.sourceEnd = left.sourceStart + offset;
  next.clips[rightId] = right; next.lanes.find(l => l.id === clip.laneId)!.clipIds.splice(next.lanes.find(l => l.id === clip.laneId)!.clipIds.indexOf(clipId) + 1, 0, rightId);
  next.updatedAt = Date.now(); return next;
}
export function deleteTimelineClip(project: TimelineProject, clipId: string, ripple = false): TimelineProject {
  const next = structuredClone(project); const clip = next.clips[clipId];
  if (!clip) return next;
  if (clip.locked) throw new Error('Unlock the clip before deleting it.');
  const lane = next.lanes.find(l => l.id === clip.laneId)!; lane.clipIds = lane.clipIds.filter(id => id !== clipId); delete next.clips[clipId];
  if (ripple) {
    const cutStart = clip.start; const cutEnd = clip.start + clip.duration;
    // Ripple deletion is timeline-wide: later clips on sound, filter, and template lanes must
    // follow the gap closed on the main edit, not remain stranded at their old timestamps.
    for (const other of Object.values(next.clips)) {
      if (other.start >= cutEnd - 0.001) other.start = Math.max(0, other.start - clip.duration);
      else if (other.start < cutStart && other.start + other.duration > cutStart) {
        const overlap = Math.min(other.start + other.duration, cutEnd) - cutStart;
        if (overlap > 0) { other.duration = Math.max(0.01, other.duration - overlap); other.sourceEnd = Math.max(other.sourceStart + 0.01, other.sourceEnd - overlap); }
      }
    }
  }
  next.duration = Math.max(0, ...Object.values(next.clips).map(c => c.start + c.duration)); next.updatedAt = Date.now(); return next;
}
export function copyTimelineClips(project: TimelineProject, clipIds: string[]): TimelineClip[] {
  const unique = [...new Set(clipIds)];
  return unique.map(id => project.clips[id]).filter((clip): clip is TimelineClip => Boolean(clip)).map(clip => structuredClone(clip));
}
export function pasteTimelineClips(project: TimelineProject, copied: TimelineClip[], atTime: number): TimelineProject {
  if (!copied.length) return project;
  const anchor = Math.min(...copied.map(clip => clip.start));
  let next = structuredClone(project);
  for (const clip of copied) {
    const lane = next.lanes.find(l => l.id === clip.laneId && l.type === laneTypeFor(clip.kind));
    if (!lane) continue;
    next = addTimelineClip(next, { ...clip, id: undefined, laneId: lane.id, name: `${clip.name} copy`, start: Math.max(0, atTime + clip.start - anchor) });
  }
  return next;
}
export function toggleTimelineSelection(selectedIds: string[], clipId: string): string[] {
  return selectedIds.includes(clipId) ? selectedIds.filter(id => id !== clipId) : [...selectedIds, clipId];
}
export function trimTimelineClip(project: TimelineProject, clipId: string, start: number, end: number): TimelineProject {
  const next = structuredClone(project); const clip = next.clips[clipId];
  if (!clip || clip.locked) throw new Error('Clip is missing or locked.');
  const newStart = nonnegative(start), newEnd = Math.max(newStart + 0.01, nonnegative(end));
  const delta = newStart - clip.start; clip.sourceStart = Math.max(0, clip.sourceStart + delta); clip.sourceEnd = clip.sourceStart + (newEnd - newStart);
  clip.start = newStart; clip.duration = newEnd - newStart; next.duration = Math.max(0, ...Object.values(next.clips).map(c => c.start + c.duration)); next.updatedAt = Date.now(); return next;
}
export function duplicateTimelineClip(project: TimelineProject, clipId: string, offset = 0.25): TimelineProject {
  const clip = project.clips[clipId]; if (!clip) throw new Error('Clip does not exist.');
  return addTimelineClip(project, { ...clip, id: undefined, laneId: clip.laneId, name: `${clip.name} copy`, start: clip.start + Math.max(0.01, offset) });
}
export type TimelineHistory = { past: TimelineProject[]; present: TimelineProject; future: TimelineProject[] };
export function createTimelineHistory(project = createTimelineProject()): TimelineHistory { return { past: [], present: project, future: [] }; }
export function commitTimeline(history: TimelineHistory, project: TimelineProject): TimelineHistory {
  return { past: [...history.past, history.present], present: project, future: [] };
}
export function undoTimeline(history: TimelineHistory): TimelineHistory {
  if (!history.past.length) return history;
  return { past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future] };
}
export function redoTimeline(history: TimelineHistory): TimelineHistory {
  if (!history.future.length) return history;
  return { past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1) };
}
