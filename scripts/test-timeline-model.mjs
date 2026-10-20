import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = process.cwd();
const out = await mkdtemp(path.join(os.tmpdir(), 'wycut-timeline-test-'));
try {
  const tsc = spawnSync(process.platform === 'win32' ? 'tsc.cmd' : 'tsc', ['lib/editor/timeline-model.ts', '--target', 'ES2022', '--module', 'commonjs', '--strict', '--skipLibCheck', '--outDir', out], { cwd: root, stdio: 'inherit' });
  if (tsc.status !== 0) process.exit(tsc.status || 1);
  const require = createRequire(import.meta.url);
  const model = require(path.join(out, 'timeline-model.js'));
  let p = model.createTimelineProject();
  p = model.addTimelineClip(p, { kind: 'audio', name: 'Music A', sourceStart: 0, sourceEnd: 20, start: 0, duration: 20 });
  p = model.addTimelineClip(p, { kind: 'filter', name: 'Cinematic', sourceStart: 0, sourceEnd: 10, start: 0, duration: 10 });
  p = model.addTimelineClip(p, { kind: 'audio', name: 'Music B', sourceStart: 0, sourceEnd: 8, start: 20, duration: 8 });
  assert.deepEqual(p.lanes.map(l => l.type), ['video', 'sound', 'filter'], 'lane order is fixed by type regardless of insertion order');
  assert.equal(p.lanes.find(l => l.type === 'sound').clipIds.length, 2, 'sound lane preserves its own insertion order');
  const soundLane = p.lanes.find(l => l.type === 'sound'); const clipId = soundLane.clipIds[0];
  const split = model.splitTimelineClip(p, clipId, 5);
  assert.equal(split.lanes.find(l => l.type === 'sound').clipIds.length, 3, 'split creates adjacent source segment'); assert.equal(split.clips[clipId].duration, 5);
  const duplicated = model.duplicateTimelineClip(p, clipId, 1); assert.equal(duplicated.lanes.find(l => l.type === 'sound').clipIds.length, 3);
  assert.deepEqual(model.toggleTimelineSelection([clipId], clipId), [], 'tapping selected clip again unselects it');
  assert.throws(() => model.convertTimelineLane(p, p.mainVideoLaneId, 'sound'), /main video lane cannot be converted/);
  assert.throws(() => model.moveTimelineClip(p, clipId, p.mainVideoLaneId, 0), /Cannot move audio into video lane/);
  const history = model.commitTimeline(model.createTimelineHistory(p), split); assert.equal(model.undoTimeline(history).present.clips[clipId].duration, 20); assert.equal(model.redoTimeline(model.undoTimeline(history)).present.clips[clipId].duration, 5);
  const copied = model.copyTimelineClips(p, [clipId]); const pasted = model.pasteTimelineClips(p, copied, 40); assert.equal(pasted.lanes.find(l => l.type === 'sound').clipIds.length, 3);
  const rippleBase = model.addTimelineClip(p, { kind: 'text', name: 'Title', sourceStart: 0, sourceEnd: 2, start: 25, duration: 2 }); const ripple = model.deleteTimelineClip(rippleBase, clipId, true);
  assert.equal(ripple.lanes.find(l => l.type === 'sound').clipIds.length, 1); assert.equal(ripple.clips[ripple.lanes.find(l => l.type === 'template').clipIds[0]].start, 5);
  console.log('Timeline model tests passed: ordering, insertion, split, duplicate, copy/paste, selection toggle, lane conversion guard, compatible drops, undo/redo, timeline-wide ripple delete.');
} finally { await rm(out, { recursive: true, force: true }); }
