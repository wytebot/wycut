import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { getAiOperationsConfig } from './operations-config';

export type DialogueCue = { startSeconds: number; endSeconds: number; quote?: string; instruction: string };
export type NarrativeBeat = { index: number; id: string; title: string; startSeconds: number; endSeconds: number; narration: string; dialogueCues: DialogueCue[]; act: 1 | 2 | 3 | 4 | 5 };
export type RecapScript = { title: string; targetRuntimeSeconds: number; beats: NarrativeBeat[] };
export type ScriptInput = { title: string; transcript: string; targetRuntimeSeconds?: number; beatCount?: number };

const schema = `Return ONLY JSON with shape {"title":string,"targetRuntimeSeconds":600,"beats":[{"index":1,"id":"intro","title":"Opening hook","startSeconds":0,"endSeconds":12,"narration":"...","dialogueCues":[{"startSeconds":3,"endSeconds":5,"quote":"...","instruction":"LET MOVIE AUDIO PLAY"}],"act":1}]}. Make 10 to 15 distinct beats for the short-form recap workflow (aim for the requested target count), match the narration word-count target supplied in the prompt, and distribute beats across five acts. Timestamps must refer to the supplied transcript/source timeline and must be nonnegative with endSeconds > startSeconds. Never invent exact source timestamps when the input has no timing data: use estimated ranges and state this in title or beat notes. Dialogue cues are optional and must be short; do not reproduce long copyrighted dialogue. Write original commentary, analysis and transitions, not a substitute for watching the film. Acts must be integers 1 through 5. IDs must be short lowercase snake_case.`;

export class ScriptValidationError extends Error { constructor(message: string) { super(message); this.name = 'ScriptValidationError'; } }
function checkedScript(raw: string, count: number, runtime: number, ranges: SourceCueRange[]): RecapScript {
  try { return validateScript(extractJson(raw), count, runtime, ranges); }
  catch (error) { throw new ScriptValidationError(error instanceof Error ? error.message : 'Invalid script.'); }
}
function extractJson(raw: string): unknown {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = clean.indexOf('{'); const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI response did not contain a JSON object.');
  return JSON.parse(clean.slice(start, end + 1));
}
type SourceCueRange = { startSeconds: number; endSeconds: number };
function nearestCueTime(seconds: number, ranges: SourceCueRange[], edge: 'startSeconds' | 'endSeconds') {
  // Snap to the closest real subtitle boundary. Films have long silent stretches, so a
  // fixed distance limit rejected valid scripts; snapping keeps every cut on a real cue.
  let best = ranges[0][edge]; let distance = Math.abs(best - seconds);
  for (const range of ranges) { const candidate = range[edge]; const nextDistance = Math.abs(candidate - seconds); if (nextDistance < distance) { best = candidate; distance = nextDistance; } }
  return best;
}
function validateScript(value: unknown, requestedCount: number, runtime: number, sourceRanges: SourceCueRange[] = []): RecapScript {
  const validSourceRanges = sourceRanges.filter(range => Number.isFinite(range.startSeconds) && Number.isFinite(range.endSeconds) && range.startSeconds >= 0 && range.endSeconds > range.startSeconds);
  const sourceDuration = validSourceRanges.length ? Math.max(...validSourceRanges.map(range => range.endSeconds)) : undefined;
  if (!value || typeof value !== 'object') throw new Error('Invalid script object.');
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string' || !v.title.trim() || !Array.isArray(v.beats)) throw new Error('Script is missing a title or beats array.');
  if (requestedCount >= 10 && requestedCount <= 15 ? (v.beats.length < 10 || v.beats.length > 15) : (v.beats.length < Math.max(8, requestedCount - 12) || v.beats.length > Math.min(70, requestedCount + 12))) throw new Error(`Script returned ${v.beats.length} beats; expected about ${requestedCount}.`);
  const beats = v.beats.map((raw, i) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Beat ${i + 1} is invalid.`);
    const b = raw as Record<string, unknown>;
    let startSeconds = Number(b.startSeconds), endSeconds = Number(b.endSeconds);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds) throw new Error(`Beat ${i + 1} has invalid timestamps.`);
    if (validSourceRanges.length) { startSeconds = nearestCueTime(startSeconds, validSourceRanges, 'startSeconds'); endSeconds = nearestCueTime(endSeconds, validSourceRanges, 'endSeconds'); }
    if (endSeconds <= startSeconds && validSourceRanges.length) {
      const nextEnd = validSourceRanges.map(range => range.endSeconds).filter(value => value > startSeconds).sort((a, b) => a - b)[0];
      if (nextEnd !== undefined) endSeconds = nextEnd;
    }
    if (endSeconds <= startSeconds) throw new Error(`Beat ${i + 1} has an empty or reversed range after subtitle alignment.`);
    if (sourceDuration && endSeconds > sourceDuration + 2) throw new Error(`Beat ${i + 1} ends after the timestamped source transcript (${Math.round(sourceDuration)}s).`);
    if (endSeconds - startSeconds > 180) endSeconds = startSeconds + 180;
    if (typeof b.narration !== 'string' || !b.narration.trim()) throw new Error(`Beat ${i + 1} has no narration.`);
    if (b.narration.length > 3_500) throw new Error(`Beat ${i + 1} narration is too long. Regenerate with shorter beats.`);
    // Dialogue cues are optional extras: drop a malformed cue rather than failing the whole script.
    const cues: DialogueCue[] = [];
    if (Array.isArray(b.dialogueCues)) for (const c of b.dialogueCues.slice(0, 3)) {
      const cue = (c || {}) as Record<string, unknown>;
      let cs = Number(cue.startSeconds), ce = Number(cue.endSeconds);
      if (!Number.isFinite(cs) || !Number.isFinite(ce) || cs < 0 || ce <= cs) continue;
      if (validSourceRanges.length) { cs = nearestCueTime(cs, validSourceRanges, 'startSeconds'); ce = nearestCueTime(ce, validSourceRanges, 'endSeconds'); }
      if (ce <= cs || (sourceDuration && ce > sourceDuration + 2)) continue;
      cues.push({ startSeconds: cs, endSeconds: ce, quote: typeof cue.quote === 'string' ? cue.quote.slice(0, 180) : undefined, instruction: typeof cue.instruction === 'string' ? cue.instruction.slice(0, 100) : 'LET MOVIE AUDIO PLAY' });
    }
    const act = Number(b.act);
    return { index: i + 1, id: (typeof b.id === 'string' ? b.id : `scene_${i + 1}`).toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40), title: typeof b.title === 'string' ? b.title.slice(0, 120) : `Scene ${i + 1}`, startSeconds, endSeconds, narration: b.narration.trim(), dialogueCues: cues, act: (Number.isInteger(act) && act >= 1 && act <= 5 ? act : Math.min(5, Math.floor(i * 5 / Math.max(1, requestedCount)) + 1)) as 1|2|3|4|5 };
  });
  beats.sort((a, b) => a.startSeconds - b.startSeconds);
  beats.forEach((b, i) => { b.index = i + 1; });
  // Models often return slightly overlapping ranges. Trim the overlap rather than discarding the whole script.
  for (let i = 1; i < beats.length; i++) {
    if (beats[i].startSeconds < beats[i - 1].endSeconds) {
      if (beats[i].endSeconds - beats[i - 1].endSeconds >= 1) beats[i].startSeconds = beats[i - 1].endSeconds;
      else if (beats[i - 1].endSeconds - beats[i - 1].startSeconds > 3) beats[i - 1].endSeconds = Math.max(beats[i - 1].startSeconds + 1, beats[i].startSeconds);
      else throw new Error(`Beats ${i} and ${i + 1} overlap on the source timeline; regenerate to avoid duplicate footage.`);
    }
  }
  if (sourceDuration && sourceDuration > runtime * 1.5) {
    if (beats[0].startSeconds > sourceDuration * 0.2 || beats[beats.length - 1].endSeconds < sourceDuration * 0.75) throw new Error('Generated clips do not cover enough of the supplied source timeline. Regenerate using scenes distributed across the full movie, not just its opening.');
  }
  const totalWords = beats.reduce((sum, beat) => sum + beat.narration.split(/\s+/).filter(Boolean).length, 0);
  const minWords = Math.floor((runtime / 60) * 70);
  const maxWords = Math.ceil((runtime / 60) * 210);
  if (totalWords < minWords || totalWords > maxWords) throw new Error(`Narration draft has ${totalWords} words for a ${Math.round(runtime / 60)}-minute target; expected roughly ${minWords}–${maxWords}.`);
  return { title: v.title.slice(0, 160), targetRuntimeSeconds: runtime, beats };
}

export async function generateRecapScript(input: ScriptInput): Promise<{ script: RecapScript; provider: 'gemini' | 'openai' }> {
  const title = input.title.trim().slice(0, 160);
  const transcript = input.transcript.trim();
  if (!title || transcript.length < 40) throw new Error('Provide a title and at least 40 characters of transcript/subtitle text.');
  if (transcript.length > 120_000) throw new Error('Transcript exceeds the 120,000-character limit. Split it into sections first.');
  const runtime = Math.min(900, Math.max(300, Math.floor(input.targetRuntimeSeconds ?? 600)));
  const count = Math.min(15, Math.max(10, Math.floor(input.beatCount ?? 12)));
  const timestampMatches = [...transcript.matchAll(/(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{3})/g)];
  const vttMatches = [...transcript.matchAll(/(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2})\.(\d{3})/g)];
  const sourceRanges: SourceCueRange[] = timestampMatches.length
    ? timestampMatches.map(m => ({ startSeconds: Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]) / 1000, endSeconds: Number(m[5]) * 3600 + Number(m[6]) * 60 + Number(m[7]) + Number(m[8]) / 1000 }))
    : vttMatches.map(m => ({ startSeconds: Number(m[1]) * 60 + Number(m[2]) + Number(m[3]) / 1000, endSeconds: Number(m[4]) * 60 + Number(m[5]) + Number(m[6]) / 1000 }));
  const validRangesForPrompt = sourceRanges.filter(range => Number.isFinite(range.startSeconds) && Number.isFinite(range.endSeconds) && range.startSeconds >= 0 && range.endSeconds > range.startSeconds);
  const sourceDuration = validRangesForPrompt.length ? Math.max(...validRangesForPrompt.map(range => range.endSeconds)) : undefined;
  const operations = await getAiOperationsConfig();
  const prompt = `Write a compelling, original, transformative film recap with commentary—not a substitute for the film and not a reproduction of its dialogue or another recap. Explain the important story events, character goals, turning points, cause-and-effect, stakes, climax and resolution so viewers can follow the story and understand why key scenes matter. Prioritize relevant scenes that meet normal viewer expectations, omit repetitive filler, and cover the full timeline rather than only the opening. Use fresh phrasing and concise analysis; do not copy distinctive dialogue, lyrics, screenplay text, or existing summaries. Do not make claims that wording can evade copyright detection or guarantees fair use/monetization. Do not invent facts or visual details not supported by the transcript. Additional writing guidance: ${operations.script.promptGuidance}. Target runtime: ${runtime} seconds (${Math.round(runtime / 60)} minutes); beats: ${count}; target narration length: about ${Math.round(runtime / 60 * 130)}–${Math.round(runtime / 60 * 160)} words. Film/source title: ${title}. Source transcript duration: ${sourceDuration ? `${Math.round(sourceDuration)} seconds` : 'NOT PROVIDED; do not invent exact timestamps and clearly label timing as estimates'}. When timestamped cues are present, align beat boundaries to real subtitle cues, distribute beats across the full source timeline, and never use the recap narration runtime as the source-video timeline. Every beat should contribute a distinct plot fact, character decision, consequence, or useful interpretation. Each beat is ONE cut of the source video from startSeconds to endSeconds, and its narration will be read aloud over exactly that clip, so write it for that clip: describe only what happens in that stretch of the transcript, size it to the clip length (about 2.3 words per second of endSeconds minus startSeconds, never more than 2.6, and fewer words when dialogueCues let the movie audio play), open with a short natural link from the previous clip, keep names and pronouns consistent, and make the clip lengths add up to about ${runtime} seconds so the beats play back as one continuous story.\n\n${schema}\n\nSOURCE TRANSCRIPT / SUBTITLES:\n${transcript}`;
  const errors: string[] = [];
  const timeoutMs = Math.min(90_000, Math.max(12_000, Number(process.env.AI_PROVIDER_TIMEOUT_MS) || 75_000));
  const startedAt = Date.now();
  let lastErrorCount = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const provider of operations.script.providerOrder) {
      if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
        try {
          const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
          const model = genAI.getGenerativeModel(
            { model: operations.script.geminiModel, systemInstruction: operations.script.systemInstruction },
            { timeout: timeoutMs },
          );
          // The REST API supports thinkingConfig for Gemini 2.5, but the legacy
          // @google/generative-ai TypeScript declaration omits it. Keep the API
          // request field while narrowing at this SDK compatibility boundary.
          const request = {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: 'application/json',
              temperature: operations.script.temperature,
              maxOutputTokens: 10000,
              thinkingConfig: { thinkingBudget: 0 },
            },
          } as Parameters<typeof model.generateContent>[0];
          const result = await model.generateContent(request);
          return { script: checkedScript(result.response.text(), count, runtime, sourceRanges), provider: 'gemini' };
        } catch (error) {
          errors.push(`Gemini (${operations.script.geminiModel}): ${error instanceof ScriptValidationError ? '[invalid] ' : ''}${error instanceof Error ? error.message : 'request failed'}`);
        }
      }
      if (provider === 'openai' && process.env.OPENAI_API_KEY) {
        try {
          const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: timeoutMs, maxRetries: 0 });
          const result = await openai.chat.completions.create({
            model: operations.script.openaiModel,
            temperature: operations.script.temperature,
            max_tokens: 10000,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: operations.script.systemInstruction },
              { role: 'user', content: prompt },
            ],
          });
          const content = result.choices[0]?.message.content;
          if (!content) throw new Error('Provider returned an empty response.');
          return { script: checkedScript(content, count, runtime, sourceRanges), provider: 'openai' };
        } catch (error) {
          errors.push(`OpenAI (${operations.script.openaiModel}): ${error instanceof ScriptValidationError ? '[invalid] ' : ''}${error instanceof Error ? error.message : 'request failed'}`);
        }
      }
    }
    // Retry once only when a model answered but its script failed validation (models are non-deterministic).
    const newErrors = errors.slice(lastErrorCount); lastErrorCount = errors.length;
    const onlyValidation = newErrors.length > 0 && newErrors.every(message => message.includes('[invalid]'));
    if (!onlyValidation || Date.now() - startedAt > 45_000) break;
  }
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) throw new Error('Configure GEMINI_API_KEY or OPENAI_API_KEY on the server.');
  throw new Error(`AI providers failed. ${errors.join(' | ')}`);
}
