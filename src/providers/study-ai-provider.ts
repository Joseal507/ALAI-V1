import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config({ path: ".env.local" });

const GROQ_KEYS = [
  process.env.GROQ_API_KEY,
  process.env.GROQ_API_KEY_2,
  process.env.GROQ_API_KEY_3,
  process.env.GROQ_API_KEY_4,
  process.env.GROQ_API_KEY_5,
  process.env.GROQ_API_KEY_6,
  process.env.GROQ_API_KEY_7,
].filter(Boolean) as string[];

const CEREBRAS_KEYS = [
  process.env.CEREBRAS_API_KEY,
  process.env.CEREBRAS_API_KEY_2,
  process.env.CEREBRAS_API_KEY_3,
  process.env.CEREBRAS_API_KEY_4,
  process.env.CEREBRAS_API_KEY_5,
].filter(Boolean) as string[];

const SAMBANOVA_KEYS = [
  process.env.SAMBANOVA_API_KEY,
  process.env.SAMBANOVA_API_KEY_2,
  process.env.SAMBANOVA_API_KEY_3,
  process.env.SAMBANOVA_API_KEY_4,
  process.env.SAMBANOVA_API_KEY_5,
].filter(Boolean) as string[];

const HF_KEYS = [
  process.env.HF_API_KEY,
  process.env.HF_API_KEY_2,
  process.env.HF_API_KEY_3,
  process.env.HF_API_KEY_4,
  process.env.HF_API_KEY_5,
].filter(Boolean) as string[];

const GEMINI_KEYS = [
  process.env.GEMINI_API_KEY,
  process.env.GEMINI_API_KEY_2,
  process.env.GEMINI_API_KEY_3,
  process.env.GEMINI_API_KEY_4,
  process.env.GEMINI_API_KEY_5,
].filter(Boolean) as string[];

const MISTRAL_KEY = process.env.MISTRAL_API_KEY || "";
const OPENROUTER_KEY = process.env.OPENROUTER_API_KEY || "";
const CF_ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID || "";
const CF_TOKEN = process.env.CLOUDFLARE_API_TOKEN || "";

const blocked = new Map<string, number>();

export interface StudyAIMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StudyAIParams {
  messages: StudyAIMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

export interface StudyAIResult {
  text: string;
  provider: string;
}

type QueueEntry = {
  client: any;
  provider: string;
  key: string;
};

export function blockKey(key: string, seconds = 60): void {
  blocked.set(key, Date.now() + seconds * 1000);
  console.warn(`StudyAI: key blocked ${seconds}s`);
}

function isBlocked(key: string): boolean {
  const unblockAt = blocked.get(key);

  if (!unblockAt) return false;

  if (Date.now() >= unblockAt) {
    blocked.delete(key);
    return false;
  }

  return true;
}

function modelFor(provider: string): string {
  switch (provider) {
    case "groq":
      return "llama-3.3-70b-versatile";
    case "cerebras":
      return "qwen-3-235b-a22b-instruct-2507";
    case "sambanova":
      return "Meta-Llama-3.3-70B-Instruct";
    case "hf":
      return "meta-llama/Llama-3.3-70B-Instruct";
    case "mistral":
      return "mistral-small-latest";
    case "openrouter":
      return "google/gemini-2.0-flash-001";
    default:
      return "llama-3.3-70b-versatile";
  }
}

function geminiClient(key: string) {
  return {
    chat: {
      completions: {
        create: async (params: any) => {
          const text = params.messages
            .map((message: any) => {
              const content =
                typeof message.content === "string"
                  ? message.content
                  : JSON.stringify(message.content);

              return `${message.role}: ${content}`;
            })
            .join("\n");

          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ parts: [{ text }] }],
                generationConfig: {
                  maxOutputTokens: params.max_tokens || 4096,
                  temperature: params.temperature ?? 0.7,
                },
              }),
            }
          );

          if (!response.ok) {
            const errorText = await response.text();
            const error: any = new Error(`Gemini ${response.status}: ${errorText}`);
            error.status = response.status;
            throw error;
          }

          const data: any = await response.json();
          const output = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";

          return {
            choices: [{ message: { content: output } }],
          };
        },
      },
    },
  };
}

function cloudflareClient() {
  return {
    chat: {
      completions: {
        create: async (params: any) => {
          const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${CF_TOKEN}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messages: params.messages.map((message: any) => ({
                  role: message.role,
                  content:
                    typeof message.content === "string"
                      ? message.content
                      : JSON.stringify(message.content),
                })),
              }),
            }
          );

          const data: any = await response.json();

          if (!data.result?.response) {
            throw new Error("Cloudflare returned no response");
          }

          return {
            choices: [{ message: { content: data.result.response } }],
          };
        },
      },
    },
  };
}

function buildQueue(): QueueEntry[] {
  const queue: QueueEntry[] = [];

  for (const key of GROQ_KEYS) {
    queue.push({
      client: new OpenAI({
        apiKey: key,
        baseURL: "https://api.groq.com/openai/v1",
      }),
      provider: "groq",
      key,
    });
  }

  for (const key of CEREBRAS_KEYS) {
    queue.push({
      client: new OpenAI({
        apiKey: key,
        baseURL: "https://api.cerebras.ai/v1",
      }),
      provider: "cerebras",
      key,
    });
  }

  for (const key of HF_KEYS) {
    queue.push({
      client: new OpenAI({
        apiKey: key,
        baseURL: "https://router.huggingface.co/v1",
      }),
      provider: "hf",
      key,
    });
  }

  for (const key of SAMBANOVA_KEYS) {
    queue.push({
      client: new OpenAI({
        apiKey: key,
        baseURL: "https://api.sambanova.ai/v1",
      }),
      provider: "sambanova",
      key,
    });
  }

  for (const key of GEMINI_KEYS) {
    queue.push({
      client: geminiClient(key),
      provider: "gemini",
      key,
    });
  }

  if (MISTRAL_KEY) {
    queue.push({
      client: new OpenAI({
        apiKey: MISTRAL_KEY,
        baseURL: "https://api.mistral.ai/v1",
      }),
      provider: "mistral",
      key: MISTRAL_KEY,
    });
  }

  if (OPENROUTER_KEY) {
    queue.push({
      client: new OpenAI({
        apiKey: OPENROUTER_KEY,
        baseURL: "https://openrouter.ai/api/v1",
        defaultHeaders: {
          "HTTP-Referer": "https://alai.local",
          "X-Title": "ALAI",
        },
      }),
      provider: "openrouter",
      key: OPENROUTER_KEY,
    });
  }

  if (CF_ACCOUNT && CF_TOKEN) {
    queue.push({
      client: cloudflareClient(),
      provider: "cloudflare",
      key: "",
    });
  }

  return queue;
}

export async function studyAI(params: StudyAIParams): Promise<StudyAIResult> {
  const queue = buildQueue();

  if (queue.length === 0) {
    throw new Error("No AI provider keys configured.");
  }

  let lastError: unknown;

  for (const { client, provider, key } of queue) {
    if (key && isBlocked(key)) continue;

    try {
      const response = await client.chat.completions.create({
        model: modelFor(provider),
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 4096,
        ...(params.json && provider !== "gemini" && provider !== "cloudflare"
          ? { response_format: { type: "json_object" } }
          : {}),
      });

      const text = response.choices[0]?.message?.content || "";

      if (!text.trim()) {
        throw new Error("Empty AI response");
      }

      console.log(`StudyAI: ${provider} OK`);

      return {
        text,
        provider,
      };
    } catch (error: any) {
      lastError = error;

      const status = error?.status || error?.statusCode;
      const message = String(error?.message || "");

      if (
        status === 429 ||
        message.includes("rate") ||
        message.includes("429") ||
        message.includes("quota")
      ) {
        if (key) blockKey(key, 60);
        console.warn(`StudyAI: rate limit on ${provider}`);
        continue;
      }

      if (status === 401 || status === 403) {
        if (key) blockKey(key, 3600);
        console.warn(`StudyAI: auth error on ${provider}`);
        continue;
      }

      console.warn(`StudyAI: error on ${provider}: ${message.slice(0, 120)}`);
      continue;
    }
  }

  throw lastError || new Error("All AI providers failed.");
}

export async function studyAIJson<T>(params: StudyAIParams): Promise<T> {
  const result = await studyAI({ ...params, json: true });
  const parsed = safeParseJson(result.text);

  if (parsed === null) {
    throw new Error(`Invalid JSON from ${result.provider}`);
  }

  return parsed as T;
}

export function safeParseJson(raw: string): unknown | null {
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {}

  const match =
    raw.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    raw.match(/(\{[\s\S]*\})/);

  if (!match?.[1]) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}
