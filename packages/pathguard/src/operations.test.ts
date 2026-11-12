import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { TypeScriptPathGuard } from "./index";

test("supports every initial path operation", () => {
  const root = resolve("/tmp/wildfire-pathguard-operations");
  const guard = new TypeScriptPathGuard(root);

  for (const operation of [
    "read",
    "write",
    "list",
    "delete",
    "execute",
  ] as const) {
    expect(guard.check("file.ts", operation)).toEqual({
      kind: "allowed",
      operation,
      resolvedPath: resolve(root, "file.ts"),
    });
  }
});
