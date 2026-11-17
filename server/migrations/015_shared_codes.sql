-- 18 Nov 2026: a jury or volunteer code is shared, so many registrations come from it. A country's code still makes
-- exactly one.
ALTER TABLE delegations DROP CONSTRAINT IF EXISTS delegations_invite_code_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS delegations_country_invite_unique ON delegations (invite_code_id) WHERE kind = 'country';
CREATE INDEX IF NOT EXISTS delegations_invite_code_idx ON delegations (invite_code_id);
