import { expect, test } from "bun:test";
import { packageName } from "./index";

test("identifies the pathguard package", () => {
  expect(packageName).toBe("pathguard");
});
