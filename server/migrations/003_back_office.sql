-- Sprint 2: password reset, invitation sending, receipts and organiser settings.

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  -- Wrong guesses against this code; it stops working after five.
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_account_idx ON password_reset_tokens (account_id, created_at DESC);

ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS sent_at timestamptz;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 0;
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS created_by_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL;

-- Receipt numbers are issued in order when Finance approves a payment.
CREATE SEQUENCE IF NOT EXISTS receipt_number_seq;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_number text UNIQUE;

-- Organiser-owned values (fees, guardian consent policy). Defaults live in server/fees.js.
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
