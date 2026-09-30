/**
 * Minimal LLM client for the coach engine — plain `fetch`, zero dependencies.
 *
 * Deliberately dumb and defensive:
 * - one POST to `${OPENAI_BASE_URL ?? "https://api.openai.com/v1"}/chat/completions`
 * - `response_format: { type: "json_object" }` so the model answers in JSON
 * - a hard 25s AbortController timeout (a slow model must never hang a page)
 * - markdown fences stripped and `JSON.parse` attempted; every failure throws,
 *   and the engine turns that throw into a deterministic fallback.
 *
 * Server-only by use (reads process.env); it uses nothing but global `fetch`,
 * so it is harmless if the module is ever bundled for the client.
 */

const DEFAULT_BASE_URL = "https://api.openai.com/v1";
const DEFAULT_MODEL = "gpt-4o-mini";
const TIMEOUT_MS = 25_000;

export interface LlmPrompt {
  system: string;
  user: string;
}

export interface LlmCallOptions extends LlmPrompt {
  temperature?: number;
  maxTokens?: number;
}

/** True when an API key is configured — the only gate for trying the LLM. */
export function llmAvailable(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}

/** Model id for coach calls (COACH_MODEL, default gpt-4o-mini). */
export function coachModel(): string {
  return process.env.COACH_MODEL?.trim() || DEFAULT_MODEL;
}

function endpoint(): string {
  const base = process.env.OPENAI_BASE_URL?.trim() || DEFAULT_BASE_URL;
  return `${base.replace(/\/+$/, "")}/chat/completions`;
}

/** Strip ```json fences and any prose the model wrapped the object in. */
export function stripJsonFences(text: string): string {
  let out = text.trim();
  const fence = out.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) out = fence[1].trim();
  if (out.startsWith("{") || out.startsWith("[")) return out;
  // Last resort: slice from the first brace to the last one.
  const first = out.indexOf("{");
  const last = out.lastIndexOf("}");
  if (first >= 0 && last > first) return out.slice(first, last + 1);
  return out;
}

/**
 * One JSON-mode completion. Throws on any failure (network, timeout, HTTP
 * error, unparseable content) — callers decide the fallback.
 */
export async function llmJSON<T = unknown>(options: LlmCallOptions): Promise<T> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("llm_no_api_key");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(endpoint(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: coachModel(),
        temperature: options.temperature ?? 0.4,
        max_tokens: options.maxTokens ?? 1400,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`llm_http_${response.status}${detail ? `: ${detail.slice(0, 180)}` : ""}`);
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error("llm_empty_content");

    try {
      return JSON.parse(stripJsonFences(content)) as T;
    } catch {
      throw new Error("llm_unparseable_json");
    }
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("llm_timeout");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
