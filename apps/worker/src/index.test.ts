import { expect, test } from "bun:test";
import { appName } from "./index";

test("identifies the worker app", () => {
  expect(appName).toBe("wildfire-worker");
});
