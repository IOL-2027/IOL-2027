-- Fees from POSN's signed fee table (30 Oct 2026). Each invitation code, and the delegation made with it, has a fee
-- category: previous IOL hosts get the discounted team fees, a country that is not accredited registers one team.
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS fee_category text NOT NULL DEFAULT 'accredited'
  CHECK (fee_category IN ('previous_host', 'accredited', 'non_accredited'));
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS fee_category text NOT NULL DEFAULT 'accredited'
  CHECK (fee_category IN ('previous_host', 'accredited', 'non_accredited'));

-- Codes made before this get the category from the country, as new codes do (fees.js defaultFeeCategory).
UPDATE invite_codes SET fee_category = 'previous_host'
WHERE lower(trim(regexp_replace(country_territory, '\(test\)', '', 'i'))) IN (
  'bulgaria', 'russia', 'russian federation', 'netherlands', 'the netherlands', 'estonia', 'poland', 'sweden',
  'united states of america', 'united states', 'usa', 'slovenia', 'united kingdom', 'uk', 'china', 'india', 'ireland',
  'czechia', 'czech republic', 'republic of korea', 'south korea', 'korea', 'latvia', 'isle of man', 'brazil', 'taiwan', 'romania'
);
UPDATE delegations d SET fee_category = i.fee_category FROM invite_codes i WHERE i.id = d.invite_code_id;

-- Single rooms, chosen in Team and observers for each Team Leader and observer before anyone is named:
-- { "teamLeaders": [true, false], "observers": [false] }. Each is a USD 400 supplement.
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS single_rooms jsonb NOT NULL DEFAULT '{"teamLeaders": [], "observers": []}'::jsonb;

-- An invoice split into several, each with its own payer and amount; the amounts add up to amount_due.
-- [{ "recipientName", "recipientAddress", "recipientTin", "amount" }]. NULL for a single invoice.
ALTER TABLE payments ADD COLUMN IF NOT EXISTS invoice_splits jsonb;
