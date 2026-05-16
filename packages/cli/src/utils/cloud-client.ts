import { normalizeCloudEndpoint } from "./cloud-config";

export interface CloudClientOptions {
  endpoint: string;
  token: string;
  fetchImpl?: typeof fetch;
}

export class CloudApiError extends Error {
  status: number;
  details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "CloudApiError";
    this.status = status;
    this.details = details;
  }
}

export interface WorkflowDefinition {
  nodes: unknown[];
  edges: unknown[];
}

export interface WorkflowInput {
  name: string;
  description?: string;
  definition?: WorkflowDefinition;
  settings?: unknown;
  tags?: string[];
  walletId?: string | null;
}

export class CloudClient {
  private endpoint: string;
  private token: string;
  private fetchImpl: typeof fetch;

  constructor(options: CloudClientOptions) {
    this.endpoint = normalizeCloudEndpoint(options.endpoint);
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async health(): Promise<any> {
    return this.request("/api/health", { auth: false });
  }

  async whoami(): Promise<any> {
    return this.request("/api/cli/v1/whoami");
  }

  async listWorkflows(): Promise<any> {
    return this.request("/api/cli/v1/workflows");
  }

  async getWorkflow(id: string): Promise<any> {
    return this.request(`/api/cli/v1/workflows/${encodeURIComponent(id)}`);
  }

  async createWorkflow(input: WorkflowInput): Promise<any> {
    return this.request("/api/cli/v1/workflows", {
      method: "POST",
      body: input,
    });
  }

  async updateWorkflow(id: string, input: Partial<WorkflowInput>): Promise<any> {
    return this.request(`/api/cli/v1/workflows/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
    });
  }

  async deleteWorkflow(id: string): Promise<any> {
    return this.request(`/api/cli/v1/workflows/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async activateWorkflow(id: string): Promise<any> {
    return this.request(`/api/cli/v1/workflows/${encodeURIComponent(id)}/activate`, {
      method: "POST",
    });
  }

  async deactivateWorkflow(id: string): Promise<any> {
    return this.request(`/api/cli/v1/workflows/${encodeURIComponent(id)}/deactivate`, {
      method: "POST",
    });
  }

  async runWorkflow(id: string, testData?: unknown): Promise<any> {
    return this.request(`/api/cli/v1/workflows/${encodeURIComponent(id)}/run`, {
      method: "POST",
      body: { testData },
    });
  }

  async listExecutions(input: { workflowId?: string; limit?: number } = {}): Promise<any> {
    const params = new URLSearchParams();
    if (input.workflowId) params.set("workflowId", input.workflowId);
    if (input.limit) params.set("limit", String(input.limit));
    const suffix = params.toString() ? `?${params.toString()}` : "";
    return this.request(`/api/cli/v1/executions${suffix}`);
  }

  async getExecution(id: string): Promise<any> {
    return this.request(`/api/cli/v1/executions/${encodeURIComponent(id)}`);
  }

  async listCredentials(): Promise<any> {
    return this.request("/api/cli/v1/credentials");
  }

  async createCredential(input: {
    label: string;
    type: string;
    data: Record<string, unknown>;
  }): Promise<any> {
    return this.request("/api/cli/v1/credentials", {
      method: "POST",
      body: input,
    });
  }

  async deleteCredential(id: string): Promise<any> {
    return this.request(`/api/cli/v1/credentials/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async listWallets(): Promise<any> {
    return this.request("/api/cli/v1/wallets");
  }

  async createWallet(input: {
    label: string;
    network?: "mainnet" | "devnet";
  }): Promise<any> {
    return this.request("/api/cli/v1/wallets", {
      method: "POST",
      body: input,
    });
  }

  async deleteWallet(id: string): Promise<any> {
    return this.request(`/api/cli/v1/wallets/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  async listNodes(): Promise<any> {
    return this.request("/api/cli/v1/nodes");
  }

  private async request(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      auth?: boolean;
    } = {},
  ): Promise<any> {
    const method = options.method ?? "GET";
    const headers: Record<string, string> = {
      accept: "application/json",
    };
    if (options.auth ?? true) {
      headers.authorization = `Bearer ${this.token}`;
    }
    const init: RequestInit = {
      method,
      headers,
    };
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }

    const response = await this.fetchImpl(`${this.endpoint}${path}`, init);
    const data = await readResponseBody(response);
    if (!response.ok) {
      const message =
        data && typeof data === "object" && "error" in data
          ? String((data as { error: unknown }).error)
          : `SolStudio Cloud API returned HTTP ${response.status}`;
      throw new CloudApiError(response.status, message, data);
    }
    return data;
  }
}

async function readResponseBody(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json();
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
