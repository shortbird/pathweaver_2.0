-- School inbox: every org gets a "{School Name}" messaging contact that all of
-- its members can DM. The school side is a dedicated account (a platform user
-- that never logs in, same stub-auth pattern as dependents), so the whole DM
-- stack — threads, attachments, reactions, realtime, parent read-only viewers —
-- works unchanged. Admins and campus coordinators read and reply to those
-- threads as the school from a shared inbox in the SIS console.

-- The school account backing an org's inbox. NULL until the first member loads
-- their contacts (created lazily by school_inbox_service.get_or_create_inbox_user).
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS inbox_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- Replies sent "as the school" record which staff member actually wrote them.
-- NULL for every normal DM. Shown only in the staff inbox, never to members.
ALTER TABLE direct_messages
  ADD COLUMN IF NOT EXISTS sent_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL;

-- The staff inbox resolves "which org does this school account belong to"
-- on every permission check and conversation-list build.
CREATE INDEX IF NOT EXISTS idx_organizations_inbox_user_id
  ON organizations (inbox_user_id) WHERE inbox_user_id IS NOT NULL;

COMMENT ON COLUMN organizations.inbox_user_id IS
  'users.id of the school-inbox account members DM as "{org name}". Lazily created; the account is a platform user (organization_id NULL) that cannot log in.';
COMMENT ON COLUMN direct_messages.sent_by_user_id IS
  'When the sender is a school-inbox account: the staff member who actually wrote the message. Staff-inbox display only.';
