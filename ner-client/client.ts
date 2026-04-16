import type {
  ExtractRequest,
  ExtractResponse,
  HealthResponse,
} from "./types";

export class NerServiceClient {
  constructor(private readonly baseUrl: string) {}

  async health(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/health`);
    if (!res.ok) {
      throw new Error(`Health request failed: ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as HealthResponse;
  }

  async extract(req: ExtractRequest): Promise<ExtractResponse> {
    const res = await fetch(`${this.baseUrl}/extract`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req),
    });

    if (!res.ok) {
      throw new Error(`Extract request failed: ${res.status} ${res.statusText}`);
    }

    return (await res.json()) as ExtractResponse;
  }
}
