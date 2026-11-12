import { OpenAICompatibleProvider } from "./index";

const prompt = process.argv.slice(2).join(" ").trim();
const apiKey = Bun.env.OPENAI_API_KEY;

if (!prompt) {
  throw new Error("Usage: bun run prompt -- <prompt>");
}
if (!apiKey) {
  throw new Error("OPENAI_API_KEY is required");
}

const provider = new OpenAICompatibleProvider({
  apiKey,
  baseUrl: Bun.env.OPENAI_BASE_URL,
});
const response = await provider.complete({
  model: Bun.env.OPENAI_MODEL ?? "gpt-4o-mini",
  messages: [{ role: "user", content: prompt }],
});

console.log(response.content);
console.log(`tokens: ${response.usage.totalTokens}`);
