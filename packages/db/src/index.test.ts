import { expect, test } from "bun:test";
import { packageName } from "./index";

test("identifies the db package", () => {
  expect(packageName).toBe("db");
});
