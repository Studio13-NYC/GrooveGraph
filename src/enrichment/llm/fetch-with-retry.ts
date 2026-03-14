/**
 * Retry policy for LLM calls (Phase 8). Retries on 5xx and timeout/abort.
 */

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_DELAY_MS = 1000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMaxRetries(): number {
  const v = process.env.ENRICHMENT_LLM_MAX_RETRIES;
  if (v == null || v === "") return DEFAULT_MAX_RETRIES;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_MAX_RETRIES;
}

function getDelayMs(): number {
  const v = process.env.ENRICHMENT_LLM_RETRY_DELAY_MS;
  if (v == null || v === "") return DEFAULT_DELAY_MS;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DELAY_MS;
}

function isRetryableError(err: unknown): boolean {
  if (err instanceof Error && err.name === "AbortError") return true;
  const cause = err instanceof Error ? (err as { cause?: unknown }).cause : undefined;
  if (cause instanceof Error && (cause as { code?: string }).code === "UND_ERR_HEADERS_TIMEOUT")
    return true;
  return false;
}

/**
 * Call fetch and return response. Throws on 4xx or after retries exhausted.
 * On 5xx or timeout/abort, retries up to maxRetries with exponential backoff.
 */
export async function fetchWithRetry(
  fn: () => Promise<Response>,
  options?: { maxRetries?: number; delayMs?: number; logPrefix?: string }
): Promise<Response> {
  const maxRetries = options?.maxRetries ?? getMaxRetries();
  const delayMs = options?.delayMs ?? getDelayMs();
  const logPrefix = options?.logPrefix ?? "[llm-retry]";
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fn();
      if (response.ok || response.status < 500) return response;
      lastErr = new Error(`HTTP ${response.status}`);
      if (attempt < maxRetries) {
        const wait = delayMs * Math.pow(2, attempt);
        console.warn(`${logPrefix} attempt ${attempt + 1} got ${response.status}, retrying in ${wait}ms`);
        await delay(wait);
      } else {
        return response;
      }
    } catch (err) {
      lastErr = err;
      if (!isRetryableError(err) || attempt >= maxRetries) throw err;
      const wait = delayMs * Math.pow(2, attempt);
      console.warn(`${logPrefix} attempt ${attempt + 1} failed (timeout/abort), retrying in ${wait}ms`);
      await delay(wait);
    }
  }
  throw lastErr;
}

/**
 * Generic retry for a function that may throw. Retries on throw when isRetryable(err).
 * Use for undici/fetch that throws on timeout (e.g. triplet pipeline).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: {
    maxRetries?: number;
    delayMs?: number;
    logPrefix?: string;
    isRetryable?: (err: unknown) => boolean;
  }
): Promise<T> {
  const maxRetries = options?.maxRetries ?? getMaxRetries();
  const delayMs = options?.delayMs ?? getDelayMs();
  const logPrefix = options?.logPrefix ?? "[llm-retry]";
  const isRetryable = options?.isRetryable ?? ((err: unknown) => isRetryableError(err) || (err instanceof Error && /^HTTP 5\d\d/.test(err.message)));
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt >= maxRetries) throw err;
      const wait = delayMs * Math.pow(2, attempt);
      console.warn(`${logPrefix} attempt ${attempt + 1} failed, retrying in ${wait}ms`);
      await delay(wait);
    }
  }
  throw lastErr;
}
