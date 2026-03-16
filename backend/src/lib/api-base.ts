const PRODUCTION_API_BASE = "https://as-groovegraph-api.azurewebsites.net";
const SWA_HOSTS = ["groovegraph.s13.nyc", "jolly-coast-00d3fab0f.6.azurestaticapps.net"];

/**
 * Base URL for API requests. When the UI is served from a different origin than the API
 * (e.g. static UI on SWA, API on App Service), set NEXT_PUBLIC_API_BASE_URL at build time.
 * When unset, relative /api/* requests are used (same-origin).
 * When served from known SWA hosts and env is empty, use production API (avoids Failed to fetch from wrong origin).
 */
export function getApiBase(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";
  if (fromEnv) return fromEnv;
  if (typeof window !== "undefined" && window.location?.hostname && SWA_HOSTS.includes(window.location.hostname)) {
    return PRODUCTION_API_BASE;
  }
  return "";
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
