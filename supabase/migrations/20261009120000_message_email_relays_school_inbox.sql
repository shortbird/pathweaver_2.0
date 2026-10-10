-- School inbox email alerts: reply to the email, and the reply goes out as the
-- school.
--
-- Optio Academy's inbox has no org admin and no campus coordinator, so every
-- family message there rang nobody's bell (Tanner, 2026-10-09: "I'm not
-- getting alerted when a message is sent to the Optio Academy inbox"). A
-- reader of a school inbox can now ask to be emailed every message it gets,
-- and the email's Reply-To is a relay like the "Email this to me" one.
--
-- The difference is who the reply speaks as. A personal relay posts as its
-- owner; a school relay posts as the school, with the owner recorded as the
-- staff member who wrote it, exactly as a reply typed in the console. So a
-- relay now names the school it speaks for, NULL for a personal one.
--
-- The (owner, recipient) key becomes (owner, recipient, school): the same
-- superadmin can hold a personal relay to a parent and a school relay to the
-- same parent, and a reply to either must land in its own thread. NULLS NOT
-- DISTINCT keeps the old rule for personal relays, which all have NULL here.

ALTER TABLE public.message_email_relays
    ADD COLUMN IF NOT EXISTS organization_id uuid
        REFERENCES public.organizations(id) ON DELETE CASCADE;

ALTER TABLE public.message_email_relays
    DROP CONSTRAINT IF EXISTS message_email_relays_owner_recipient_key;

ALTER TABLE public.message_email_relays
    ADD CONSTRAINT message_email_relays_owner_recipient_org_key
        UNIQUE NULLS NOT DISTINCT (owner_id, recipient_id, organization_id);

COMMENT ON COLUMN public.message_email_relays.organization_id IS
  'Set for a school inbox relay: a reply is sent as this school, signed by owner_id. NULL for a personal "Email this to me" relay, which replies as owner_id.';
