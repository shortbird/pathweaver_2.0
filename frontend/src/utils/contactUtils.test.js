import { describe, it, expect } from 'vitest'
import { normalizeContact, mergeContacts, contactToConversation } from './contactUtils'

/**
 * The school label on Optio Support's inbox has to survive normalization.
 *
 * Conversation rows are not the API's conversations: they go through
 * normalizeContact -> mergeContacts -> contactToConversation, and that pipeline
 * rebuilds other_user from a whitelist. A field the backend adds is invisible
 * to every row and chat header until it is carried through all three, which is
 * exactly how the first version of this shipped labeled data that never showed.
 */
describe('organization label survives the contact pipeline', () => {
  const conversation = {
    id: 'convo-1',
    last_message_at: '2026-09-01T18:00:00Z',
    other_user: {
      id: 'stu-1',
      first_name: 'Student',
      last_name: 'Chorak',
      role: 'org_managed',
      organization_name: 'OnFire Learning'
    }
  }

  it('reads the label off a conversation', () => {
    expect(normalizeContact(conversation, 'conversation').organizationName)
      .toBe('OnFire Learning')
  })

  it('reads the label off a flat contact', () => {
    const contact = { id: 'stu-1', first_name: 'Student', organization_name: 'iCreate' }
    expect(normalizeContact(contact, 'advisor_contact').organizationName).toBe('iCreate')
  })

  it('is null for a platform user in no organization', () => {
    const contact = { id: 'solo-1', first_name: 'Solo' }
    expect(normalizeContact(contact, 'advisor_contact').organizationName).toBeNull()
  })

  it('keeps the label when the same person arrives from two sources', () => {
    // The contacts list has no label for this person, the conversation does.
    const merged = mergeContacts({
      advisorContacts: [{ id: 'stu-1', first_name: 'Student', relationship: 'student' }],
      conversations: [conversation]
    })
    expect(merged).toHaveLength(1)
    expect(merged[0].organizationName).toBe('OnFire Learning')
  })

  it('puts it back on other_user, where the row and the header read it', () => {
    const [contact] = mergeContacts({ conversations: [conversation] })
    expect(contactToConversation(contact).other_user.organization_name)
      .toBe('OnFire Learning')
  })
})

/**
 * The conversation ROW id has to survive the same pipeline, for a different
 * reason: `id` on the way out is the other person's user id (what the message
 * queries and the send endpoint are keyed on), but Supabase Realtime broadcasts
 * on `dm:{conversation_id}`. Losing the row id here is what left the web app
 * subscribed to a topic nothing publishes to.
 */
describe('conversation row id survives the contact pipeline', () => {
  const conversation = {
    id: 'convo-9',
    last_message_at: '2026-09-01T18:00:00Z',
    other_user: { id: 'usr-1', first_name: 'Sydney', last_name: 'Olson' }
  }
  const directoryContact = {
    id: 'usr-1', first_name: 'Sydney', last_name: 'Olson', relationship: 'parent'
  }

  it('takes it off the conversation, not off the person', () => {
    const c = normalizeContact(conversation, 'conversation')
    expect(c.id).toBe('usr-1')
    expect(c.conversationId).toBe('convo-9')
  })

  it('is null for a contact with no thread yet', () => {
    expect(normalizeContact(directoryContact, 'advisor_contact').conversationId).toBeNull()
  })

  it('a directory contact picks it up when the conversation merges in', () => {
    const [merged] = mergeContacts({
      advisorContacts: [directoryContact],
      conversations: [conversation]
    })
    expect(merged.conversationId).toBe('convo-9')
  })

  it('comes out alongside the user id, not instead of it', () => {
    const convo = contactToConversation(normalizeContact(conversation, 'conversation'))
    expect(convo.id).toBe('usr-1')
    expect(convo.conversation_id).toBe('convo-9')
  })
})
