import { expect, test } from "bun:test";
import { DEFAULT_SANDBOX_LIMITS, DockerClient } from "./index";

test("supports explicit gVisor and resource limits", async () => {
  let body: Record<string, unknown> | undefined;
  const client = new DockerClient({
    request: async (_url, init) => {
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ Id: "runsc-container" }), {
        status: 201,
      });
    },
  });

  const handle = await client.createContainer({
    image: "wildfire-sandbox:test",
    runtime: "runsc",
    limits: {
      nanoCpus: 500_000_000,
      memoryBytes: 256 * 1024 * 1024,
      memorySwapBytes: 256 * 1024 * 1024,
      pidsLimit: 32,
      diskQuotaBytes: 512 * 1024 * 1024,
      maxRuntimeMs: 30_000,
    },
  });

  expect(handle.id).toBe("runsc-container");
  expect(body).toMatchObject({
    HostConfig: {
      NanoCpus: 500_000_000,
      Memory: 256 * 1024 * 1024,
      MemorySwap: 256 * 1024 * 1024,
      PidsLimit: 32,
      StorageOpt: { size: "536870912b" },
      Runtime: "runsc",
    },
  });
});

test("rejects unsafe resource policies", async () => {
  const client = new DockerClient({
    request: async () =>
      new Response(JSON.stringify({ Id: "unused" }), { status: 201 }),
  });

  await expect(
    client.createContainer({
      image: "wildfire-sandbox:test",
      limits: { ...DEFAULT_SANDBOX_LIMITS, pidsLimit: 0 },
    }),
  ).rejects.toThrow("Sandbox limit pidsLimit must be positive");
});
