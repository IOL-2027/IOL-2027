-- 12 Nov 2026: the person who registers a country is its national representative, who may or may not also be a Team
-- Leader. Sign-up no longer asks for a name: Team and observers asks for the representative's name, whether they are
-- also the first team's Team Leader, and each team's Team Leader. The delegation's name column now holds the
-- representative (it held the account's own Team Leader, who was the same person until now).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'delegations' AND column_name = 'national_representative_name') THEN
    ALTER TABLE delegations RENAME COLUMN national_representative_name TO national_representative_name;
  END IF;
END $$;
-- NULL until Team and observers is answered. Everyone registered so far signed up as their first team's Team Leader.
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS representative_is_team_leader boolean;
UPDATE delegations SET representative_is_team_leader = true WHERE representative_is_team_leader IS NULL AND national_representative_name <> '';
