import { expect, test } from "bun:test";
import { packageName } from "./index";

test("identifies the escape suite", () => {
  expect(packageName).toBe("escape-suite");
});
