-- A delegation can have People, and Rooms and welfare, open before its proof of payment is in: for the account the IOL
-- committee reviews the site with (10 Nov 2026). Team and observers and the invoice keep their usual lock.
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS people_open_early boolean NOT NULL DEFAULT false;
