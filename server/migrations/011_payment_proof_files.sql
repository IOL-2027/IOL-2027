-- A proof of payment can be several files (a bank confirmation per transfer, a screenshot and a PDF, ...): each file
-- is linked to its payment. A file the Team Leader removes is unlinked, not deleted, so the record of what was sent
-- stays. Proofs uploaded before this was added are linked from payments.proof_attachment_id.
ALTER TABLE attachments ADD COLUMN IF NOT EXISTS payment_id uuid REFERENCES payments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS attachments_payment_idx ON attachments (payment_id);
UPDATE attachments a SET payment_id = p.id FROM payments p WHERE p.proof_attachment_id = a.id AND a.payment_id IS NULL;
