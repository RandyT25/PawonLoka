// Supabase Storage upload via its REST API directly (no @supabase/supabase-js dependency,
// matching this project's existing pattern of talking to Postgres via Hyperdrive/postgres.js
// rather than the Supabase JS SDK). Uses the anon key, not service_role — confirmed live
// (2026-08-19) that Storage's REST API only ever authenticates as anon/service_role/an Auth
// user JWT, never as an arbitrary custom Postgres role, so the agent_writer credential model
// used everywhere else in this project doesn't extend to Storage. The receiving-evidence
// bucket's own RLS policy is scoped to just that bucket, matching how every other public bucket
// in this app already allows anon uploads (attendance-photos, logos, product-images) — not a new
// risk, just consistent with existing precedent. service_role is never used here or anywhere in
// this project (AGENT_LAYER_DESIGN.md Section 11).
export async function uploadToBucket(
  supabaseUrl: string,
  anonKey: string,
  bucket: string,
  path: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const res = await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${encodeURIComponent(path)}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      "content-type": contentType,
    },
    body: bytes,
  })
  if (!res.ok) {
    throw new Error(`storage upload failed: ${res.status} ${await res.text()}`)
  }
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${path}`
}
