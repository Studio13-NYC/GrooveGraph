export default function globalSetup() {
  const attempt = process.env.E2E_ATTEMPT;
  if (attempt != null && attempt !== "") {
    console.log(`\n[E2E] Attempt: ${attempt}\n`);
  }
}
