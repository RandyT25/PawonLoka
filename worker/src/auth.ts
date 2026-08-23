// Phase 1A allowlist: a single hardcoded owner Telegram ID, per AGENT_LAYER_DESIGN.md Section 16 —
// no telegram_users table yet (that's introduced in Phase 1B, once multi-user staff mapping is
// actually needed).

export function isAllowedOwner(fromId: number | undefined, ownerIdEnv: string): boolean {
  if (fromId === undefined) return false
  const ownerId = Number(ownerIdEnv)
  return Number.isFinite(ownerId) && fromId === ownerId
}
