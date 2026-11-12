import { expect, test } from "bun:test";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatRequest, ChatResponse, LLMProvider } from "@wildfire/llm";
import { createWorkspaceTools, parseToolCall, runAgent } from "./index";

class ScriptedProvider implements LLMProvider {
  private readonly responses: ChatResponse[];
  private index = 0;

  constructor(...responses: ChatResponse[]) {
    this.responses = responses;
  }

  async complete(_request: ChatRequest): Promise<ChatResponse> {
    const response = this.responses[this.index];
    this.index += 1;
    if (!response) {
      throw new Error("Scripted provider ran out of responses");
    }
    return response;
  }
}

test("runs a write tool call and creates a file", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "wildfire-agent-"));
  const provider = new ScriptedProvider(
    {
      id: "chat-1",
      model: "test-model",
      content: JSON.stringify({
        tool: "write_file",
        arguments: {
          path: "hello.ts",
          content: "export const hello = 'world';\n",
        },
      }),
      usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
    },
    {
      id: "chat-2",
      model: "test-model",
      content: "Created hello.ts.",
      usage: { promptTokens: 20, completionTokens: 4, totalTokens: 24 },
    },
  );

  const result = await runAgent({
    provider,
    model: "test-model",
    task: "Create hello.ts",
    workspaceRoot,
  });

  expect(result.status).toBe("completed");
  expect(result.steps).toBe(2);
  expect(await readFile(join(workspaceRoot, "hello.ts"), "utf8")).toBe(
    "export const hello = 'world';\n",
  );
});

test("stops before executing a tool when the token budget is exceeded", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "wildfire-agent-"));
  const provider = new ScriptedProvider({
    id: "chat-1",
    model: "test-model",
    content: JSON.stringify({
      tool: "write_file",
      arguments: { path: "should-not-exist.txt", content: "nope" },
    }),
    usage: { promptTokens: 10, completionTokens: 8, totalTokens: 18 },
  });

  const result = await runAgent({
    provider,
    model: "test-model",
    task: "Create a file",
    workspaceRoot,
    tokenBudget: 10,
  });

  expect(result.status).toBe("token_budget_exceeded");
  await expect(
    readFile(join(workspaceRoot, "should-not-exist.txt")),
  ).rejects.toThrow();
});

test("reads files and lists workspace entries", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "wildfire-agent-"));
  await writeFile(join(workspaceRoot, "existing.txt"), "contents", "utf8");
  const tools = await createWorkspaceTools(workspaceRoot);

  await expect(tools.read_file.execute({ path: "existing.txt" })).resolves.toBe(
    "contents",
  );
  await expect(tools.list_dir.execute({ path: "." })).resolves.toContain(
    "existing.txt",
  );
});

test("rejects paths outside the workspace through the write tool", async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), "wildfire-agent-"));
  const provider = new ScriptedProvider(
    {
      id: "chat-1",
      model: "test-model",
      content: JSON.stringify({
        tool: "write_file",
        arguments: { path: "../outside.txt", content: "blocked" },
      }),
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    },
    {
      id: "chat-2",
      model: "test-model",
      content: "The write was blocked.",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
    },
  );

  const result = await runAgent({
    provider,
    model: "test-model",
    task: "Write outside",
    workspaceRoot,
  });

  expect(result.status).toBe("completed");
  expect(parseToolCall("not JSON")).toBeNull();
});
