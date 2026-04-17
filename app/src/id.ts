export function createRunId(question: string): string {
  const slug = question
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 36) || "run";
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${stamp}-${slug}`;
}
