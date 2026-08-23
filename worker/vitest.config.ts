import { defineConfig } from "vitest/config"

// Plain Vitest (Node environment) is enough for now — every test here exercises pure logic
// (date-boundary math, auth allowlist matching) with no Workers-runtime dependency (bindings,
// fetch semantics, etc.). @cloudflare/vitest-pool-workers stays a devDependency for when a real
// integration test (needing Hyperdrive/KV bindings) is added later; wiring it back in hit a
// version-compatibility gap with Vitest 4's pool rework as of 2026-08 — revisit then.
export default defineConfig({
  test: {},
})
