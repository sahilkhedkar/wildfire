import { expect, test } from "bun:test";
import { packageName } from "./index";

test("identifies the agent package", () => {
  expect(packageName).toBe("agent");
});
