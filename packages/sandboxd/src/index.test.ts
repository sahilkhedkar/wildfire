import { expect, test } from "bun:test";
import { packageName } from "./index";

test("identifies the sandboxd package", () => {
  expect(packageName).toBe("sandboxd");
});
