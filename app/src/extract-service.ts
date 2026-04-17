import { getEnvValue } from "./env.ts";

export async function callExtractionService(payload: unknown): Promise<any> {
  const baseUrl = getEnvValue("LOCAL_ENTITY_SERVICE_URL", "http://127.0.0.1:8200");
  try {
    const response = await fetch(`${baseUrl}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({ raw: null }));
    return {
      ok: response.ok,
      status_code: response.status,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status_code: 0,
      body: {
        entities: [],
        relations: [],
        properties: [],
        diagnostics: {
          detail: error instanceof Error ? error.message : "extract_service_unreachable",
        },
      },
    };
  }
}
