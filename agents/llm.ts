/**
 * LLM calls via OpenRouter's OpenAI-compatible chat API (plain fetch, no SDK).
 * Default model is a cheap, fast one; override with OPENROUTER_MODEL.
 */
import type { Task } from "../lib/types";
import type { Persona } from "./personas";

const URL = "https://openrouter.ai/api/v1/chat/completions";
const model = () => process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash-lite";

interface Message {
  role: "system" | "user";
  content: string;
}

async function chat(messages: Message[], opts: { maxTokens: number; json?: boolean }): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set (see .env.agents)");
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "x-title": "Arkiv Agent Job Board",
    },
    body: JSON.stringify({
      model: model(),
      messages,
      max_tokens: opts.maxTokens,
      ...(opts.json && { response_format: { type: "json_object" } }),
    }),
  });
  const body: any = await res.json().catch(() => ({}));
  if (!res.ok || body.error) {
    throw new Error(`OpenRouter ${res.status}: ${body.error?.message ?? res.statusText}`);
  }
  return String(body.choices?.[0]?.message?.content ?? "").trim();
}

/** Pull the first {...} block out of a reply, for models that wrap JSON in prose or fences. */
function parseJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return {};
    try {
      return JSON.parse(m[0]);
    } catch {
      return {};
    }
  }
}

function describe(task: Task) {
  return `Title: ${task.title}\nCategory: ${task.category}\nReward: ${task.reward} points\n\n${task.description}`;
}

export interface Assessment {
  canDo: boolean;
  price: number;
  pitch: string;
}

/** Decide whether to bid and at what price. */
export async function assess(persona: Persona, task: Task): Promise<Assessment> {
  const text = await chat(
    [
      {
        role: "system",
        content:
          `${persona.style}\n\nYou are an independent agent on a public job board, competing with other agents. ` +
          `Lowest price wins. Decide whether this task fits your skills (${persona.categories.join(", ")}) and can be ` +
          `done in a single text response. If so, pick a whole-number price between 1 and the reward; your usual rate ` +
          `is about ${Math.round(persona.priceBias * 100)}% of the reward, lower for easy tasks.\n\n` +
          `Reply with only a JSON object: {"canDo": boolean, "price": integer, "pitch": "one sentence under 140 characters"}`,
      },
      { role: "user", content: describe(task) },
    ],
    { maxTokens: 200, json: true },
  );
  const input = parseJson(text);
  const reward = Math.max(1, task.reward);
  return {
    canDo: input.canDo === true || input.canDo === "true",
    price: Math.min(reward, Math.max(1, Math.round(Number(input.price) || reward))),
    pitch: String(input.pitch ?? "").slice(0, 200),
  };
}

export const WORK_MAX_TOKENS = 2000;

/**
 * Do the work, streaming. `onText` gets the full text so far after every chunk.
 * Uses OpenRouter's server-sent events (`stream: true`).
 */
export async function work(persona: Persona, task: Task, onText?: (text: string) => void): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set (see .env.agents)");
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      "x-title": "Arkiv Agent Job Board",
    },
    body: JSON.stringify({
      model: model(),
      stream: true,
      max_tokens: WORK_MAX_TOKENS,
      messages: [
        {
          role: "system",
          content:
            `${persona.style}\n\nYou won this job on a public board. Deliver the finished work directly, ` +
            `with no preamble and no questions back to the poster.\n\n` +
            `Format the answer in GitHub-flavoured Markdown so it renders cleanly: short paragraphs, ` +
            `"##" headings for sections when the answer is long, numbered or bulleted lists for steps, ` +
            `**bold** for key results, and fenced code blocks with a language tag for code. ` +
            `Write math in LaTeX with $...$ inline and $$...$$ on its own lines for displayed equations. ` +
            `End with a clearly marked final answer or summary when there is one.`,
        },
        { role: "user", content: describe(task) },
      ],
    }),
  });
  if (!res.ok || !res.body) {
    const body: any = await res.json().catch(() => ({}));
    throw new Error(`OpenRouter ${res.status}: ${body.error?.message ?? res.statusText}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue; // comments like ": OPENROUTER PROCESSING"
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const evt = JSON.parse(data);
        if (evt.error) throw new Error(`OpenRouter: ${evt.error.message ?? "stream error"}`);
        const delta = evt.choices?.[0]?.delta?.content;
        if (delta) {
          text += delta;
          onText?.(text);
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("OpenRouter")) throw e;
      }
    }
  }
  return text.trim();
}
