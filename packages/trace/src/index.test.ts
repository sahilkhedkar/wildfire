import { expect, test } from "bun:test";
import { packageName } from "./index";

test("identifies the trace package", () => {
  expect(packageName).toBe("trace");
});
