import "../lib/env.js";
import Anthropic from "@anthropic-ai/sdk";

export type ProviderFailure = "not_configured" | "disabled" | "timeout" | "rate_limited" | "provider_error" | "invalid_output" | "requested_deterministic" | "input_limit";
export class BoundedProviderError extends Error {
  constructor(readonly reason: ProviderFailure) { super(reason); }
}
const boundedInteger = (value: string | undefined, fallback: number, min: number, max: number) => {
  const n = Number(value); return value && Number.isInteger(n) ? Math.max(min, Math.min(max, n)) : fallback;
};

export type ProviderName = "anthropic" | "openai" | "none";
/**
 * Provider selection strategy:
 * 1. If explicit LLM_PROVIDER is configured ("openai" | "anthropic" | "none"), honor it.
 * 2. Otherwise automatic:
 *    - OPENAI_API_KEY present -> "openai"
 *    - otherwise ANTHROPIC_API_KEY present -> "anthropic"
 *    - otherwise "none" (deterministic fallback)
 */
export function activeProvider(): ProviderName {
  const explicit = (process.env.LLM_PROVIDER ?? "").trim().toLowerCase();
  if (explicit === "openai") {
    return process.env.OPENAI_API_KEY ? "openai" : "none";
  }
  if (explicit === "anthropic") {
    return process.env.ANTHROPIC_API_KEY ? "anthropic" : "none";
  }
  if (explicit === "none") {
    return "none";
  }
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "none";
}
export function providerConfig() {
  const provider = activeProvider();
  return {
    provider,
    model: provider === "openai"
      ? process.env.OPENAI_MODEL || "gpt-4o-mini"
      : process.env.ANTHROPIC_MODEL || "claude-opus-5",
    timeoutMs: boundedInteger(process.env.LLM_TIMEOUT_MS, 8000, 50, 20000),
    maxOutputTokens: boundedInteger(process.env.LLM_MAX_OUTPUT_TOKENS, 900, 128, 1500),
  };
}
export function createAnthropicClient() {
  return new Anthropic({ timeout: providerConfig().timeoutMs, maxRetries: 0 });
}

export interface ProviderRequest { system: string; input: string; schema: Record<string, unknown> }
export interface ProviderResult { text: string; usage: { inputTokens: number; outputTokens: number } }
export type BriefingProvider = (request: ProviderRequest, signal: AbortSignal) => Promise<ProviderResult>;

export const anthropicProvider: BriefingProvider = async (request, signal) => {
  const config = providerConfig();
  const response = await createAnthropicClient().messages.create({
    model: config.model, max_tokens: config.maxOutputTokens,
    system: request.system,
    messages: [{ role: "user", content: request.input }],
    output_config: { format: { type: "json_schema", schema: request.schema } },
    // No tools, history, or operational callbacks are available to this request.
  }, { signal });
  if (response.stop_reason !== "end_turn") throw new BoundedProviderError("invalid_output");
  return { text: response.content.filter(b => b.type === "text").map(b => b.text).join(""), usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens } };
};

/**
 * OpenAI's strict structured-output mode accepts only a subset of JSON Schema: it rejects
 * length and range keywords, and requires every declared property to be required. Dropping
 * those hints costs nothing here, because `validateBriefing` re-checks all of them in Zod
 * before a single word reaches the reader.
 */
export function strictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  const unsupported = new Set(["maxLength", "minLength", "minItems", "maxItems", "minimum", "maximum", "pattern", "format", "default"]);
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (!node || typeof node !== "object") return node;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (unsupported.has(key)) continue;
      out[key] = walk(value);
    }
    if (out.type === "object" && out.properties && typeof out.properties === "object") {
      out.required = Object.keys(out.properties as Record<string, unknown>);
      out.additionalProperties = false;
    }
    return out;
  };
  return walk(schema) as Record<string, unknown>;
}

const OPENAI_BASE = () => process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";

export class OpenAiHttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/** One bounded POST to chat completions, shared by the explainers and the assistant loop. */
export async function openAiChat(body: Record<string, unknown>, signal: AbortSignal): Promise<Record<string, any>> {
  const response = await fetch(`${OPENAI_BASE()}/chat/completions`, {
    method: "POST",
    signal,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    // The provider's own error text can quote the prompt back, so it is never propagated.
    await response.body?.cancel();
    throw new OpenAiHttpError(response.status, `OpenAI request failed with ${response.status}`);
  }
  return await response.json();
}

export const openaiProvider: BriefingProvider = async (request, signal) => {
  const config = providerConfig();
  const body = await openAiChat({
    model: config.model,
    max_completion_tokens: config.maxOutputTokens,
    messages: [
      { role: "system", content: request.system },
      { role: "user", content: request.input },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "safaitrack_briefing", strict: true, schema: strictJsonSchema(request.schema) },
    },
    // No tools are offered on this request, so the model has no way to reach the database.
  }, signal);
  const choice = body.choices?.[0];
  if (!choice || choice.finish_reason !== "stop" || choice.message?.refusal) throw new BoundedProviderError("invalid_output");
  return {
    text: choice.message?.content ?? "",
    usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 },
  };
};

/** The provider a request uses when the caller does not inject one (tests do). */
export function defaultProvider(): BriefingProvider {
  return activeProvider() === "openai" ? openaiProvider : anthropicProvider;
}

export async function boundedGenerate(request: ProviderRequest, provider: BriefingProvider = defaultProvider()): Promise<ProviderResult> {
  if (activeProvider() === "none") throw new BoundedProviderError("not_configured");
  if (request.input.length > 48_000) throw new BoundedProviderError("input_limit");
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      provider(request, controller.signal),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new BoundedProviderError("timeout")); }, providerConfig().timeoutMs); }),
    ]);
  } catch (error) {
    if (error instanceof BoundedProviderError) throw error;
    if (controller.signal.aborted) throw new BoundedProviderError("timeout");
    const rateLimited = (error instanceof Anthropic.APIError && error.status === 429) || (error instanceof OpenAiHttpError && error.status === 429);
    throw new BoundedProviderError(rateLimited ? "rate_limited" : "provider_error");
  } finally { clearTimeout(timer); }
}
