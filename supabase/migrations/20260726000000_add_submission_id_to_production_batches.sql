-- production_batches has no link back to the staff_submissions row that created it via
-- approval, so editing an already-approved production submission's batch_qty has no
-- reliable way to find the matching production_batches row to reconcile. Add a nullable
-- link column; historical rows (approved before this migration) stay NULL and must be
-- treated as "cannot reconcile" in the app layer.
ALTER TABLE public.production_batches
  ADD COLUMN IF NOT EXISTS submission_id text;
