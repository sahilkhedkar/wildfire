import { expect, test } from "bun:test";
import { appName } from "./index";

test("identifies the web app", () => {
  expect(appName).toBe("wildfire-web");
});
