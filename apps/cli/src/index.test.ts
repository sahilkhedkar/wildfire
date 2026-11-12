import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ChatRequest, ChatResponse, LLMProvider } from "@wildfire/llm";
import { parseArgs, runCli } from "./index";

class ScriptedProvider implements LLMProvider {
  private index = 0;

  async complete(_request: ChatRequest): Promise<ChatResponse> {
    this.index += 1;
    if (this.index === 1) {
      return {
        id: "chat-1",
        model: "test-model",
        content: JSON.stringify({
          tool: "write_file",
          arguments: {
            path: "created.ts",
            content: "export const value = 1;\n",
          },
        }),
        usage: { promptTokens: 4, completionTokens: 4, totalTokens: 8 },
      };
    }
    return {
      id: "chat-2",
      model: "test-model",
      content: "Done.",
      usage: { promptTokens: 4, completionTokens: 1, totalTokens: 5 },
    };
  }
}

test("parses the run command", () => {
  expect(parseArgs(["run", "add a file", "--dir", "./workspace"])).toEqual({
    task: "add a file",
    directory: "./workspace",
  });
});

test("runs a task and emits JSONL trace events", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "wildfire-cli-"));
  const lines: string[] = [];

  const result = await runCli(["run", "create created.ts", "--dir", "."], {
    provider: new ScriptedProvider(),
    currentDirectory: workspace,
    output: (line) => lines.push(line),
  });

  expect(result.status).toBe("completed");
  expect(await readFile(join(workspace, "created.ts"), "utf8")).toBe(
    "export const value = 1;\n",
  );
  const events = lines.map(
    (line) => JSON.parse(line) as { type: string; seq: number },
  );
  expect(events.map((event) => event.type)).toEqual([
    "run.started",
    "llm.request",
    "llm.response",
    "tool.call",
    "tool.result",
    "llm.request",
    "llm.response",
    "run.finished",
  ]);
  expect(events.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
});
