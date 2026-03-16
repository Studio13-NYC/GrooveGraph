import { test, expect } from "@playwright/test";

test("login with nickknyc and see Explore nav, then load graph", async ({ page }) => {
  const graphFailures: string[] = [];
  page.on("requestfailed", (req) => {
    const u = req.url();
    if (u.includes("/api/graph") || u.includes("as-groovegraph-api")) {
      graphFailures.push(`${req.failure()?.errorText ?? "unknown"} ${u.slice(0, 80)}`);
    }
  });

  await page.goto("/login");
  await expect(page.getByRole("heading", { name: /admin sign-in/i })).toBeVisible();

  await page.getByLabel(/admin username/i).fill("nickknyc");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\//);
  await expect(page.getByRole("link", { name: /explore/i }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: /enrichment/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /sign out/i })).toBeVisible();

  await page.goto("/?view=graph&entityType=Artist");
  await expect(page.getByText(/unified exploration/i)).toBeVisible();
  await page.waitForTimeout(5000);

  const failedText = page.getByText("Failed to fetch");
  if (await failedText.isVisible()) {
    const fullError = await page.getByText(/Failed to fetch/).first().textContent();
    console.log("[e2e] Graph error visible:", fullError);
    console.log("[e2e] Request failures:", graphFailures);
  }
  await expect(page.getByText("Failed to fetch")).not.toBeVisible();
});
