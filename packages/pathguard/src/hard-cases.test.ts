import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { TypeScriptPathGuard } from "./index";

const root = resolve("/tmp/wildfire-pathguard-hard-cases");

test("denies single and double encoded traversal", () => {
  const guard = new TypeScriptPathGuard(root);

  expect(guard.check("%2e%2e/secrets.txt", "read")).toMatchObject({
    kind: "denied",
    reason: "Encoded path resolves outside the workspace",
  });
  expect(guard.check("%252e%252e/secrets.txt", "read")).toMatchObject({
    kind: "denied",
    reason: "Encoded path resolves outside the workspace",
  });
  expect(guard.check("bad%2", "read")).toMatchObject({
    kind: "denied",
    reason: "Path contains invalid percent encoding",
  });
});

test("keeps Unicode lookalikes and case variants inside the root", () => {
  const guard = new TypeScriptPathGuard(root);

  expect(guard.check("..．/file.ts", "read")).toMatchObject({
    kind: "allowed",
    resolvedPath: resolve(root, "..．/file.ts"),
  });
  expect(guard.check("CaseSensitive.ts", "read")).toMatchObject({
    kind: "allowed",
    resolvedPath: resolve(root, "CaseSensitive.ts"),
  });
  expect(guard.check("casesensitive.ts", "read")).toMatchObject({
    kind: "allowed",
    resolvedPath: resolve(root, "casesensitive.ts"),
  });
});

test("handles long normalized paths without escaping", () => {
  const guard = new TypeScriptPathGuard(root);
  const longName = `${"a".repeat(2048)}.txt`;

  expect(guard.check(longName, "write")).toMatchObject({
    kind: "allowed",
    resolvedPath: resolve(root, longName),
  });
});
