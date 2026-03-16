/**
 * Base URL for API requests. When the UI is served from a different origin than the API
 * (e.g. static UI on SWA, API on App Service), set NEXT_PUBLIC_API_BASE_URL at build time.
 * When unset, relative /api/* requests are used (same-origin).
 */
export function getApiBase(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
}

const ADMIN_STORAGE_KEY = "gg_admin";
const ADMIN_USERNAME = "nickknyc";

/** When UI has "logged in" (gg_admin in sessionStorage), send header so API treats request as admin. */
export function getAuthHeaders(): HeadersInit {
  if (typeof sessionStorage === "undefined") return {};
  try {
    if (sessionStorage.getItem(ADMIN_STORAGE_KEY)) {
      return { "X-Admin-User": ADMIN_USERNAME };
    }
  } catch {
    /* ignore */
  }
  return {};
}
