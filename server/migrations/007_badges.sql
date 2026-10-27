-- Badges for event staff, guides, volunteers and guests, who are not in any delegation, and a record of what
-- was sent to print. A badge credential (and a check-in) now belongs to either a delegation member or one of these people.
CREATE TABLE IF NOT EXISTS event_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  badge_name text,
  category text NOT NULL CHECK (category IN ('staff', 'guide', 'volunteer', 'guest')),
  assignment text,
  email text,
  created_by_account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE badge_credentials ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE badge_credentials ADD COLUMN IF NOT EXISTS staff_id uuid UNIQUE REFERENCES event_staff(id) ON DELETE CASCADE;
-- When the badge went to print, and a fingerprint of what was printed on it (name, role, place, QR), so a later
-- change shows the badge as needing a reprint.
ALTER TABLE badge_credentials ADD COLUMN IF NOT EXISTS printed_at timestamptz;
ALTER TABLE badge_credentials ADD COLUMN IF NOT EXISTS printed_fingerprint text;

ALTER TABLE check_in_events ALTER COLUMN member_id DROP NOT NULL;
ALTER TABLE check_in_events ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES event_staff(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS check_in_events_staff_idx ON check_in_events (staff_id, scanned_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'badge_credentials_one_holder') THEN
    ALTER TABLE badge_credentials ADD CONSTRAINT badge_credentials_one_holder CHECK ((member_id IS NULL) <> (staff_id IS NULL));
  END IF;
END $$;
