/**
 * Test login flow against deployed API: signin returns token, session accepts Bearer.
 * Run: node scripts/test-login-flow.mjs
 */
const API_BASE = "https://as-groovegraph-api.azurewebsites.net";

async function main() {
  // 1. Sign in
  const signinRes = await fetch(`${API_BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "nickknyc" }),
  });
  const signinText = await signinRes.text();
  if (!signinRes.ok) {
    console.error("Signin failed:", signinRes.status, signinText);
    process.exit(1);
  }
  let signinData;
  try {
    signinData = JSON.parse(signinText);
  } catch {
    console.error("Signin response not JSON:", signinText);
    process.exit(1);
  }
  const token = signinData?.token;
  if (!token || typeof token !== "string") {
    console.error("Signin response missing token:", signinData);
    process.exit(1);
  }
  console.log("Signin OK, got token");

  // 2. Session with Bearer
  const sessionRes = await fetch(`${API_BASE}/api/auth/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const sessionData = await sessionRes.json().catch(() => ({}));
  if (!sessionRes.ok || sessionData?.admin !== true) {
    console.error("Session with Bearer failed or admin false:", sessionRes.status, sessionData);
    process.exit(1);
  }
  console.log("Session OK, admin:", sessionData.admin);
  console.log("Login flow test passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
