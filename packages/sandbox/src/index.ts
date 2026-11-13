import {
  DEFAULT_SANDBOX_LIMITS,
  type SandboxLimits,
  validateLimits,
} from "./limits";

export type { SandboxLimits } from "./limits";
export { DEFAULT_SANDBOX_LIMITS } from "./limits";

export interface DockerRequestInit extends RequestInit {
  unix?: string;
}

export type DockerRequest = (
  input: string,
  init: DockerRequestInit,
) => Promise<Response>;

export interface DockerClientConfig {
  socketPath?: string;
  apiVersion?: string;
  request?: DockerRequest;
}

export interface SandboxSpec {
  image: string;
  name?: string;
  workspaceVolume?: string;
  command?: string[];
  runtime?: "runc" | "runsc";
  limits?: SandboxLimits;
}

export interface SandboxHandle {
  id: string;
  name?: string;
  deadlineAt: number;
}

interface CreateContainerResponse {
  Id: string;
  Warnings?: string[];
}

export class DockerApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DockerApiError";
    this.status = status;
  }
}

export class DockerClient {
  private readonly socketPath: string;
  private readonly apiPrefix: string;
  private readonly request: DockerRequest;

  constructor(config: DockerClientConfig = {}) {
    this.socketPath = config.socketPath ?? "/var/run/docker.sock";
    this.apiPrefix = `/v${config.apiVersion ?? "1.45"}`;
    this.request = config.request ?? ((input, init) => fetch(input, init));
  }

  async createContainer(spec: SandboxSpec): Promise<SandboxHandle> {
    const limits = spec.limits ?? DEFAULT_SANDBOX_LIMITS;
    validateLimits(limits);
    const response = await this.requestJson<CreateContainerResponse>(
      "POST",
      "/containers/create",
      {
        Image: spec.image,
        Cmd: spec.command ?? ["sleep", "infinity"],
        User: "1000:1000",
        WorkingDir: "/workspace",
        HostConfig: {
          Binds: spec.workspaceVolume
            ? [`${spec.workspaceVolume}:/workspace:rw`]
            : [],
          CapDrop: ["ALL"],
          NanoCpus: limits.nanoCpus,
          Memory: limits.memoryBytes,
          MemorySwap: limits.memorySwapBytes,
          PidsLimit: limits.pidsLimit,
          StorageOpt: { size: `${limits.diskQuotaBytes}b` },
          Runtime: spec.runtime ?? "runc",
          NetworkMode: "none",
          ReadonlyRootfs: true,
          SecurityOpt: ["no-new-privileges:true"],
        },
      },
      spec.name,
    );

    return {
      id: response.Id,
      name: spec.name,
      deadlineAt: Date.now() + limits.maxRuntimeMs,
    };
  }

  async startContainer(id: string): Promise<void> {
    await this.requestJson(
      "POST",
      `/containers/${encodeURIComponent(id)}/start`,
    );
  }

  async stopContainer(id: string, timeoutSeconds = 10): Promise<void> {
    await this.requestJson(
      "POST",
      `/containers/${encodeURIComponent(id)}/stop?t=${timeoutSeconds}`,
    );
  }

  async removeContainer(id: string, force = false): Promise<void> {
    await this.requestJson(
      "DELETE",
      `/containers/${encodeURIComponent(id)}?force=${force ? "1" : "0"}`,
    );
  }

  private async requestJson<T = undefined>(
    method: string,
    path: string,
    body?: unknown,
    name?: string,
  ): Promise<T> {
    const query = name ? `?name=${encodeURIComponent(name)}` : "";
    const response = await this.request(
      `http://localhost${this.apiPrefix}${path}${query}`,
      {
        method,
        unix: this.socketPath,
        headers:
          body === undefined
            ? undefined
            : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );

    if (!response.ok) {
      throw new DockerApiError(response.status, await response.text());
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}
