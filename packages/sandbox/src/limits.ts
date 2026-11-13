export interface SandboxLimits {
  nanoCpus: number;
  memoryBytes: number;
  memorySwapBytes: number;
  pidsLimit: number;
  diskQuotaBytes: number;
  maxRuntimeMs: number;
}

export const DEFAULT_SANDBOX_LIMITS: SandboxLimits = {
  nanoCpus: 1_000_000_000,
  memoryBytes: 512 * 1024 * 1024,
  memorySwapBytes: 512 * 1024 * 1024,
  pidsLimit: 128,
  diskQuotaBytes: 2 * 1024 * 1024 * 1024,
  maxRuntimeMs: 15 * 60 * 1000,
};

export function validateLimits(limits: SandboxLimits): void {
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`Sandbox limit ${name} must be positive`);
    }
  }
  if (limits.memorySwapBytes < limits.memoryBytes) {
    throw new RangeError("Sandbox swap limit cannot be below memory limit");
  }
  if (limits.pidsLimit < 1 || !Number.isInteger(limits.pidsLimit)) {
    throw new RangeError("Sandbox PID limit must be a positive integer");
  }
}
