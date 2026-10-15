-- Sessions, roles and the fields the redesigned portal collects.
-- Safe to run more than once.

-- Roles: one per account. See docs/ROLES.md.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'team_leader';
ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_role_check;
ALTER TABLE accounts ADD CONSTRAINT accounts_role_check CHECK (role IN (
  'team_leader', 'participant', 'registration_admin', 'finance_admin', 'checkin_staff',
  'welfare_staff', 'content_editor', 'results_staff', 'viewer', 'super_admin'
));
-- A participant account is linked to exactly one member record.
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES members(id) ON DELETE SET NULL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS disabled_at timestamptz;

-- Server-side sessions. Only a SHA-256 hash of the cookie token is stored.
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  user_agent text,
  ip text
);
CREATE INDEX IF NOT EXISTS sessions_account_idx ON sessions (account_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

-- Failed sign-ins, for lockout across all API instances.
CREATE TABLE IF NOT EXISTS login_attempts (
  id bigserial PRIMARY KEY,
  email text NOT NULL,
  ip text,
  succeeded boolean NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_attempts_email_idx ON login_attempts (lower(email), attempted_at DESC);

-- Portal fields that had no column.
ALTER TABLE members ADD COLUMN IF NOT EXISTS polo_size text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_recipient_name text;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_recipient_address text;
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS welfare_note text;
-- Steps the Team Leader has marked done in the portal (setup, teams, people, welfare, travel).
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS completed_steps text[] NOT NULL DEFAULT '{}';

-- Track applied migrations.
CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);
