import { expect, test } from "bun:test";
import { OpenAICompatibleProvider, ProviderRequestError } from "./index";

test("validates a provider response and maps token usage", async () => {
  const provider = new OpenAICompatibleProvider({
    apiKey: "test-key",
    fetchImpl: async () =>
      new Response(
        JSON.stringify({
          id: "chat-1",
          model: "test-model",
          choices: [{ message: { content: "Hello from the model" } }],
          usage: { prompt_tokens: 4, completion_tokens: 5, total_tokens: 9 },
        }),
        { status: 200 },
      ),
  });

  await expect(
    provider.complete({
      model: "test-model",
      messages: [{ role: "user", content: "Hello" }],
    }),
  ).resolves.toEqual({
    id: "chat-1",
    model: "test-model",
    content: "Hello from the model",
    usage: { promptTokens: 4, completionTokens: 5, totalTokens: 9 },
  });
});

test("retries transient provider failures", async () => {
  let attempts = 0;
  const provider = new OpenAICompatibleProvider({
    apiKey: "test-key",
    maxRetries: 1,
    retryDelayMs: 0,
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) {
        return new Response("busy", { status: 503 });
      }
      return new Response(
        JSON.stringify({
          id: "chat-2",
          model: "test-model",
          choices: [{ message: { content: "Recovered" } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { status: 200 },
      );
    },
  });

  await expect(
    provider.complete({
      model: "test-model",
      messages: [{ role: "user", content: "Retry this" }],
    }),
  ).resolves.toMatchObject({ content: "Recovered" });
  expect(attempts).toBe(2);
});

test("does not retry non-transient failures", async () => {
  let attempts = 0;
  const provider = new OpenAICompatibleProvider({
    apiKey: "test-key",
    maxRetries: 2,
    retryDelayMs: 0,
    fetchImpl: async () => {
      attempts += 1;
      return new Response("unauthorized", { status: 401 });
    },
  });

  await expect(
    provider.complete({
      model: "test-model",
      messages: [{ role: "user", content: "Do not retry" }],
    }),
  ).rejects.toBeInstanceOf(ProviderRequestError);
  expect(attempts).toBe(1);
});
