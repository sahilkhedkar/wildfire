import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { TypeScriptPathGuard } from "./index";

const root = resolve("/tmp/wildfire-adversarial-root");

const escapeCases = [
  "../secret",
  "../../secret",
  "../../../secret",
  "../../../../etc/passwd",
  "../../../../../tmp/host-file",
  "../workspace-other/file.ts",
  "./../../secret",
  "foo/../../secret",
  "foo/bar/../../../secret",
  "foo/../../../../secret",
  "/etc/passwd",
  "/tmp/host-file",
  "/var/log/system.log",
  "/home/user/.ssh/config",
  "/root/.profile",
  "/workspace-other/file.ts",
  "/tmp/wildfire-adversarial-root-other/file.ts",
  "%2e%2e/secret",
  "%2E%2E/secret",
  "%2e%2e%2fsecret",
  "%2E%2E%2Fsecret",
  "%2e%2e/%2e%2e/secret",
  "%2e%2e%2f%2e%2e%2fsecret",
  "%252e%252e/secret",
  "%252E%252E/secret",
  "%252e%252e%252fsecret",
  "%252e%252e/%252e%252e/secret",
  "safe/%2e%2e/%2e%2e/secret",
  "safe/%252e%252e/%252e%252e/secret",
  "bad%2",
  "%",
  "%GG",
  "%E0%A4%A",
  "safe\0file",
  "../safe\0file",
  "\0",
  "a\0/../secret",
  "./safe/../../../secret",
  "safe/../../../../secret",
  "a/b/c/../../../../secret",
  ".././../secret",
  "..//..//secret",
  ".../../../secret",
  "....//../../secret",
  "foo/..//..//secret",
  "foo/bar/..//..//../secret",
  "/tmp/../etc/passwd",
  "/tmp/../../etc/passwd",
  "/workspace/../workspace-other/file",
  "/workspace/../../secret",
  "//etc/passwd",
] as const;

test("denies the handwritten escape corpus", () => {
  const guard = new TypeScriptPathGuard(root);

  for (const requestedPath of escapeCases) {
    expect(guard.check(requestedPath, "read"), requestedPath).toMatchObject({
      kind: "denied",
    });
  }
});
