-- iCreate registration OTP: per-registration failed-attempt counter.
--
-- The 6-digit email OTP is well-built (sha256-hashed at rest, 10-min TTL,
-- constant-time compared) but had no per-registration attempt cap: the only
-- wall against guessing the 1,000,000-value space within the TTL was the
-- IP-keyed rate limit, which is defeatable by rotating X-Forwarded-For. This
-- counter lets verify_code lock a specific registration after a handful of
-- wrong guesses, independent of source IP. Reset to 0 whenever a fresh code is
-- issued (_issue_otp / resend).
ALTER TABLE public.icreate_registrations
    ADD COLUMN IF NOT EXISTS otp_attempts integer NOT NULL DEFAULT 0;
