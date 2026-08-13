-- Challenge level preference for AI task generation.
-- NULL means Standard; the wizard pre-selects this value and updates it
-- whenever the student generates tasks at a different level.
ALTER TABLE users
  ADD COLUMN preferred_challenge_level text
  CHECK (preferred_challenge_level IN ('easier', 'standard', 'challenge'));
