import { expect, test } from "bun:test";
import { SandboxdServer, waitForSandboxd } from "./index";

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
