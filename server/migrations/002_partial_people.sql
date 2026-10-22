-- Team Leaders fill in people in stages, so a person can be saved with only a display name.
-- Completeness is checked when the registration is submitted (missingForSubmission in index.js).
ALTER TABLE members ALTER COLUMN official_name DROP NOT NULL;
