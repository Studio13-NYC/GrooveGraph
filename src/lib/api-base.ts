/**
 * Base URL for API requests. When the UI is served from a different origin than the API
 * (e.g. static UI on SWA, API on App Service), set NEXT_PUBLIC_API_BASE_URL at build time.
 * When unset, relative /api/* requests are used (same-origin).
 */
export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}
