// Minimal OpenAI client (fetch only) for Convex actions.
// Env: OPENAI_API_KEY (required), OPENAI_MODEL (optional).

// gpt-5.4-mini with no reasoning writes the roadmap in ~3s (gpt-5-mini: ~6s).
const MODEL = () => process.env.OPENAI_MODEL || "gpt-5.4-mini";

function key(): string {
  const k = process.env.OPENAI_API_KEY;
  if (!k) throw new Error("OPENAI_API_KEY is not set in the Convex environment");
  return k;
}

/** Lowest reasoning effort each family accepts: gpt-5/5-mini/5-nano take "minimal", gpt-5.1+ take "none". */
export function reasoningEffort(model: string): string | null {
  if (/^gpt-5\.\d/.test(model)) return "none";
  if (/^gpt-5/.test(model)) return "minimal";
  if (/^o\d/.test(model)) return "low";
  return null;
}

function reasoningParams(model: string) {
  const effort = reasoningEffort(model);
  return effort ? { reasoning_effort: effort } : { temperature: 0.4 };
}

/** Structured JSON output that matches `schema` (OpenAI strict JSON schema). */
export async function json<T>(opts: {
  name: string;
  system: string;
  user: string;
  schema: Record<string, unknown>;
  model?: string;
}): Promise<T> {
  const model = opts.model ?? MODEL();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      ...reasoningParams(model),
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.name, strict: true, schema: opts.schema },
      },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no content");
  return JSON.parse(content) as T;
}

/** Free-text answer grounded with OpenAI's web search tool (Responses API). */
export async function webSearchJson<T>(opts: {
  name: string;
  instructions: string;
  input: string;
  schema: Record<string, unknown>;
}): Promise<T> {
  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${key()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL(),
      ...(reasoningEffort(MODEL()) ? { reasoning: { effort: reasoningEffort(MODEL()) } } : {}),
      tools: [{ type: "web_search" }],
      instructions: opts.instructions,
      input: opts.input,
      text: {
        format: { type: "json_schema", name: opts.name, strict: true, schema: opts.schema },
      },
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const text =
    data.output_text ??
    data.output
      ?.flatMap((o: any) => o.content ?? [])
      .find((c: any) => c.type === "output_text")?.text;
  if (!text) throw new Error("OpenAI web search returned no text");
  return JSON.parse(text) as T;
}

// Helpers for strict schemas: every property required, no extras.
export const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
export const arr = (items: unknown) => ({ type: "array", items });
export const str = { type: "string" };
export const num = { type: "number" };
export const int = { type: "integer" };
