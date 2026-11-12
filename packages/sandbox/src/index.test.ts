import { expect, test } from "bun:test";
import { packageName } from "./index";

test("identifies the sandbox package", () => {
  expect(packageName).toBe("sandbox");
});
