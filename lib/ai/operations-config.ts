import localConfig from '@/config/ai-operations.json';

type AiOperationsConfig = {
  version: 1;
  script: {
    providerOrder: Array<'gemini' | 'openai'>;
    geminiModel: string;
    openaiModel: string;
    temperature: number;
    systemInstruction: string;
    promptGuidance: string;
  };
  tts: { openaiModel: string; deepgramModel: string; maxConcurrency: number };
};

const fallback = localConfig as unknown as AiOperationsConfig;
let cached: { value: AiOperationsConfig; expiresAt: number } | undefined;
const CONFIG_TTL_MS = 5 * 60 * 1000;
const CONFIG_FETCH_TIMEOUT_MS = 800;
const safeModel = (value: unknown, fallbackValue: string) => typeof value === 'string' && /^[a-zA-Z0-9._:-]{1,100}$/.test(value) ? value : fallbackValue;

function validateRemote(value: unknown): AiOperationsConfig {
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Partial<AiOperationsConfig>;
  const script = raw.script as Partial<AiOperationsConfig['script']> | undefined;
  const tts = raw.tts as Partial<AiOperationsConfig['tts']> | undefined;
  const providerOrder = Array.isArray(script?.providerOrder)
    ? script.providerOrder.filter((p): p is 'gemini' | 'openai' => p === 'gemini' || p === 'openai')
    : fallback.script.providerOrder;
  const temperature = Number(script?.temperature);
  const concurrency = Number(tts?.maxConcurrency);
  return {
    version: 1,
    script: {
      providerOrder: providerOrder.length ? [...new Set(providerOrder)] : fallback.script.providerOrder,
      geminiModel: safeModel(script?.geminiModel, fallback.script.geminiModel),
      openaiModel: safeModel(script?.openaiModel, fallback.script.openaiModel),
      temperature: Number.isFinite(temperature) ? Math.min(1, Math.max(0, temperature)) : fallback.script.temperature,
      systemInstruction: typeof script?.systemInstruction === 'string' ? script.systemInstruction.slice(0, 3000) : fallback.script.systemInstruction,
      promptGuidance: typeof script?.promptGuidance === 'string' ? script.promptGuidance.slice(0, 3000) : fallback.script.promptGuidance,
    },
    tts: {
      openaiModel: safeModel(tts?.openaiModel, fallback.tts.openaiModel),
      deepgramModel: safeModel(tts?.deepgramModel, fallback.tts.deepgramModel),
      maxConcurrency: Number.isFinite(concurrency) ? Math.min(4, Math.max(1, Math.floor(concurrency))) : fallback.tts.maxConcurrency,
    },
  };
}

/** Optional, non-secret config source for a separate AI-operations repository. Cached per server instance; local config is the immediate fallback. */
export async function getAiOperationsConfig(): Promise<AiOperationsConfig> {
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let value = fallback;
  const url = process.env.AI_OPERATIONS_CONFIG_URL;
  if (url) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') throw new Error('AI operations config URL must use HTTPS.');
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), CONFIG_FETCH_TIMEOUT_MS);
      try {
        const token = process.env.AI_OPERATIONS_CONFIG_TOKEN;
        const headers: Record<string, string> = { Accept: parsed.hostname === 'api.github.com' ? 'application/vnd.github+json' : 'application/json' };
        if (token && parsed.hostname === 'api.github.com') headers.Authorization = `Bearer ${token}`;
        const response = await fetch(parsed.toString(), { signal: controller.signal, cache: 'no-store', headers });
        if (response.ok) {
          const length = Number(response.headers.get('content-length') || 0);
          if (length > 32_768) throw new Error('AI operations config is too large.');
          const body = await response.text();
          if (body.length <= 32_768) {
            const parsedBody = JSON.parse(body) as unknown;
            // GitHub Contents API wraps private file contents in base64; public raw URLs can return plain JSON.
            if (parsedBody && typeof parsedBody === 'object' && 'content' in parsedBody && 'encoding' in parsedBody) {
              const wrapped = parsedBody as { content?: unknown; encoding?: unknown };
              if (wrapped.encoding === 'base64' && typeof wrapped.content === 'string') {
                const decoded = Buffer.from(wrapped.content.replace(/\s/g, ''), 'base64').toString('utf8');
                if (decoded.length <= 32_768) value = validateRemote(JSON.parse(decoded));
              }
            } else value = validateRemote(parsedBody);
          }
        }
      } finally { clearTimeout(timeout); }
    } catch { /* Fast, safe fallback: continue with bundled config. */ }
  }
  // Environment variables remain the operator-controlled emergency override.
  value = validateRemote({
    ...value,
    script: { ...value.script,
      geminiModel: process.env.GEMINI_MODEL || value.script.geminiModel,
      openaiModel: process.env.OPENAI_SCRIPT_MODEL || value.script.openaiModel,
      providerOrder: process.env.AI_SCRIPT_PROVIDER === 'openai' ? ['openai', 'gemini'] : process.env.AI_SCRIPT_PROVIDER === 'gemini' ? ['gemini', 'openai'] : value.script.providerOrder,
    },
    tts: { ...value.tts, openaiModel: process.env.OPENAI_TTS_MODEL || value.tts.openaiModel, deepgramModel: process.env.DEEPGRAM_TTS_MODEL || value.tts.deepgramModel },
  });
  cached = { value, expiresAt: Date.now() + CONFIG_TTL_MS };
  return value;
}
