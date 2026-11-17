-- 17 Nov 2026: the IOL Board's feedback (meeting of 16 Nov) and the professor's walkthrough.

-- The national representative is the one main contact; with two teams they may lead either team, or neither.
-- 0 is the first team, 1 the second, null not a Team Leader. representative_is_team_leader stays in step with it.
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS representative_team smallint CHECK (representative_team IN (0, 1));
UPDATE delegations SET representative_team = 0 WHERE representative_team IS NULL AND representative_is_team_leader;

-- Jury members and volunteers register on their own, with a code shared by everyone of their kind: a "delegation"
-- of one person (a jury member may bring one observer). Country delegations are kind 'country'.
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'country' CHECK (kind IN ('country', 'jury', 'volunteer'));
-- Jury members and volunteers say whether they need a hotel room (volunteers living in Bangkok may not).
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS needs_accommodation boolean;
-- Ticked on Submit: the royal reception's dress code and protocol, and the travel insurance notice.
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS dress_code_acknowledged_at timestamptz;
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS insurance_acknowledged_at timestamptz;

ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'country' CHECK (kind IN ('country', 'jury', 'volunteer'));
-- A shared code is never used up: each person it is given to creates their own account with it.
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS shared boolean NOT NULL DEFAULT false;

ALTER TABLE members DROP CONSTRAINT IF EXISTS members_role_check;
ALTER TABLE members ADD CONSTRAINT members_role_check CHECK (role IN ('contestant', 'team_leader', 'observer', 'jury', 'volunteer'));
-- Diets as ticked options (several allowed); food_allergy_notes keeps the details for "Other" and allergies.
ALTER TABLE members ADD COLUMN IF NOT EXISTS diet text[] NOT NULL DEFAULT '{}';
-- Consent to appear in photos and videos taken at the event, confirmed by the national representative (null: not answered).
ALTER TABLE members ADD COLUMN IF NOT EXISTS photo_consent boolean;

-- Arriving: picked up at the airport, or making their own way to the hotel; leaving, the same back.
ALTER TABLE travel_records ADD COLUMN IF NOT EXISTS transport text NOT NULL DEFAULT 'organisers' CHECK (transport IN ('organisers', 'own'));

-- Jury and observers can be added by staff as event guests for badges, as volunteers and guides already can.
ALTER TABLE event_staff DROP CONSTRAINT IF EXISTS event_staff_category_check;
ALTER TABLE event_staff ADD CONSTRAINT event_staff_category_check CHECK (category IN ('staff', 'guide', 'volunteer', 'guest', 'jury', 'observer'));

-- A jury member's or volunteer's photo, cropped in the portal to the same frame for everyone.
ALTER TABLE attachments DROP CONSTRAINT IF EXISTS attachments_kind_check;
ALTER TABLE attachments ADD CONSTRAINT attachments_kind_check CHECK (kind IN ('guardian_consent', 'payment_proof', 'passport_copy', 'other', 'photo'));

-- Team Leaders now always belong to their team (set in Team and observers). One made at sign-up before 12 Nov 2026
-- had none: it joins the first team, unless that team already has its Team Leader.
UPDATE members m SET team_id = t.id
FROM (SELECT DISTINCT ON (delegation_id) id, delegation_id FROM teams ORDER BY delegation_id, code) t
WHERE m.role = 'team_leader' AND m.team_id IS NULL AND t.delegation_id = m.delegation_id
  AND NOT EXISTS (SELECT 1 FROM members o WHERE o.delegation_id = m.delegation_id AND o.role = 'team_leader' AND o.team_id = t.id);

-- Diets written as notes before the tick boxes keep their words in the food notes, under "Other".
UPDATE members SET diet = ARRAY['Other'] WHERE diet = '{}' AND food_allergy_notes IS NOT NULL
  AND trim(food_allergy_notes) <> '' AND food_allergy_notes !~* '^(none|no|n/a|-|no restrictions|no special requirements)\.?$';
UPDATE members SET diet = ARRAY['No special diet'] WHERE diet = '{}' AND food_allergy_notes ~* '^(none|no|n/a|-|no restrictions|no special requirements)\.?$';

-- Transport planning (IOL Board, 16 Nov 2026): the pickup time the transport team sets for each arrival and departure,
-- with the bus group and meeting point already kept on the trip, and when the delegation was last emailed them.
ALTER TABLE travel_records ADD COLUMN IF NOT EXISTS loc_pickup_time time;
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS pickup_emailed_at timestamptz;
