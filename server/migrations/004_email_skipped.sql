-- Emails to reserved test addresses (name@something.test) are recorded but never sent.
ALTER TABLE email_deliveries DROP CONSTRAINT IF EXISTS email_deliveries_status_check;
ALTER TABLE email_deliveries ADD CONSTRAINT email_deliveries_status_check CHECK (status IN ('queued', 'sent', 'failed', 'skipped'));
