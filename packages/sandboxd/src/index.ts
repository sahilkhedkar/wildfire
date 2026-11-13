import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const rpcRequestSchema = z.object({
  method: z.string().min(1),
  params: z.unknown().optional(),
});

export type SandboxdMethod = (params: unknown) => unknown | Promise<unknown>;

export interface SandboxdConfig {
  authToken: string;
  hostname?: string;
  port?: number;
  methods?: Record<string, SandboxdMethod>;
}

export interface WaitForSandboxdOptions {
  attempts?: number;
  delayMs?: number;
  fetchImpl?: typeof fetch;
}

export class SandboxdServer {
  private readonly authToken: string;
  private readonly hostname: string;
  private readonly port: number;
  private readonly methods: Record<string, SandboxdMethod>;
  private server: ReturnType<typeof Bun.serve> | undefined;

  constructor(config: SandboxdConfig) {
    if (config.authToken.length === 0) {
      throw new Error("sandboxd auth token is required");
    }
    this.authToken = config.authToken;
    this.hostname = config.hostname ?? "127.0.0.1";
    this.port = config.port ?? 0;
    this.methods = config.methods ?? {};
  }

  start(): string {
    if (this.server) {
      return this.url;
    }
    this.server = Bun.serve({
      hostname: this.hostname,
      port: this.port,
      fetch: (request) => this.handle(request),
    });
    return this.url;
  }

  stop(): void {
    this.server?.stop(true);
    this.server = undefined;
  }

  get url(): string {
    if (!this.server) {
      throw new Error("sandboxd is not running");
    }
    return `http://${this.hostname}:${this.server.port}`;
  }

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/healthz" && request.method === "GET") {
      return jsonResponse({ status: "ok", ready: true });
    }

    if (url.pathname !== "/rpc" || request.method !== "POST") {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (!hasValidToken(request.headers.get("authorization"), this.authToken)) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const parsedBody = rpcRequestSchema.safeParse(await request.json());
    if (!parsedBody.success) {
      return jsonResponse({ error: "Invalid RPC request" }, 400);
    }

    const handler = this.methods[parsedBody.data.method];
    if (!handler) {
      return jsonResponse({ error: "Method not found" }, 404);
    }

    try {
      const result = await handler(parsedBody.data.params);
      return jsonResponse({ ok: true, result });
    } catch (error) {
      return jsonResponse(
        { error: error instanceof Error ? error.message : "RPC method failed" },
        500,
      );
    }
  }
}

export async function waitForSandboxd(
  url: string,
  options: WaitForSandboxdOptions = {},
): Promise<void> {
  const attempts = options.attempts ?? 20;
  const delayMs = options.delayMs ?? 100;
  const fetchImpl = options.fetchImpl ?? fetch;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(`${url}/healthz`);
      if (response.ok) {
        const body: unknown = await response.json();
        if (
          typeof body === "object" &&
          body !== null &&
          "ready" in body &&
          body.ready === true
        ) {
          return;
        }
      }
      lastError = new Error("sandboxd is not ready");
    } catch (error) {
      lastError = error;
    }
    if (attempt < attempts - 1 && delayMs > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(
    `sandboxd readiness timed out: ${lastError instanceof Error ? lastError.message : "unknown error"}`,
  );
}

function hasValidToken(
  authorization: string | null,
  expected: string,
): boolean {
  if (!authorization?.startsWith("Bearer ")) {
    return false;
  }
  const providedHash = createHash("sha256")
    .update(authorization.slice("Bearer ".length))
    .digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(providedHash, expectedHash);
}

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "content-type": "application/json" },
  });
}
