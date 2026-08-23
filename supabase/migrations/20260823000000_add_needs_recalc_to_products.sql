-- Voiding a Paid PO intentionally does not retroactively recalculate cost_per_unit/cogs (see
-- InvPO.jsx voidPO()'s own confirm text) — this flag lets Profitability surface a "may be
-- stale" indicator for any product whose recipe touched a voided PO's ingredients, instead of
-- silently showing a cogs value that still reflects the reversed purchase. Set to true by
-- voidPO() (flagNeedsRecalc), cleared back to false by cascadeRecalc() the next time it actually
-- recomputes that product's cogs.
alter table products add column if not exists needs_recalc boolean default false;
