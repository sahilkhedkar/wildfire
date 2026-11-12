import { expect, test } from "bun:test";
import { isAbsolute, relative, resolve, sep } from "node:path";
import fc from "fast-check";
import { TypeScriptPathGuard } from "./index";

test("never allows a generated path outside the root", () => {
  const root = resolve("/tmp/wildfire-property-root");
  const guard = new TypeScriptPathGuard(root);

  fc.assert(
    fc.property(fc.string({ maxLength: 200 }), (requestedPath) => {
      const decision = guard.check(requestedPath, "read");
      if (decision.kind === "allowed") {
        const relativePath = relative(root, decision.resolvedPath);
        expect(
          relativePath === "" ||
            (!relativePath.startsWith(`..${sep}`) &&
              relativePath !== ".." &&
              !isAbsolute(relativePath)),
        ).toBe(true);
      }
    }),
    { numRuns: 500 },
  );
});
