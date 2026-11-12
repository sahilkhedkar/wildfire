import { expect, test } from "bun:test";
import { appName } from "./index";

test("identifies the API app", () => {
  expect(appName).toBe("wildfire-api");
});
