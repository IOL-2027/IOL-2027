-- 24 Nov 2026 (meeting with the professor): consent forms. Each person's form (Form A at 18 or over, Form B signed by a
-- parent or guardian under 18) is emailed to the national representative once People is complete; the signed forms
-- come back as one or more files for the whole registration, and the representative ticks, for each person, whether
-- they consent (members.photo_consent, which that tick now holds).
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_kind_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_kind_check CHECK (kind IN ('guardian_consent', 'payment_proof', 'passport_copy', 'other', 'photo', 'consent_form'));
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS consent_forms_emailed_at timestamptz;
