-- Whether a student must attach proof (a photo, file, link or note) to check
-- off each step of a bounty.
--
-- Apogee Cache Valley, 2026-10-01: "daily chores like cleaning up don't
-- necessarily need a picture every day." Off, a student ticks a step with no
-- upload; anything they do attach is still kept. Every bounty that exists
-- today asked for proof, so the default keeps that.

ALTER TABLE public.bounties ADD COLUMN IF NOT EXISTS requires_evidence boolean NOT NULL DEFAULT true;
