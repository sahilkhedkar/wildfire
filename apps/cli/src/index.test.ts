import { expect, test } from "bun:test";
import { appName } from "./index";

test("identifies the CLI app", () => {
  expect(appName).toBe("wildfire-cli");
});
