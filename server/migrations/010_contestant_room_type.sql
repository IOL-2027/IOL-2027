-- The contestants' room preference, chosen in Team and observers. The portal has sent it since the step was built,
-- but the column was never created, so saving the step failed (found 30 Oct 2026).
ALTER TABLE delegations ADD COLUMN IF NOT EXISTS contestant_room_type text;
