// Matches src/staff/StaffPortal.jsx:27 exactly — REASONS = ["Expired","Damaged","Overproduction","Spillage","Other"]
export const REASONS = ["Expired", "Damaged", "Overproduction", "Spillage", "Other"] as const
export type Reason = (typeof REASONS)[number]

export function isValidReason(value: unknown): value is Reason {
  return typeof value === "string" && (REASONS as readonly string[]).includes(value)
}
