INSERT INTO invite_codes (id, code, country_territory, accredited_organisation, contact_email, max_teams, status)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'IOL2027-THA-7F3K',
  'Thailand',
  'National Linguistics Olympiad',
  'registration@national-olympiad.org',
  2,
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  country_territory = EXCLUDED.country_territory,
  accredited_organisation = EXCLUDED.accredited_organisation,
  contact_email = EXCLUDED.contact_email,
  max_teams = EXCLUDED.max_teams,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO accounts (id, email, full_name, password_hash, email_verified_at)
VALUES (
  '22222222-2222-4222-8222-222222222222',
  'leader@national-olympiad.org',
  'Dr. Ananya Somchai',
  'seed-only-not-a-real-password',
  now()
)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  email_verified_at = EXCLUDED.email_verified_at,
  updated_at = now();

INSERT INTO delegations (
  id,
  account_id,
  invite_code_id,
  country_territory,
  accredited_organisation,
  primary_team_leader_name,
  team_leader_email,
  mobile_whatsapp,
  registration_contact_email,
  number_of_teams,
  number_of_contestants,
  number_of_observers,
  adult_room_preference
)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Thailand',
  'National Linguistics Olympiad',
  'Dr. Ananya Somchai',
  'leader@national-olympiad.org',
  '+66 81 234 5678',
  'registration@national-olympiad.org',
  2,
  8,
  1,
  'single'
)
ON CONFLICT (invite_code_id) DO UPDATE SET
  account_id = EXCLUDED.account_id,
  primary_team_leader_name = EXCLUDED.primary_team_leader_name,
  team_leader_email = EXCLUDED.team_leader_email,
  mobile_whatsapp = EXCLUDED.mobile_whatsapp,
  registration_contact_email = EXCLUDED.registration_contact_email,
  number_of_teams = EXCLUDED.number_of_teams,
  number_of_contestants = EXCLUDED.number_of_contestants,
  number_of_observers = EXCLUDED.number_of_observers,
  adult_room_preference = EXCLUDED.adult_room_preference,
  updated_at = now();

INSERT INTO teams (id, delegation_id, name, code, contest_language, status)
VALUES
  ('44444444-4444-4444-8444-444444444441', '33333333-3333-4333-8333-333333333333', 'Thailand A', 'THA-A', 'English', 'ready'),
  ('44444444-4444-4444-8444-444444444442', '33333333-3333-4333-8333-333333333333', 'Thailand B', 'THA-B', NULL, 'needs_review')
ON CONFLICT (delegation_id, code) DO UPDATE SET
  name = EXCLUDED.name,
  contest_language = EXCLUDED.contest_language,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO members (
  id,
  delegation_id,
  team_id,
  role,
  observer_category,
  display_name,
  badge_name,
  official_name,
  passport_name,
  passport_number,
  passport_nationality,
  date_of_birth,
  gender_for_room_allocation,
  exam_language,
  tshirt_size,
  food_allergy_notes,
  medical_accessibility_notes,
  emergency_contact,
  room_type_preference,
  email,
  mobile_whatsapp
)
VALUES
  ('55555555-5555-4555-8555-555555555551', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444441', 'contestant', NULL, 'Narin Chaiwat', 'Narin', 'Narin Chaiwat', 'CHAIWAT NARIN', 'AA1234567', 'Thai', '2009-02-12', 'Male', 'English', 'M', 'No shellfish', 'No special requirements', 'Somchai Chaiwat, +66 82 111 2233', 'Twin room', NULL, NULL),
  ('55555555-5555-4555-8555-555555555552', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444441', 'contestant', NULL, 'Mali Phan', 'Mali', 'Mali Phan', 'PHAN MALI', 'AA7654321', 'Thai', NULL, 'Female', 'English', 'S', 'Vegetarian', 'No special requirements', 'Nok Phan, +66 82 222 3344', 'Twin room', NULL, NULL),
  ('55555555-5555-4555-8555-555555555553', '33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444441', 'contestant', NULL, 'Kiet Rattanakul', 'Kiet', 'Kiet Rattanakul', 'RATTANAKUL KIET', 'AA2468101', 'Thai', '2009-06-03', 'Male', 'English', 'M', 'No pork', 'Carries inhaler', 'Arun Rattanakul, +66 82 333 4455', 'Twin room', NULL, NULL),
  ('55555555-5555-4555-8555-555555555554', '33333333-3333-4333-8333-333333333333', NULL, 'team_leader', NULL, 'Dr. Ananya Somchai', 'Dr. Ananya', 'Ananya Somchai', 'SOMCHAI ANANYA', 'AB1239000', 'Thai', NULL, 'Female', NULL, NULL, 'No seafood', 'No special requirements', 'Chai Somchai, +66 81 999 8877', 'Single if available', 'leader@national-olympiad.org', '+66 81 234 5678'),
  ('55555555-5555-4555-8555-555555555555', '33333333-3333-4333-8333-333333333333', NULL, 'observer', 'Regular observer', 'Prof. Preecha K.', 'Prof. Preecha', 'Preecha Kittisak', 'KITTISAK PREECHA', 'AB7659001', 'Thai', NULL, 'Male', NULL, 'L', 'No pork', 'No special requirements', 'Maneerat K., +66 81 888 7766', 'Single if available', 'preecha@national-olympiad.org', NULL)
ON CONFLICT (id) DO UPDATE SET
  team_id = EXCLUDED.team_id,
  role = EXCLUDED.role,
  observer_category = EXCLUDED.observer_category,
  display_name = EXCLUDED.display_name,
  badge_name = EXCLUDED.badge_name,
  official_name = EXCLUDED.official_name,
  passport_name = EXCLUDED.passport_name,
  passport_number = EXCLUDED.passport_number,
  passport_nationality = EXCLUDED.passport_nationality,
  date_of_birth = EXCLUDED.date_of_birth,
  gender_for_room_allocation = EXCLUDED.gender_for_room_allocation,
  exam_language = EXCLUDED.exam_language,
  tshirt_size = EXCLUDED.tshirt_size,
  food_allergy_notes = EXCLUDED.food_allergy_notes,
  medical_accessibility_notes = EXCLUDED.medical_accessibility_notes,
  emergency_contact = EXCLUDED.emergency_contact,
  room_type_preference = EXCLUDED.room_type_preference,
  email = EXCLUDED.email,
  mobile_whatsapp = EXCLUDED.mobile_whatsapp,
  updated_at = now();

UPDATE teams
SET leader_member_id = '55555555-5555-4555-8555-555555555554'
WHERE delegation_id = '33333333-3333-4333-8333-333333333333';

INSERT INTO payments (delegation_id, fee_tier, currency, amount_due, payment_reference, invoice_count, invoice_split_note, bank_account_status, status)
VALUES (
  '33333333-3333-4333-8333-333333333333',
  'early_bird',
  'USD',
  2000.00,
  'THA-IOL2027-001',
  1,
  NULL,
  'pending_finance',
  'awaiting_proof'
)
ON CONFLICT (delegation_id, payment_reference) DO UPDATE SET
  fee_tier = EXCLUDED.fee_tier,
  currency = EXCLUDED.currency,
  amount_due = EXCLUDED.amount_due,
  invoice_count = EXCLUDED.invoice_count,
  invoice_split_note = EXCLUDED.invoice_split_note,
  bank_account_status = EXCLUDED.bank_account_status,
  status = EXCLUDED.status,
  updated_at = now();
