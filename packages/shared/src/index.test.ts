import { expect, test } from "bun:test";
import { packageName } from "./index";

test("identifies the shared package", () => {
  expect(packageName).toBe("shared");
});
