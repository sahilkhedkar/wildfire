import { resolve } from "node:path";
import type { AgentResult } from "@wildfire/agent";
import { runAgent } from "@wildfire/agent";
import type { LLMProvider } from "@wildfire/llm";
import { OpenAICompatibleProvider } from "@wildfire/llm";
import { TraceRecorder } from "@wildfire/trace";

export interface RunOptions {
  task: string;
  directory: string;
}

export interface CliDependencies {
  provider?: LLMProvider;
  output?: (line: string) => void;
  currentDirectory?: string;
}

export function parseArgs(args: string[]): RunOptions {
  if (args[0] !== "run") {
    throw new Error('Usage: wildfire run "task" --dir ./folder');
  }

  const task = args[1]?.trim();
  const directoryFlagIndex = args.indexOf("--dir");
  const directory =
    directoryFlagIndex >= 0 ? args[directoryFlagIndex + 1] : undefined;
  if (!task || !directory) {
    throw new Error('Usage: wildfire run "task" --dir ./folder');
  }

  return { task, directory };
}

export async function runCli(
  args: string[],
  dependencies: CliDependencies = {},
): Promise<AgentResult> {
  const options = parseArgs(args);
  const output = dependencies.output ?? console.log;
  const directory = resolve(
    dependencies.currentDirectory ?? process.cwd(),
    options.directory,
  );
  const recorder = new TraceRecorder((event) => {
    output(JSON.stringify(event));
  });

  await recorder.record("run.started", {
    task: options.task,
    directory,
  });

  try {
    const result = await runAgent({
      provider: dependencies.provider ?? createProvider(),
      model: Bun.env.OPENAI_MODEL ?? "gpt-4o-mini",
      task: options.task,
      workspaceRoot: directory,
      onEvent: async (event) => {
        await recorder.record(event.type, event.payload);
      },
    });
    return result;
  } catch (error) {
    await recorder.record("error", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

function createProvider(): LLMProvider {
  const apiKey = Bun.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required");
  }

  return new OpenAICompatibleProvider({
    apiKey,
    baseUrl: Bun.env.OPENAI_BASE_URL,
  });
}

if (import.meta.main) {
  runCli(process.argv.slice(2)).catch(() => {
    process.exitCode = 1;
  });
}
