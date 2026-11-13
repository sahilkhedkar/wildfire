import { expect, test } from "bun:test";
import { DockerApiError, DockerClient } from "./index";

test("creates, starts, stops, and removes a container over the Docker API", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = new DockerClient({
    socketPath: "/tmp/test-docker.sock",
    request: async (url, init) => {
      calls.push({ url, init });
      if (
        init.method === "POST" &&
        url.endsWith("/containers/create?name=wildfire-test")
      ) {
        return new Response(JSON.stringify({ Id: "container-1" }), {
          status: 201,
        });
      }
      return new Response(null, { status: 204 });
    },
  });

  const handle = await client.createContainer({
    image: "wildfire-sandbox:test",
    name: "wildfire-test",
    workspaceVolume: "workspace-volume",
  });
  await client.startContainer(handle.id);
  await client.stopContainer(handle.id, 3);
  await client.removeContainer(handle.id, true);

  expect(handle.id).toBe("container-1");
  expect(handle.name).toBe("wildfire-test");
  expect(handle.deadlineAt).toBeGreaterThan(Date.now());
  expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
    "POST http://localhost/v1.45/containers/create?name=wildfire-test",
    "POST http://localhost/v1.45/containers/container-1/start",
    "POST http://localhost/v1.45/containers/container-1/stop?t=3",
    "DELETE http://localhost/v1.45/containers/container-1?force=1",
  ]);
  expect(calls[0].init).toMatchObject({ unix: "/tmp/test-docker.sock" });
  expect(JSON.parse(String(calls[0].init.body))).toMatchObject({
    Image: "wildfire-sandbox:test",
    User: "1000:1000",
    WorkingDir: "/workspace",
    HostConfig: {
      Binds: ["workspace-volume:/workspace:rw"],
      CapDrop: ["ALL"],
      NetworkMode: "none",
      ReadonlyRootfs: true,
      SecurityOpt: ["no-new-privileges:true"],
    },
  });
});

test("surfaces Docker API failures", async () => {
  const client = new DockerClient({
    request: async () => new Response("daemon unavailable", { status: 503 }),
  });

  await expect(client.startContainer("container-1")).rejects.toEqual(
    new DockerApiError(503, "daemon unavailable"),
  );
});
