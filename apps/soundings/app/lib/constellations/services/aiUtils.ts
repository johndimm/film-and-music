/** Read a Vite-style env var from process (e.g. Next.js) or import.meta (Vite). */
export function readBundledEnv(key: string): string {
  const fromProcess = getEnvVar(key);
  if (fromProcess) return fromProcess;
  const nextKey = key.startsWith("VITE_")
    ? `NEXT_PUBLIC_${key.slice("VITE_".length)}`
    : key;
  const alt = getEnvVar(nextKey);
  if (alt) return alt;
  try {
    // @ts-ignore
    if (typeof import.meta !== "undefined" && import.meta.env) {
      // @ts-ignore
      const v = import.meta.env[key];
      if (v != null && String(v) !== "") return String(v);
    }
  } catch {
    /* ignore */
  }
  return "";
}

export const getEnvVar = (name: string): string => {
  // Try process.env first (Node.js / Server)
  try {
    if (typeof process !== 'undefined' && process.env) {
      const val = process.env[name];
      if (val) return val;
    }
  } catch (e) { }

  // Try import.meta.env (Vite / Browser)
  try {
    // @ts-ignore
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      // @ts-ignore
      const val = import.meta.env[name];
      if (val) return val;
    }
  } catch (e) { }

  return "";
};

export const getEnvCacheUrl = (): string => {
  return (
    readBundledEnv("VITE_CACHE_URL") ||
    readBundledEnv("VITE_CACHE_API_URL") ||
    getEnvVar("NEXT_PUBLIC_VITE_CACHE_URL") ||
    getEnvVar("NEXT_PUBLIC_VITE_CACHE_API_URL") ||
    ""
  ).trim();
};

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

export const CONSTELLATIONS_GEMINI_MODEL_KEY = "soundings-constellations-gemini-model";

export const GEMINI_MODEL_OPTIONS: { value: string; label: string; sub: string }[] = [
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", sub: "fast · default" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", sub: "smarter · slower" },
  { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash", sub: "older fast" },
];

export const getEnvGeminiModel = (): string => {
  if (typeof window !== "undefined") {
    try {
      const saved = localStorage.getItem(CONSTELLATIONS_GEMINI_MODEL_KEY);
      if (saved) return saved;
    } catch { /* empty */ }
  }
  const m = readBundledEnv("VITE_GEMINI_MODEL").trim();
  return m || DEFAULT_GEMINI_MODEL;
};

export const getEnvGeminiModelClassify = (): string => {
  const m = readBundledEnv("VITE_GEMINI_MODEL_CLASSIFY").trim();
  return m || getEnvGeminiModel();
};

// Robust text extraction from Gemini API response
export function getResponseText(response: any): string {
  if (!response) return "";

  // 1. Check if this is the GenerateContentResult wrapper
  const actualResponse = response.response || response;

  // 2. Check for .text() method (Standard SDK)
  if (typeof actualResponse.text === 'function') {
    try {
      const t = actualResponse.text();
      if (t) return t;
    } catch (e) { }
  }

  // 3. Check for .text property
  if (typeof actualResponse.text === 'string') return actualResponse.text;

  // 4. Deep dive into candidates
  try {
    const candidates = actualResponse.candidates || [];
    if (candidates.length > 0) {
      const parts = candidates[0].content?.parts || [];
      const textPart = parts.find((p: any) => p.text);
      if (textPart) return textPart.text;
    }
  } catch (e) { }

  return "";
}

// Clean JSON response from markdown wrappers
export function cleanJson(text: unknown): string {
  if (typeof text !== "string") return "";
  // Remove markdown code blocks if present (e.g. ```json ... ``` or ``` ...)
  return text.replace(/```(?:json)?\s*([\s\S]*?)\s*```/g, '$1').trim();
}

/** Extract first top-level `{...}` or `[...]` from a string (string-aware). */
function extractFirstJsonSlice(s: string): string | null {
  const trimmed = s.trim();
  const startObj = trimmed.indexOf("{");
  const startArr = trimmed.indexOf("[");
  let start = -1;
  if (startObj >= 0 && (startArr < 0 || startObj < startArr)) start = startObj;
  else if (startArr >= 0) start = startArr;
  else return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') {
      inString = true;
      continue;
    }
    if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return trimmed.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Parse JSON from Gemini / proxy output: handles markdown fences, then plain text that may
 * include a JSON object embedded in prose (or model noise like "You are a…" before the object).
 */
export function parseJsonFromModelText(text: unknown): unknown | null {
  if (typeof text !== "string" || !text.trim()) return null;
  const cleaned = cleanJson(text);
  if (!cleaned) return null;
  try {
    return JSON.parse(cleaned);
  } catch {
    const slice = extractFirstJsonSlice(cleaned);
    if (!slice) return null;
    try {
      return JSON.parse(slice);
    } catch {
      return null;
    }
  }
}

/**
 * Read a fetch Response and parse JSON without throwing. Non-OK responses and HTML or plain
 * error pages (e.g. Wikipedia rate limit text starting with "You are...") return null.
 */
export async function jsonFromResponse<T = unknown>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!res.ok) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

// Safely retrieve API key
export async function getApiKey() {
  let key = "";

  // Try process.env first (Node.js)
  try {
    if (typeof process !== 'undefined' && process.env) {
      const env = process.env;
      key = env.VITE_API_KEY ||
        env.NEXT_PUBLIC_API_KEY ||
        env.REACT_APP_API_KEY ||
        env.API_KEY ||
        env.VITE_GEMINI_API_KEY ||
        env.GEMINI_API_KEY ||
        "";
    }
  } catch (e) { }

  if (!key) {
    try {
      // @ts-ignore
      if (typeof import.meta !== 'undefined' && import.meta.env) {
        // Use literal access for Vite static replacement
        // @ts-ignore
        key = import.meta.env.VITE_API_KEY ||
          // @ts-ignore
          import.meta.env.VITE_GEMINI_API_KEY ||
          "";
      }
    } catch (e) { }
  }

  if (!key && typeof window !== 'undefined' && (window as any).aistudio) {
    try {
      key = await (window as any).aistudio.getSelectedApiKey();
    } catch (e) { }
  }

  // Log once whether a key was found (prefix only), to debug missing-key issues without leaking it.
  if (typeof window !== 'undefined') {
    (window as any).__codex_key_logged = (window as any).__codex_key_logged || false;
    if (!(window as any).__codex_key_logged) {
      console.log(`[Key] resolved ${key ? 'present' : 'missing'}${key ? ` (prefix: ${key.slice(0, 6)})` : ''}`);
      (window as any).__codex_key_logged = true;
    }
  }

  return key;
}

// Wrap promise with timeout
export function withTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMsg));
    }, ms);

    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(reason => {
        clearTimeout(timer);
        reject(reason);
      });
  });
}

/** True when Google returned quota / rate-limit (429, RESOURCE_EXHAUSTED, etc.). */
export function isGeminiRateOrQuotaError(error: unknown): boolean {
  const s = String((error as { message?: string })?.message ?? error ?? "").toLowerCase();
  return (
    s.includes("429") ||
    s.includes("resource_exhausted") ||
    s.includes("resource exhausted") ||
    s.includes("rate limit") ||
    s.includes("too many requests")
  );
}

/** Short message for ControlPanel / notifications when a search call fails. */
export function userMessageForGeminiFailure(error: unknown): string {
  if (isGeminiRateOrQuotaError(error)) {
    return "Gemini rate limit (429). Wait a few minutes, or use a paid API key / higher quota. You can set VITE_GEMINI_MODEL to another model in env.";
  }
  return "Search failed.";
}

// Improved retry logic with exponential backoff and jitter
export async function withRetry<T>(fn: () => Promise<T>, attempts = 4, backoffMs = 1000): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (error: unknown) {
      lastError = error;
      const errorStr = String((error as { message?: string })?.message ?? error ?? "").toLowerCase();
      // Only retry if it looks like a transient error (rate limit, timeout, or network)
      const isRateLimit =
        errorStr.includes("429") ||
        errorStr.includes("resource_exhausted") ||
        errorStr.includes("resource exhausted") ||
        errorStr.includes("rate limit") ||
        errorStr.includes("too many requests");
      const isRetryable =
        isRateLimit ||
        errorStr.includes("timeout") ||
        errorStr.includes("fetch") ||
        errorStr.includes("network");

      if (i < attempts - 1 && isRetryable) {
        // 429 / quota: wait longer so we do not hammer the API (free tier exhausts quickly).
        const baseDelay = isRateLimit
          ? Math.min(60_000, 4000 * Math.pow(2, i))
          : backoffMs * Math.pow(2, i);
        const jitter = baseDelay * 0.2 * (Math.random() * 2 - 1);
        const delay = Math.max(200, baseDelay + jitter);

        console.warn(`[Retry] Attempt ${i + 1} failed. Retrying in ${Math.round(delay)}ms...`, errorStr);
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw error;
      }
    }
  }
  throw lastError;
}
