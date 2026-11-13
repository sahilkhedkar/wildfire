import { expect, test } from "bun:test";
import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createWorkspaceMethods,
  SandboxdClient,
  SandboxdServer,
  waitForSandboxd,
} from "./index";

test("serves health and authenticated RPC requests", async () => {
  const server = new SandboxdServer({
    authToken: "test-token",
    methods: {
      echo: (params) => params,
    },
  });
  const url = server.start();

  try {
    await waitForSandboxd(url, { delayMs: 0 });
    await expect(fetch(`${url}/healthz`)).resolves.toMatchObject({
      status: 200,
    });

    const unauthorized = await fetch(`${url}/rpc`, {
      method: "POST",
      body: JSON.stringify({ method: "echo", params: { ok: true } }),
    });
    expect(unauthorized.status).toBe(401);

    const response = await fetch(`${url}/rpc`, {
      method: "POST",
      headers: {
        authorization: "Bearer test-token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ method: "echo", params: { ok: true } }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, result: { ok: true } });
  } finally {
    server.stop();
  }
});

test("runs guarded filesystem tools inside sandboxd", async () => {
  const workspace = await mkdtemp("/tmp/wildfire-sandboxd-workspace-");
  const server = new SandboxdServer({
    authToken: "filesystem-token",
    methods: await createWorkspaceMethods(workspace),
  });
  const url = server.start();

  try {
    const client = new SandboxdClient({
      url,
      authToken: "filesystem-token",
    });
    await client.call("write_file", {
      path: "remote.ts",
      content: "export const remote = true;\n",
    });
    await expect(client.call("read_file", { path: "remote.ts" })).resolves.toBe(
      "export const remote = true;\n",
    );
    await expect(client.call("list_dir", { path: "." })).resolves.toContain(
      "remote.ts",
    );
    expect(await readFile(join(workspace, "remote.ts"), "utf8")).toContain(
      "remote",
    );
    await expect(
      client.call("read_file", { path: "../outside.txt" }),
    ).rejects.toThrow("Path resolves outside the workspace");
  } finally {
    server.stop();
  }
});
