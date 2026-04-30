import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";

type LlmLogLevel = 0 | 1 | 2;

type LlmLogEvent = {
  ts: string;
  app: string;
  type: string;
  userKey: string;
  requestId: string;
  provider?: string;
  modelId?: string;
  systemPrompt?: string;
  userMessage?: string;
  responseText?: string;
  error?: { message: string; stack?: string };
  meta?: Record<string, unknown>;
};

const MONTH_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_FILES_BEFORE_COMPRESS = 1000;

function getLlmLogLevel(): LlmLogLevel {
  const raw = (process.env.LLM_LOG_LEVEL ?? "").trim();
  if (raw === "1") return 1;
  if (raw === "2") return 2;
  return 0;
}

function defaultLogRoot(): string {
  if (process.env.VERCEL) return "/tmp/llm-logs";
  /** Relative — resolved at runtime; avoids Turbopack tracing `join(process.cwd(), …)` → whole repo NFT. */
  return ".llm-logs";
}

function safeSegment(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "unknown"
  );
}

function makeRequestId(): string {
  return crypto.randomBytes(8).toString("hex");
}

async function gzipFile(src: string, dest: string): Promise<void> {
  const buf = await fs.readFile(src);
  const gz = await new Promise<Buffer>((resolve, reject) => {
    zlib.gzip(buf, { level: 9 }, (err, out) => (err ? reject(err) : resolve(out)));
  });
  await fs.writeFile(dest, gz);
}

async function maybeCompressAndPrune(dir: string): Promise<void> {
  let entries: { name: string; full: string; mtimeMs: number; isGz: boolean }[] = [];
  try {
    const names = await fs.readdir(dir);
    const stats = await Promise.all(
      names.map(async (name) => {
        const full = path.join(dir, name);
        const st = await fs.stat(full).catch(() => null);
        if (!st?.isFile()) return null;
        return { name, full, mtimeMs: st.mtimeMs, isGz: name.endsWith(".gz") };
      })
    );
    entries = stats.filter(Boolean) as typeof entries;
  } catch {
    return;
  }

  const now = Date.now();
  await Promise.all(
    entries
      .filter((e) => e.isGz && now - e.mtimeMs > MONTH_MS)
      .map((e) => fs.unlink(e.full).catch(() => undefined))
  );

  const raw = entries.filter((e) => !e.isGz);
  if (raw.length <= MAX_FILES_BEFORE_COMPRESS) return;

  const sortedOldestFirst = raw.sort((a, b) => a.mtimeMs - b.mtimeMs);
  const toCompress = sortedOldestFirst.slice(0, raw.length - MAX_FILES_BEFORE_COMPRESS);
  await Promise.all(
    toCompress.map(async (e) => {
      const gzPath = `${e.full}.gz`;
      try {
        await gzipFile(e.full, gzPath);
        await fs.unlink(e.full);
      } catch {
        // best-effort
      }
    })
  );
}

type CallLlmLogContext = {
  app: string;
  type: string;
  userKey: string;
  requestId: string;
  meta?: Record<string, unknown>;
};

async function writeLlmLog(
  eventInput: Omit<LlmLogEvent, "ts" | "requestId"> & { ts?: string; requestId?: string }
): Promise<void> {
  const level = getLlmLogLevel();
  if (level === 0) return;

  const event: LlmLogEvent = {
    ...eventInput,
    ts: eventInput.ts ?? new Date().toISOString(),
    requestId: eventInput.requestId ?? makeRequestId(),
  };
  const root = (process.env.LLM_LOG_DIR ?? "").trim() || defaultLogRoot();
  const dir = path.join(root, safeSegment(event.app), safeSegment(event.userKey), safeSegment(event.type));
  const filename =
    level === 1 ? "latest.json" : `${event.ts.replace(/[:.]/g, "-")}-${event.requestId}.json`;

  try {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, filename), JSON.stringify(event, null, 2), "utf8");
  } catch {
    return;
  }

  if (level === 2) void maybeCompressAndPrune(dir);
}

export async function callLLM(
  llm: string,
  systemPrompt: string,
  userMessage: string,
  opts?: { maxTokens?: number },
  log?: CallLlmLogContext
): Promise<string> {
  const maxTokens = opts?.maxTokens ?? 1024;
  let lastErr: unknown = null;
  if (llm === "deepseek") {
    // API cap: "valid range of max_tokens is [1, 8192]"
    const deepseekMax = Math.min(maxTokens, 8192);
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        max_tokens: deepseekMax,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userMessage },
        ],
      }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`DeepSeek ${res.status}: ${JSON.stringify(e)}`); }
    const d = await res.json() as { choices: { message: { content: string } }[] };
    const text = d.choices?.[0]?.message?.content?.trim() ?? "";
    if (log) {
      await writeLlmLog({
        app: log.app,
        type: log.type,
        userKey: log.userKey,
        requestId: log.requestId,
        provider: llm,
        modelId: "deepseek-chat",
        systemPrompt,
        userMessage,
        responseText: text,
        meta: { maxTokens, ...log.meta },
      });
    }
    return text;
  }

  if (llm === "claude") {
    // Use Anthropic's prompt caching on the system prompt — the instructions are
    // stable across requests; only the user message (history + excluded list) changes.
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
      body: JSON.stringify({
        model: "claude-opus-4-6",
        max_tokens: maxTokens,
        system: [
          {
            type: "text",
            text: systemPrompt,
            cache_control: { type: "ephemeral" },
          },
        ],
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`Claude ${res.status}: ${JSON.stringify(e)}`); }
    const d = await res.json() as { content: { type: string; text: string }[] };
    const text = d.content?.[0]?.text?.trim() ?? "";
    if (log) {
      await writeLlmLog({
        app: log.app,
        type: log.type,
        userKey: log.userKey,
        requestId: log.requestId,
        provider: llm,
        modelId: "claude-opus-4-6",
        systemPrompt,
        userMessage,
        responseText: text,
        meta: { maxTokens, ...log.meta },
      });
    }
    return text;
  }

  if (llm === "gpt-4o") {
    // OpenAI automatically caches prompt prefixes ≥1024 tokens; no explicit opt-in needed.
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o",
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user",   content: userMessage },
        ],
      }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`OpenAI ${res.status}: ${JSON.stringify(e)}`); }
    const d = await res.json() as { choices: { message: { content: string } }[] };
    const text = d.choices?.[0]?.message?.content?.trim() ?? "";
    if (log) {
      await writeLlmLog({
        app: log.app,
        type: log.type,
        userKey: log.userKey,
        requestId: log.requestId,
        provider: llm,
        modelId: "gpt-4o",
        systemPrompt,
        userMessage,
        responseText: text,
        meta: { maxTokens, ...log.meta },
      });
    }
    return text;
  }

  if (llm === "gemini") {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: "user", parts: [{ text: userMessage }] }],
        generationConfig: { maxOutputTokens: maxTokens },
      }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(`Gemini ${res.status}: ${JSON.stringify(e)}`); }
    const d = await res.json() as { candidates: { content: { parts: { text: string }[] } }[] };
    const text = d.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? "";
    if (log) {
      await writeLlmLog({
        app: log.app,
        type: log.type,
        userKey: log.userKey,
        requestId: log.requestId,
        provider: llm,
        modelId: "gemini-2.0-flash",
        systemPrompt,
        userMessage,
        responseText: text,
        meta: { maxTokens, ...log.meta },
      });
    }
    return text;
  }

  lastErr = new Error(`Unknown LLM: ${llm}`);
  if (log) {
    const message = lastErr instanceof Error ? lastErr.message : "Unknown LLM";
    const stack = lastErr instanceof Error ? lastErr.stack : undefined;
    await writeLlmLog({
      app: log.app,
      type: log.type,
      userKey: log.userKey,
      requestId: log.requestId,
      provider: llm,
      systemPrompt,
      userMessage,
      error: { message, stack },
      meta: { maxTokens, ...log.meta },
    });
  }
  throw new Error(`Unknown LLM: ${llm}`);
}
