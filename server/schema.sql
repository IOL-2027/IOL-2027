CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  country_territory text NOT NULL,
  accredited_organisation text,
  contact_email text,
  max_teams integer NOT NULL DEFAULT 2 CHECK (max_teams BETWEEN 1 AND 2),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'used', 'revoked')),
  used_at timestamptz,
  used_by_account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  full_name text NOT NULL,
  password_hash text,
  google_subject text,
  email_verified_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_lower_idx ON accounts (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS accounts_google_subject_idx ON accounts (google_subject) WHERE google_subject IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invite_codes_used_by_account_id_fkey'
  ) THEN
    ALTER TABLE invite_codes
      ADD CONSTRAINT invite_codes_used_by_account_id_fkey
      FOREIGN KEY (used_by_account_id) REFERENCES accounts(id)
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS email_verification_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verification_tokens_account_idx ON email_verification_tokens (account_id, expires_at DESC);

CREATE TABLE IF NOT EXISTS email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  recipient_email text NOT NULL,
  purpose text NOT NULL,
  provider text NOT NULL DEFAULT 'resend',
  provider_message_id text,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
  error_message text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_deliveries_account_idx ON email_deliveries (account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS delegations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES accounts(id) ON DELETE RESTRICT,
  invite_code_id uuid NOT NULL UNIQUE REFERENCES invite_codes(id) ON DELETE RESTRICT,
  country_territory text NOT NULL,
  accredited_organisation text,
  primary_team_leader_name text NOT NULL,
  team_leader_email text NOT NULL,
  mobile_whatsapp text,
  registration_contact_email text,
  number_of_teams integer NOT NULL DEFAULT 1 CHECK (number_of_teams BETWEEN 1 AND 2),
  number_of_contestants integer NOT NULL DEFAULT 4 CHECK (number_of_contestants BETWEEN 1 AND 8),
  number_of_observers integer NOT NULL DEFAULT 0 CHECK (number_of_observers >= 0),
  adult_room_preference text NOT NULL DEFAULT 'no_preference' CHECK (adult_room_preference IN ('single', 'shared', 'no_preference')),
  registration_status text NOT NULL DEFAULT 'draft' CHECK (registration_status IN ('draft', 'submitted', 'payment_pending', 'confirmed', 'locked', 'cancelled')),
  payment_status text NOT NULL DEFAULT 'awaiting_proof' CHECK (payment_status IN ('awaiting_proof', 'awaiting_review', 'approved', 'rejected', 'refunded')),
  travel_status text NOT NULL DEFAULT 'fill_later' CHECK (travel_status IN ('fill_later', 'in_progress', 'submitted', 'locked')),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE delegations ADD COLUMN IF NOT EXISTS number_of_contestants integer NOT NULL DEFAULT 4;
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS adult_room_preference text NOT NULL DEFAULT 'no_preference';

CREATE INDEX IF NOT EXISTS delegations_account_idx ON delegations (account_id);
CREATE INDEX IF NOT EXISTS delegations_status_idx ON delegations (registration_status, payment_status, travel_status);

CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id uuid NOT NULL REFERENCES delegations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NOT NULL,
  leader_member_id uuid,
  contest_language text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'needs_review', 'locked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delegation_id, code),
  UNIQUE (delegation_id, name)
);

CREATE INDEX IF NOT EXISTS teams_delegation_idx ON teams (delegation_id);

CREATE TABLE IF NOT EXISTS members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id uuid NOT NULL REFERENCES delegations(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE SET NULL,
  role text NOT NULL CHECK (role IN ('contestant', 'team_leader', 'observer')),
  observer_category text,
  display_name text NOT NULL,
  badge_name text,
  official_name text NOT NULL,
  passport_name text,
  passport_number text,
  passport_nationality text,
  date_of_birth date,
  gender_for_room_allocation text,
  exam_language text,
  tshirt_size text,
  food_allergy_notes text,
  medical_accessibility_notes text,
  emergency_contact text,
  room_type_preference text,
  email text,
  mobile_whatsapp text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE members ADD COLUMN IF NOT EXISTS badge_name text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS exam_language text;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = 'individual_working_language') THEN
    EXECUTE 'UPDATE members SET exam_language = COALESCE(exam_language, individual_working_language)';
  END IF;
END $$;

ALTER TABLE members DROP COLUMN IF EXISTS visa_support_required;
ALTER TABLE members DROP COLUMN IF EXISTS individual_working_language;

CREATE INDEX IF NOT EXISTS members_delegation_idx ON members (delegation_id);
CREATE INDEX IF NOT EXISTS members_team_idx ON members (team_id);
CREATE INDEX IF NOT EXISTS members_role_idx ON members (role);

CREATE TABLE IF NOT EXISTS badge_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL UNIQUE REFERENCES members(id) ON DELETE CASCADE,
  public_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  secret_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked', 'reissued')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE TABLE IF NOT EXISTS check_in_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  badge_credential_id uuid REFERENCES badge_credentials(id) ON DELETE SET NULL,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  scanned_by_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  checkpoint text NOT NULL,
  result text NOT NULL CHECK (result IN ('accepted', 'revoked', 'invalid')),
  scanned_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS check_in_events_member_idx ON check_in_events (member_id, scanned_at DESC);
CREATE INDEX IF NOT EXISTS check_in_events_checkpoint_idx ON check_in_events (checkpoint, scanned_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'teams_leader_member_id_fkey'
  ) THEN
    ALTER TABLE teams
      ADD CONSTRAINT teams_leader_member_id_fkey
      FOREIGN KEY (leader_member_id) REFERENCES members(id)
      ON DELETE SET NULL
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS travel_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id uuid NOT NULL REFERENCES delegations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('arrival', 'departure')),
  travel_point text,
  flight_service_number text,
  local_date date,
  local_time time,
  terminal text,
  change_status text NOT NULL DEFAULT 'open' CHECK (change_status IN ('open', 'submitted_to_loc', 'locked')),
  loc_meeting_point_note text,
  loc_volunteer_contact text,
  loc_transport_group text,
  boarding_check_status text NOT NULL DEFAULT 'not_checked_in' CHECK (boarding_check_status IN ('not_checked_in', 'checked_in', 'boarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS travel_records_delegation_idx ON travel_records (delegation_id);
CREATE INDEX IF NOT EXISTS travel_records_direction_idx ON travel_records (direction);

CREATE TABLE IF NOT EXISTS travel_record_people (
  travel_record_id uuid NOT NULL REFERENCES travel_records(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  PRIMARY KEY (travel_record_id, member_id)
);

CREATE TABLE IF NOT EXISTS attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id uuid NOT NULL REFERENCES delegations(id) ON DELETE CASCADE,
  member_id uuid REFERENCES members(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('guardian_consent', 'payment_proof', 'passport_copy', 'other')),
  original_filename text NOT NULL,
  stored_path text NOT NULL,
  mime_type text NOT NULL,
  size_bytes integer NOT NULL CHECK (size_bytes >= 0),
  uploaded_by_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS attachments_delegation_idx ON attachments (delegation_id);
CREATE INDEX IF NOT EXISTS attachments_member_idx ON attachments (member_id);
CREATE INDEX IF NOT EXISTS attachments_kind_idx ON attachments (kind);

CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delegation_id uuid NOT NULL REFERENCES delegations(id) ON DELETE CASCADE,
  fee_tier text NOT NULL DEFAULT 'early_bird',
  currency char(3) NOT NULL DEFAULT 'USD',
  amount_due numeric(12,2) NOT NULL DEFAULT 0,
  payment_reference text NOT NULL,
  invoice_count integer NOT NULL DEFAULT 1 CHECK (invoice_count >= 1),
  invoice_split_note text,
  bank_account_status text NOT NULL DEFAULT 'pending_finance',
  status text NOT NULL DEFAULT 'awaiting_proof' CHECK (status IN ('awaiting_proof', 'awaiting_review', 'approved', 'rejected', 'refunded')),
  proof_attachment_id uuid REFERENCES attachments(id) ON DELETE SET NULL,
  reviewed_by_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (delegation_id, payment_reference)
);

ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_count integer NOT NULL DEFAULT 1;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_split_note text;

CREATE INDEX IF NOT EXISTS payments_delegation_idx ON payments (delegation_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);

CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  delegation_id uuid REFERENCES delegations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_events_delegation_idx ON audit_events (delegation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events (actor_account_id, created_at DESC);
