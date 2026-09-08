-- Email relays for Optio messages: "Send to Gmail", and reply-by-email back in.
--
-- The problem this solves (Tanner, 2026-09-08): a message that arrives in the
-- Optio Support inbox has no home in the place he actually triages work, which
-- is his Gmail. It gets read on a phone, mentally filed, and lost. Anything
-- that needs a real answer later needs to sit in an inbox that nags.
--
-- So a superadmin can push one message out to their own mailbox, and the
-- Reply-To on that mail is a relay address that carries a reply back into the
-- Optio thread. The member never sees an email address and never leaves Optio.
--
-- One row per (owner, recipient) pair, NOT per message. The reply address for a
-- given person is therefore stable: every email Tanner sends himself from Jane's
-- thread carries the same Reply-To, so replying to last week's copy still lands
-- in today's thread. Re-sending refreshes expires_at.
--
-- The token is the whole secret. It is 32 random url-safe bytes, it is the only
-- thing in the address, and the inbound handler additionally requires the
-- envelope sender to match owner_email — so knowing a token is not by itself
-- enough to write into somebody's thread as a superadmin.

CREATE TABLE IF NOT EXISTS public.message_email_relays (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    token             text NOT NULL UNIQUE,
    -- The superadmin who owns the relay. A reply is posted to Optio AS them.
    owner_id          uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    -- The mailbox allowed to reply. Snapshotted at mint time so that changing
    -- the account email does not silently keep an old mailbox authorized.
    owner_email       text NOT NULL,
    -- Where a reply is delivered: the other side of the Optio conversation.
    recipient_id      uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    conversation_id   uuid,
    -- The message that was emailed most recently. Context only.
    source_message_id uuid,
    created_at        timestamptz NOT NULL DEFAULT now(),
    last_sent_at      timestamptz NOT NULL DEFAULT now(),
    -- A relay is a standing write capability into someone's inbox, so it dies
    -- on its own. Every send pushes this out again; an untouched relay expires.
    expires_at        timestamptz NOT NULL DEFAULT (now() + interval '180 days'),
    revoked           boolean NOT NULL DEFAULT false,
    reply_count       integer NOT NULL DEFAULT 0,
    last_reply_at     timestamptz,
    CONSTRAINT message_email_relays_owner_recipient_key UNIQUE (owner_id, recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_message_email_relays_owner
    ON public.message_email_relays (owner_id);

-- Deny-all RLS. Nothing outside the backend service role ever reads this table:
-- a leaked token is a write capability into a superadmin's messages.
ALTER TABLE public.message_email_relays ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.message_email_relays FROM anon, authenticated;

COMMENT ON TABLE public.message_email_relays IS
  'Per (superadmin, recipient) email relay. The token is the local part of the Reply-To address on a "Send to Gmail" copy of an Optio message; an inbound reply to it is posted back into the Optio thread. Service-role only.';
COMMENT ON COLUMN public.message_email_relays.owner_email IS
  'The mailbox authorized to reply, snapshotted when the relay was minted. The inbound handler requires the envelope sender to match this, so the token alone is not sufficient.';
