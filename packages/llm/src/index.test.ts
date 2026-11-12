import { expect, test } from "bun:test";
import { packageName } from "./index";

test("identifies the llm package", () => {
  expect(packageName).toBe("llm");
});
