import { z } from "zod";

const messageRoleSchema = z.enum(["system", "user", "assistant"]);

export const chatMessageSchema = z.object({
  role: messageRoleSchema,
  content: z.string().min(1),
});

export const chatRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(chatMessageSchema).min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
});

export const tokenUsageSchema = z.object({
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
});

export const chatResponseSchema = z.object({
  id: z.string().min(1),
  model: z.string().min(1),
  content: z.string(),
  usage: tokenUsageSchema,
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;
export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatResponse = z.infer<typeof chatResponseSchema>;
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

export interface LLMProvider {
  complete(request: ChatRequest): Promise<ChatResponse>;
}

export interface OpenAICompatibleConfig {
  apiKey: string;
  baseUrl?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  fetchImpl?: FetchImplementation;
}

type FetchImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const openAIResponseSchema = z.object({
  id: z.string(),
  model: z.string(),
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
      }),
    )
    .min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }),
});

export class ProviderRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ProviderRequestError";
    this.status = status;
  }
}

export class OpenAICompatibleProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly fetchImpl: FetchImplementation;

  constructor(config: OpenAICompatibleConfig) {
    if (config.apiKey.length === 0) {
      throw new Error("An API key is required");
    }

    this.apiKey = config.apiKey;
    this.baseUrl = (config.baseUrl ?? "https://api.openai.com/v1").replace(
      /\/$/,
      "",
    );
    this.maxRetries = config.maxRetries ?? 2;
    this.retryDelayMs = config.retryDelayMs ?? 250;
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  async complete(request: ChatRequest): Promise<ChatResponse> {
    const validatedRequest = chatRequestSchema.parse(request);
    const body = {
      model: validatedRequest.model,
      messages: validatedRequest.messages,
      ...(validatedRequest.temperature === undefined
        ? {}
        : { temperature: validatedRequest.temperature }),
      ...(validatedRequest.maxTokens === undefined
        ? {}
        : { max_tokens: validatedRequest.maxTokens }),
    };

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      try {
        const response = await this.fetchImpl(
          `${this.baseUrl}/chat/completions`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${this.apiKey}`,
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          },
        );

        if (!response.ok) {
          const error = new ProviderRequestError(
            response.status,
            await response.text(),
          );
          if (isRetryableStatus(response.status) && attempt < this.maxRetries) {
            await wait(this.retryDelayMs);
            continue;
          }
          throw error;
        }

        const payload: unknown = await response.json();
        const parsed = openAIResponseSchema.parse(payload);
        return chatResponseSchema.parse({
          id: parsed.id,
          model: parsed.model,
          content: parsed.choices[0].message.content,
          usage: {
            promptTokens: parsed.usage.prompt_tokens,
            completionTokens: parsed.usage.completion_tokens,
            totalTokens: parsed.usage.total_tokens,
          },
        });
      } catch (error) {
        if (error instanceof ProviderRequestError) {
          throw error;
        }
        if (attempt >= this.maxRetries) {
          throw error;
        }
        await wait(this.retryDelayMs);
      }
    }

    throw new Error("Provider request failed");
  }
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

async function wait(delayMs: number): Promise<void> {
  if (delayMs > 0) {
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
  }
}
