import { existsSync, lstatSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

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
    this.root =
      resolveFilesystemPath(resolve(workspaceRoot)) ?? resolve(workspaceRoot);
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

    const encodedPathResult = checkEncodedPath(this.root, requestedPath);
    if (encodedPathResult !== null) {
      return { kind: "denied", operation, reason: encodedPathResult };
    }

    const resolvedPath = resolve(this.root, requestedPath);
    if (!isWithinRoot(this.root, resolvedPath)) {
      return {
        kind: "denied",
        operation,
        reason: "Path resolves outside the workspace",
      };
    }

    const filesystemPath = resolveFilesystemPath(resolvedPath);
    if (filesystemPath === null || !isWithinRoot(this.root, filesystemPath)) {
      return {
        kind: "denied",
        operation,
        reason: "Path resolves through a symlink outside the workspace",
      };
    }

    return { kind: "allowed", operation, resolvedPath: filesystemPath };
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

function checkEncodedPath(root: string, requestedPath: string): string | null {
  let decodedPath = requestedPath;

  try {
    for (let pass = 0; pass < 3; pass += 1) {
      const nextPath = decodeURIComponent(decodedPath);
      if (nextPath === decodedPath) {
        break;
      }
      decodedPath = nextPath;
    }
  } catch {
    return "Path contains invalid percent encoding";
  }

  if (
    decodedPath !== requestedPath &&
    !isWithinRoot(root, resolve(root, decodedPath))
  ) {
    return "Encoded path resolves outside the workspace";
  }

  return null;
}

function resolveFilesystemPath(candidate: string): string | null {
  let current = candidate;
  const suffix: string[] = [];

  while (!existsSync(current)) {
    try {
      lstatSync(current);
      return null;
    } catch {
      const parent = dirname(current);
      if (parent === current) {
        return candidate;
      }
      suffix.unshift(current.slice(parent.length + 1));
      current = parent;
    }
  }

  try {
    return resolve(realpathSync(current), ...suffix);
  } catch {
    return null;
  }
}
