import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { getAiOperationsConfig } from './operations-config';

export type DialogueCue = { startSeconds: number; endSeconds: number; quote?: string; instruction: string };
export type NarrativeBeat = { index: number; id: string; title: string; startSeconds: number; endSeconds: number; narration: string; dialogueCues: DialogueCue[]; act: 1 | 2 | 3 | 4 | 5 };
export type RecapScript = { title: string; targetRuntimeSeconds: number; beats: NarrativeBeat[] };
export type ScriptInput = { title: string; transcript: string; targetRuntimeSeconds?: number; beatCount?: number };

const schema = `Return ONLY JSON with shape {"title":string,"targetRuntimeSeconds":600,"beats":[{"index":1,"id":"intro","title":"Opening hook","startSeconds":0,"endSeconds":12,"narration":"...","dialogueCues":[{"startSeconds":3,"endSeconds":5,"quote":"...","instruction":"LET MOVIE AUDIO PLAY"}],"act":1}]}. Make 35-40 distinct beats, total narration approximately 1300-1600 words for a ten-minute recap, and distribute beats across five acts. Timestamps must refer to the supplied transcript/source timeline and must be nonnegative with endSeconds > startSeconds. Never invent exact source timestamps when the input has no timing data: use estimated ranges and state this in title or beat notes. Dialogue cues are optional and must be short; do not reproduce long copyrighted dialogue. Write original commentary, analysis and transitions, not a substitute for watching the film. Acts must be integers 1 through 5. IDs must be short lowercase snake_case.`;

function extractJson(raw: string): unknown {
  const clean = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = clean.indexOf('{'); const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI response did not contain a JSON object.');
  return JSON.parse(clean.slice(start, end + 1));
}
function validateScript(value: unknown, requestedCount: number, runtime: number): RecapScript {
  if (!value || typeof value !== 'object') throw new Error('Invalid script object.');
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string' || !Array.isArray(v.beats)) throw new Error('Script is missing title or beats.');
  if (v.beats.length < Math.min(10, requestedCount) || v.beats.length > 60) throw new Error('Script beat count is outside accepted bounds.');
  const beats = v.beats.map((raw, i) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Beat ${i + 1} is invalid.`);
    const b = raw as Record<string, unknown>;
    const startSeconds = Number(b.startSeconds), endSeconds = Number(b.endSeconds);
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds) throw new Error(`Beat ${i + 1} has invalid timestamps.`);
    if (typeof b.narration !== 'string' || !b.narration.trim()) throw new Error(`Beat ${i + 1} has no narration.`);
    if (b.narration.length > 3_500) throw new Error(`Beat ${i + 1} narration is too long. Regenerate with shorter beats.`);
    const cues = Array.isArray(b.dialogueCues) ? b.dialogueCues.map((c, j) => {
      const cue = c as Record<string, unknown>;
      const cs = Number(cue.startSeconds), ce = Number(cue.endSeconds);
      if (!Number.isFinite(cs) || !Number.isFinite(ce) || cs < 0 || ce <= cs) throw new Error(`Beat ${i + 1} cue ${j + 1} has invalid timestamps.`);
      return { startSeconds: cs, endSeconds: ce, quote: typeof cue.quote === 'string' ? cue.quote.slice(0, 180) : undefined, instruction: typeof cue.instruction === 'string' ? cue.instruction.slice(0, 100) : 'LET MOVIE AUDIO PLAY' };
    }) : [];
    const act = Number(b.act);
    return { index: i + 1, id: (typeof b.id === 'string' ? b.id : `scene_${i + 1}`).toLowerCase().replace(/[^a-z0-9_]+/g, '_').slice(0, 40), title: typeof b.title === 'string' ? b.title.slice(0, 120) : `Scene ${i + 1}`, startSeconds, endSeconds, narration: b.narration.trim(), dialogueCues: cues, act: (Number.isInteger(act) && act >= 1 && act <= 5 ? act : Math.min(5, Math.floor(i * 5 / Math.max(1, requestedCount)) + 1)) as 1|2|3|4|5 };
  });
  beats.sort((a, b) => a.startSeconds - b.startSeconds);
  beats.forEach((b, i) => { b.index = i + 1; });
  return { title: v.title.slice(0, 160), targetRuntimeSeconds: runtime, beats };
}

export async function generateRecapScript(input: ScriptInput): Promise<{ script: RecapScript; provider: 'gemini' | 'openai' }> {
  const title = input.title.trim().slice(0, 160);
  const transcript = input.transcript.trim();
  if (!title || transcript.length < 40) throw new Error('Provide a title and at least 40 characters of transcript/subtitle text.');
  if (transcript.length > 120_000) throw new Error('Transcript exceeds the 120,000-character limit. Split it into sections first.');
  const runtime = Math.min(900, Math.max(300, Math.floor(input.targetRuntimeSeconds ?? 600)));
  const count = Math.min(45, Math.max(10, Math.floor(input.beatCount ?? 38)));
  const operations = await getAiOperationsConfig();
  const prompt = `Act as an experienced film-recap writer. Create an original, analytical recap script using only the source context below. Avoid long verbatim dialogue and avoid claiming the recap is guaranteed to qualify for monetization. Additional writing guidance: ${operations.script.promptGuidance}. Target runtime: ${runtime} seconds; beats: ${count}. Film/source title: ${title}.\n\n${schema}\n\nSOURCE TRANSCRIPT / SUBTITLES:\n${transcript}`;
  const errors: string[] = [];
  const timeoutMs = Math.min(60_000, Math.max(12_000, Number(process.env.AI_PROVIDER_TIMEOUT_MS) || 35_000));
  for (const provider of operations.script.providerOrder) {
    if (provider === 'gemini' && process.env.GEMINI_API_KEY) {
      try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel(
          { model: operations.script.geminiModel, systemInstruction: operations.script.systemInstruction },
          { timeout: timeoutMs },
        );
        const result = await model.generateContent({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: operations.script.temperature, maxOutputTokens: 6000 },
        });
        return { script: validateScript(extractJson(result.response.text()), count, runtime), provider: 'gemini' };
      } catch (error) {
        errors.push(`Gemini (${operations.script.geminiModel}): ${error instanceof Error ? error.message : 'request failed'}`);
      }
    }
    if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: timeoutMs, maxRetries: 0 });
        const result = await openai.chat.completions.create({
          model: operations.script.openaiModel,
          temperature: operations.script.temperature,
          max_tokens: 6000,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: operations.script.systemInstruction },
            { role: 'user', content: prompt },
          ],
        });
        const content = result.choices[0]?.message.content;
        if (!content) throw new Error('Provider returned an empty response.');
        return { script: validateScript(extractJson(content), count, runtime), provider: 'openai' };
      } catch (error) {
        errors.push(`OpenAI (${operations.script.openaiModel}): ${error instanceof Error ? error.message : 'request failed'}`);
      }
    }
  }
  if (!process.env.GEMINI_API_KEY && !process.env.OPENAI_API_KEY) throw new Error('Configure GEMINI_API_KEY or OPENAI_API_KEY on the server.');
  throw new Error(`AI providers failed or timed out. ${errors.join(' | ')}`);
}
