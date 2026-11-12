import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import type { ChatMessage, LLMProvider, TokenUsage } from "@wildfire/llm";
import type { TraceEventType } from "@wildfire/trace";
import { z } from "zod";

const toolCallSchema = z.object({
  tool: z.enum(["read_file", "write_file", "list_dir"]),
  arguments: z.record(z.string(), z.unknown()),
});

const readFileArgumentsSchema = z.object({
  path: z.string().min(1),
});

const writeFileArgumentsSchema = z.object({
  path: z.string().min(1),
  content: z.string(),
});

const listDirArgumentsSchema = z.object({
  path: z.string().optional(),
});

export interface AgentConfig {
  provider: LLMProvider;
  model: string;
  task: string;
  workspaceRoot: string;
  maxSteps?: number;
  tokenBudget?: number;
  onEvent?: AgentEventHandler;
}

export interface AgentEvent {
  type: TraceEventType;
  payload: Record<string, unknown>;
}

export type AgentEventHandler = (event: AgentEvent) => void | Promise<void>;

export interface AgentResult {
  status: "completed" | "step_limit" | "token_budget_exceeded";
  finalResponse?: string;
  steps: number;
  usage: TokenUsage;
}

interface AgentTool {
  execute(argumentsValue: unknown): Promise<string>;
}

const systemPrompt = [
  "You are a coding agent working inside a local workspace.",
  "Use exactly one JSON tool call when you need to inspect or change files:",
  '{"tool":"read_file|write_file|list_dir","arguments":{...}}',
  "After receiving a tool result, continue the task. When finished, reply with plain text.",
].join(" ");

export async function runAgent(config: AgentConfig): Promise<AgentResult> {
  const maxSteps = config.maxSteps ?? 8;
  const tokenBudget = config.tokenBudget ?? 8_000;
  const tools = await createWorkspaceTools(config.workspaceRoot);
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: config.task },
  ];
  let steps = 0;
  let usage = emptyUsage();

  while (steps < maxSteps) {
    await emitEvent(config.onEvent, "llm.request", {
      step: steps + 1,
      model: config.model,
      messageCount: messages.length,
    });
    const response = await config.provider.complete({
      model: config.model,
      messages,
    });
    steps += 1;
    usage = addUsage(usage, response.usage);
    messages.push({ role: "assistant", content: response.content });
    await emitEvent(config.onEvent, "llm.response", {
      step: steps,
      content: response.content,
      usage: response.usage,
    });

    if (usage.totalTokens > tokenBudget) {
      const result = { status: "token_budget_exceeded" as const, steps, usage };
      await emitEvent(config.onEvent, "run.finished", result);
      return result;
    }

    const toolCall = parseToolCall(response.content);
    if (!toolCall) {
      const result = {
        status: "completed",
        finalResponse: response.content,
        steps,
        usage,
      } as const;
      await emitEvent(config.onEvent, "run.finished", result);
      return result;
    }

    const tool = tools[toolCall.tool];
    await emitEvent(config.onEvent, "tool.call", {
      step: steps,
      tool: toolCall.tool,
      arguments: toolCall.arguments,
    });
    const result = tool
      ? await executeTool(tool, toolCall.arguments)
      : JSON.stringify({ error: `Unknown tool: ${toolCall.tool}` });
    await emitEvent(config.onEvent, "tool.result", {
      step: steps,
      tool: toolCall.tool,
      result,
    });
    messages.push({
      role: "user",
      content: `Tool result (${toolCall.tool}): ${result}`,
    });
  }

  const result = { status: "step_limit" as const, steps, usage };
  await emitEvent(config.onEvent, "run.finished", result);
  return result;
}

export function parseToolCall(
  content: string,
): z.infer<typeof toolCallSchema> | null {
  const normalized = content
    .trim()
    .replace(/^```(?:json)?\s*/, "")
    .replace(/\s*```$/, "");
  const parsed = safeJsonParse(normalized);
  const result = toolCallSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

export async function createWorkspaceTools(
  workspaceRoot: string,
): Promise<Record<string, AgentTool>> {
  const root = resolve(workspaceRoot);
  await mkdir(root, { recursive: true });

  return {
    read_file: {
      execute: async (argumentsValue) => {
        const { path } = readFileArgumentsSchema.parse(argumentsValue);
        return readFile(await resolveWorkspacePath(root, path), "utf8");
      },
    },
    write_file: {
      execute: async (argumentsValue) => {
        const { path, content } =
          writeFileArgumentsSchema.parse(argumentsValue);
        const resolvedPath = await resolveWorkspacePath(root, path);
        await mkdir(dirname(resolvedPath), { recursive: true });
        await writeFile(resolvedPath, content, "utf8");
        return JSON.stringify({
          written: path,
          bytes: Buffer.byteLength(content),
        });
      },
    },
    list_dir: {
      execute: async (argumentsValue) => {
        const { path } = listDirArgumentsSchema.parse(argumentsValue);
        const resolvedPath = await resolveWorkspacePath(root, path ?? ".");
        const entries = await readdir(resolvedPath, { withFileTypes: true });
        return JSON.stringify(
          entries
            .map((entry) => `${entry.name}${entry.isDirectory() ? sep : ""}`)
            .sort(),
        );
      },
    },
  };
}

async function executeTool(
  tool: AgentTool,
  argumentsValue: unknown,
): Promise<string> {
  try {
    return await tool.execute(argumentsValue);
  } catch (error) {
    return JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function resolveWorkspacePath(
  root: string,
  requestedPath: string,
): Promise<string> {
  const resolvedPath = resolve(root, requestedPath);
  const relativePath = relative(root, resolvedPath);
  if (
    relativePath === ".." ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath.includes(`${sep}..${sep}`)
  ) {
    throw new Error("Path is outside the workspace");
  }
  return resolvedPath;
}

function safeJsonParse(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function emptyUsage(): TokenUsage {
  return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function addUsage(left: TokenUsage, right: TokenUsage): TokenUsage {
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

async function emitEvent(
  handler: AgentEventHandler | undefined,
  type: TraceEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  await handler?.({ type, payload });
}
