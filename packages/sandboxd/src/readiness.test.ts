import { expect, test } from "bun:test";
import { waitForSandboxd } from "./index";

test("times out when sandboxd is unavailable", async () => {
  await expect(
    waitForSandboxd("http://127.0.0.1:1", { attempts: 2, delayMs: 0 }),
  ).rejects.toThrow("sandboxd readiness timed out");
});
