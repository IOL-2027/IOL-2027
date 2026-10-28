-- Emails that go out on their own (payment, registration, badges, the daily summary) are kept until they are sent:
-- if sending fails, the scheduled job (server/jobs.js) tries again later. `message` holds the body and attachments
-- until then and is cleared once the email goes out. `next_attempt_at` is when to try again; for one being sent, it
-- is when to give up waiting and try again (in case the server stopped mid-send).
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS message jsonb;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE email_deliveries ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_status_check;
ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_status_check CHECK (status IN ('queued', 'sending', 'sent', 'retrying', 'failed', 'skipped'));
CREATE INDEX IF NOT EXISTS email_deliveries_due_idx ON email_deliveries (next_attempt_at) WHERE message IS NOT NULL;

-- The badges last emailed to each Team Leader ([{ id, name, fingerprint, publicId }]), so a change to a name, role,
-- team or QR, or a person added or removed, is emailed again the next morning.
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS badges_mailed jsonb;
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS badges_mailed_at timestamptz;

-- What the scheduled job last did each day (the morning badge updates, the registration admins' summary).
CREATE TABLE IF NOT EXISTS job_state (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
