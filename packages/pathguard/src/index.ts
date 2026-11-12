import { isAbsolute, relative, resolve, sep } from "node:path";

export const pathOperationSchema = [
  "read",
  "write",
  "list",
  "delete",
  "execute",
] as const;

export type PathOperation = (typeof pathOperationSchema)[number];

export type PathGuardDecision =
  | {
      kind: "allowed";
      operation: PathOperation;
      resolvedPath: string;
    }
  | {
      kind: "denied";
      operation: PathOperation | "invalid";
      reason: string;
    };

export interface PathGuard {
  check(requestedPath: string, operation: PathOperation): PathGuardDecision;
}

export class TypeScriptPathGuard implements PathGuard {
  readonly root: string;

  constructor(workspaceRoot: string) {
    this.root = resolve(workspaceRoot);
  }

  check(requestedPath: string, operation: PathOperation): PathGuardDecision {
    if (!isPathOperation(operation)) {
      return {
        kind: "denied",
        operation: "invalid",
        reason: "Unknown path operation",
      };
    }

    if (requestedPath.includes("\0")) {
      return {
        kind: "denied",
        operation,
        reason: "Path contains a null byte",
      };
    }

    const resolvedPath = resolve(this.root, requestedPath);
    if (!isWithinRoot(this.root, resolvedPath)) {
      return {
        kind: "denied",
        operation,
        reason: "Path resolves outside the workspace",
      };
    }

    return { kind: "allowed", operation, resolvedPath };
  }
}

function isPathOperation(value: string): value is PathOperation {
  return (pathOperationSchema as readonly string[]).includes(value);
}

function isWithinRoot(root: string, candidate: string): boolean {
  const relativePath = relative(root, candidate);
  return (
    relativePath === "" ||
    (!relativePath.startsWith(`..${sep}`) &&
      relativePath !== ".." &&
      !isAbsolute(relativePath))
  );
}
