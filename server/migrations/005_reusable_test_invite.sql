-- A test invitation code that works again and again, so the sign-up can be walked through repeatedly.
-- Only a test server (EXPOSE_DEV_CODES=true) honours it; each use replaces the account made with it last time.
ALTER TABLE invite_codes ADD COLUMN IF NOT EXISTS reusable boolean NOT NULL DEFAULT false;
