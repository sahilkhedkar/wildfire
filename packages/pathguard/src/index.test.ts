import { expect, test } from "bun:test";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { TypeScriptPathGuard } from "./index";

const root = resolve("/tmp/wildfire-pathguard-workspace");

test("allows normalized paths inside the workspace", () => {
  const guard = new TypeScriptPathGuard(root);

  expect(guard.check("src//./main.ts", "read")).toEqual({
    kind: "allowed",
    operation: "read",
    resolvedPath: resolve(root, "src/main.ts"),
  });
  expect(
    guard.check("/tmp/wildfire-pathguard-workspace/src/main.ts", "write"),
  ).toEqual({
    kind: "allowed",
    operation: "write",
    resolvedPath: resolve(root, "src/main.ts"),
  });
  expect(guard.check(".", "list")).toEqual({
    kind: "allowed",
    operation: "list",
    resolvedPath: root,
  });
});

test("denies traversal outside the workspace", () => {
  const guard = new TypeScriptPathGuard(root);

  expect(guard.check("../secrets.txt", "read")).toMatchObject({
    kind: "denied",
    operation: "read",
  });
  expect(guard.check("/tmp/other-workspace/file.ts", "write")).toMatchObject({
    kind: "denied",
    operation: "write",
  });
});

test("denies null bytes and invalid operations", () => {
  const guard = new TypeScriptPathGuard(root);

  expect(guard.check("safe\0file.ts", "read")).toEqual({
    kind: "denied",
    operation: "read",
    reason: "Path contains a null byte",
  });
  expect(guard.check("file.ts", "unknown" as never)).toEqual({
    kind: "denied",
    operation: "invalid",
    reason: "Unknown path operation",
  });
});

test("resolves symlinks before deciding containment", async () => {
  const workspace = await mkdtemp("/tmp/wildfire-pathguard-root-");
  const outside = await mkdtemp("/tmp/wildfire-pathguard-outside-");
  await mkdir(resolve(workspace, "inside"));
  await writeFile(resolve(workspace, "inside", "safe.txt"), "safe", "utf8");
  await writeFile(resolve(outside, "secret.txt"), "secret", "utf8");
  await symlink(resolve(workspace, "inside"), resolve(workspace, "alias"));
  await symlink(outside, resolve(workspace, "escape"));
  const guard = new TypeScriptPathGuard(workspace);

  expect(guard.check("alias/safe.txt", "read")).toMatchObject({
    kind: "allowed",
    resolvedPath: resolve(workspace, "inside", "safe.txt"),
  });
  expect(guard.check("alias/new.txt", "write")).toMatchObject({
    kind: "allowed",
    resolvedPath: resolve(workspace, "inside", "new.txt"),
  });
  expect(guard.check("escape/secret.txt", "read")).toMatchObject({
    kind: "denied",
    reason: "Path resolves through a symlink outside the workspace",
  });
});
