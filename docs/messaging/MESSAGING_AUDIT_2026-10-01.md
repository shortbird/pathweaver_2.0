# Messaging audit — 2026-10-01

**Status**: findings and a proposed plan. Nothing in the code or the database was
changed by this audit.

**Trigger**: iCreate's office manager, 2026-09-30: a phone notification for a message
she could not find on the web platform, the console or the phone, then "There is way
too much confusion going on with messaging overall. Communication needs to be simple
and clear and easy to use." This is the second such thread in a week
(2026-09-25: "Confusion on messages").

**Method**: four parallel full reads (backend send and identity rules, notification
fan-out, web surfaces, mobile surfaces) plus production queries on project
`vvfgxcykxjybtvpfzwyx`. Line numbers are from `868f2f4d`. Claims marked *(unverified)*
were read from code and not exercised live.

---

## 1. Headline

Each individual complaint has been fixed as it arrived. Four commits in six days
(`4e7c891d`, `a41014e3`, `c2347490`, `cae4864b`) each added one more rule about who a
message is from or where a thread is listed. The rules are individually correct and
collectively unpredictable: nobody at the school can say, before pressing Send, who
the message will be from, where the reply will land, or which of three screens will
show it.

Five structural causes produce nearly every ticket:

1. **The school is modelled as a fake person.** Every "iCreate" thread is a DM with a
   stub user, so the office can end up in a conversation with itself.
2. **Who a message is from is decided by facts about the recipient**, six of them,
   which the sender cannot see.
3. **One person has three inboxes that list different things** (web `/messages`,
   console `/inbox`, phone), and one mailbox, the school inbox, that exists on only
   one of them.
4. **One notification type carries six different events**, each with a hand-written
   link; several links open nothing.
5. **Class chats generate 85% of message notifications**, one bell row and one push
   per message, with no mute.

## 2. What exists

| | |
|---|---|
| Backend | ~12,600 lines: 8 route modules, 20 services, 5 repositories |
| Web | ~10,700 lines: `/messages`, `/inbox` (3 tabs), class Messages tab, parent viewer, bell, `/notifications`, announcements on `/school` and `/community` |
| Mobile | ~5,900 lines: Messages, Notifications, School feed. No school inbox, no Compose, no Sent |
| Tables | 17 (`message_conversations`, `direct_messages`, `group_*` x3, `message_sends` x2, `school_thread_*` x2, `announcements` x3, `notifications`, `notification_preferences`, `push_subscriptions`, `device_tokens`, `message_email_relays`, `message_reactions`) |
| Ways to start a message | 24 UI doors (web audit §4); 5 backend paths that send a DM to one person; 3 that create a group |
| Delivery channels | bell, Realtime, web push (5 types), Expo push (~33 types), email (announcement fan-out, reused by Compose), reply-by-email relay (superadmin only) |

Production, last 30 days:

| | |
|---|---|
| Direct messages | 738 (145 sent as a school) |
| Group messages | 647; 571 of them in class chats |
| Class chats | 389 of 409 groups. An iCreate parent is in 13 on average (max 64), a teacher in 21 (max 44) |
| Compose sends, all time | 28 (23 "separate", 5 "group"; 7 with email) |
| School-inbox threads | 92 across 6 orgs; iCreate 65 |
| `message_received` notifications | 7,641; 6,456 are class-chat messages |
| Per-user message notifications | iCreate coordinator 136, teacher 63, parent 26 (max 201) |
| Push reach | 127 users with an Expo token, 5 with web push |
| Preference rows | 31 in total. Almost nobody has changed a setting; the web has no settings screen |
| Thread grants (teacher answers as school) | 0 active |
| Reply-by-email relays | 5 tokens, 0 replies |

## 3. Root causes

### 3.1 The school is a user

`organizations.inbox_user_id` points at a stub `users` row (role `observer`, no org,
no login). A family's thread "with iCreate" is an ordinary `message_conversations`
row with that stub (`school_inbox_service.py:1-16`). That choice bought reuse of the
whole DM stack. It also means:

- An office member is both a reader of the stub's mailbox and a possible
  correspondent of it. Three rules now exist only to hide that: the conversations
  route drops the thread (`routes/direct_messages.py:262-269`), the contacts route
  drops the contact (`:186-193`), and `send_as_school` re-routes to a personal DM
  when the recipient is office (`school_inbox_service.py:201-203`).
- The hide rule is in the list route only. The unread count
  (`direct_message_service.py:951-981`) and the needs-reply count (`:917-949`) do
  not apply it, so the badge counts threads the list will not show.
- Nothing on the conversation row says "this is a school thread"; every reader joins
  to `organizations.inbox_user_id` to find out.
- `direct_messages.sent_by_user_id` has two meanings (author of a school message;
  the superadmin who forwarded a member's message), with two resolvers
  (`attach_sent_by_names`, `attach_sender_labels`).
- A screen hold on a school message names the stub as the author
  (`direct_message_service.py:543-547`).
- An admin in "view as teacher" stops being office, so the hidden thread and the
  school contact reappear *(unverified)*.

### 3.2 The sender is decided by the recipient

What decides "from the person" or "from the school" today:

| Input | Where |
|---|---|
| Which tab Compose was opened from (`as_school`) | `routes/sis/messaging.py:99-101` |
| Whether any recipient is a family or student | `message_compose_service.py:366` |
| Whether the send is a group or separate | same |
| Whether the caller is a teacher | `:367-369` |
| Whether a staff recipient is *also* a guardian (then they are "family") | `_universe`, `:282-298` |
| Whether the recipient reads this school's inbox | `school_inbox_service.py:201-203` |
| Whether the recipient is staff (adds "Kate for iCreate") | `:204-205` |

The Compose dialog shows a "From" line computed by a client copy of the rule
(`ComposeMessageModal.jsx:61-65`). It already disagrees with the server in one case:
it says "From: iCreate" for a recipient the server re-routes to a personal DM.

Consequences that are live today:

- An admin sends one "separate" Compose to two teachers. The teacher with no child at
  the school hears from the admin and replies to the admin. The teacher who has a
  child at the school hears from "Admin for iCreate" and their reply lands in the
  shared office inbox. iCreate has 8 staff who are also guardians (2 admins,
  3 coordinators, 3 teachers).
- A reply typed on the School tab into the school's thread with an office colleague
  is re-routed into a personal DM. It does not appear in the thread it was typed in
  *(unverified live; follows from `routes/school_inbox.py:163` + the re-route)*.
- The push says "New message from iCreate"; the bubble says "Becky Culliford for
  iCreate" (`direct_message_service.py:663` vs `messaging_extras_service.py:537`).
- On the console's My messages tab the subtitle says "parents and students always
  hear from iCreate" (`SchoolInboxPage.jsx:567`). A reply typed in that tab to a
  parent goes out as the person. A parent can therefore hold two threads with the
  same human: one named "iCreate", one named after her.

### 3.3 Three inboxes, three lists

| Thread kind | Web `/messages` | Console `/inbox` | Phone |
|---|---|---|---|
| Personal DMs | yes | My messages | yes |
| Groups and class chats I am in | yes, grouped by child | My messages, tagged Parents/Students, no child name | yes |
| School inbox (families to the school) | **no** | School tab (office only) | **no**: "not available in the mobile app yet" |
| School-owned group I am not a member of | no | School tab | no |
| Compose Sent log | no | Sent tab (office only) | no |
| Announcements | `/school` feed | `/community` board | School feed |

Badges disagree on purpose-built definitions:

- Web sidebar: unread **messages**, DMs plus groups (`routes/direct_messages.py:474-495`).
- Console sidebar: **threads** waiting on a reply, DMs only, both tabs summed
  (`InboxUnreadBadge.jsx:41-58`).
- Phone app icon: the bell count only.

The console page itself shows "N unread" (messages) beside tab chips that count
threads. The school inbox marks a thread read for the whole office when any one
person opens it. The console's thread pane is its own loop
(`SchoolInboxPage.jsx:826-872`), not `MessageThread`, so it has no reactions, reply,
edit or delete.

### 3.4 One notification type, many links

`message_received` is written for: a DM, a group message, a school-inbox DM (to the
office), a school-owned group message (to office non-members), a credit-review
reply, and feedback on work. Each call site builds its own link string. Results:

- `/communication?...` is still emitted by three services, the service worker and
  the push test route; the route was retired and survives as a redirect.
- Links that open nothing or the wrong thing (30-day counts where measured):
  `/billing` sent to parents (35; the family page is `/family/billing`), `/forms`
  sent to parents (17; a console path that now redirects to staff Tasks), `/sis` (4), `/credit-review`,
  `/parent-dashboard`, `/treehouse/facilitator`, an Expo Router path
  `/(app)/(tabs)/family?...` stored for web, and an absolute URL the phone cannot
  route.
- `?user=<id>` and `?group=<id>` links are silently ignored on web and phone when the
  id is not in the reader's own list. The reader lands on the list with no message.
- A held staff message notifies every office member with a link only a superadmin
  can open (`peer_text_screen_service.py:739-742`). The message itself was never
  stored, so there is nothing to find anywhere.
- One preference switch gates bell, Realtime and both pushes together
  (`notification_service.py:172-174`). Turning off "Messages" on the phone also
  turns off the office's alerts for the school inbox, on every surface. The switch
  exists on mobile only.
- `POST /api/notifications/broadcast` filters on the raw `users.role`
  (`notification_service.py:955-965`), which is `org_managed` for every org member:
  "students", "parents" and "advisors" reach nobody in an org. The web button that
  opens it checks `user.role` too, so org staff never see it.

### 3.5 Volume

A class has two chats (parents, students). Every message in either writes a bell row
and sends a push to every other member. 6,456 of 7,641 message notifications in 30
days are these; 1,897 are still unread. There is no per-chat mute, no collapsing of
several unread messages in one chat into one bell row, and no separate preference
for class chats.

### 3.6 Duplicates and dead paths

- Two composers: `message_compose_service.compose` and the older
  `sis_messaging_service.send`, whose `as_school` branches no route reaches.
- Two announcement fan-outs: `announcement_service.publish` and
  `notification_service.broadcast_notification` (the broken one above).
  `notify_announcement` has no caller.
- Two parent read-only viewers on two APIs: web uses `/api/parent/student/...`,
  mobile uses `/api/messages/children/...`. Three list routes on the first and
  `GET /api/messages/children` have no caller.
- Seven definitions of "parent of" across messaging (backend audit A10). Contacts
  can list a child that `can_message_user` then refuses *(unverified)*.
- The contacts endpoint has no `campus_coordinator` branch
  (`routes/direct_messages.py:786-1072`): a coordinator may message any member but
  cannot find a student to start with *(unverified live)*.
- People-page "Message" sends, School-tab replies and teacher Compose sends write no
  `message_sends` row, so the Sent tab is a partial record.
- `message_conversations.unread_count_p1/p2` is written in four places and
  overwritten on read: a dead cache.
- Notification types never written: `quest_started`, `observer_like`,
  `badge_earned`, `friendship_request`, `advisor_note`, `student_absent`,
  `attendance_reminder`.

## 4. Live problems found during the audit

These are not design debt. They are happening now.

**P1. Hearthwood Academy's school inbox is unread.** `sis_enabled` is false for
Hearthwood, so its admin never opens the console, but `_append_school_contact`
(`routes/direct_messages.py:177-195`) gives every member the "Hearthwood Academy"
contact regardless. `org_uses_school_inbox` guards only the forward-to-school path.
Since 2026-08-25: 13 threads, 19 messages from 9 parents and 4 students, all unread,
zero office opens, zero replies. The admin holds 19 unread bell rows that link to
`/inbox`, a console route. Questions include accreditation, duplicate student
profiles and diploma planning.

**P2. Badge with nothing behind it.** Six iCreate office staff hold 12 unread
messages in threads with their own school's inbox. The list hides those threads; the
unread count does not. The Messages badge on web and phone cannot be cleared.

**P3. Parents sent to a staff page.** 35 billing notices in 30 days went to parents
with link `/billing`.

**P4. Old school-to-office threads stay hidden.** `c2347490` fixed new sends. The 7
existing iCreate office threads (65 messages) remain visible only on the School tab,
under the reader's own name.

## 5. Proposed simplification

The aim is fewer rules, not more code. Core functions kept: families and students
can write to "the school" and anyone in the office can answer; staff message each
other; class chats; announcements; one Compose with read receipts; make-a-task.

### Phase 0 — repair (data and one-line gates)

1. Hearthwood: get the 19 messages in front of a person, then stop the contact from
   appearing for an org nobody reads an inbox for (gate `_append_school_contact` on
   `org_uses_school_inbox`) until Phase 2 gives those admins a reader.
2. Mark the 12 hidden unread messages read; apply the office filter to
   `get_unread_count` and `count_threads_needing_reply`.
3. Fix the dead links in §3.4; stop emitting `/communication`.

### Phase 1 — one sender rule

Replace the seven inputs with three sentences, enforced in `send_as_school` and
nowhere else:

- **The school voice is for families and students.** A person on staff always hears
  from a named colleague, including a staff member who is also a parent.
- **A reply stays in the thread it was typed in**, under that thread's voice.
- **The server names the sender before the send.** The audience endpoint returns
  "from" per recipient; the client stops computing it.

This deletes the family-over-staff precedence in `_universe`, the office re-route,
the staff `show_sender_name` branch for new threads, the client `senderFor`, and
the dead half of `sis_messaging_service`. Teachers keep the school contact for
questions to the office; those threads already show the author's name.

Move the 7 office self-threads into personal DMs between author and recipient (or
archive them) so the hide filters guard nothing live.

### Phase 2 — one inbox, on every surface

- "My messages" is the same list on web, console and phone, with the same labels
  (class name, child, meeting time) from one row component.
- The school inbox is a second mailbox that office staff see **wherever they read
  mail**: a section on web `/messages` and on the phone, not only a console tab. The
  web hooks already take a `source`; mobile needs the same parameter. This also
  gives Hearthwood-style orgs a reader without the console.
- One badge definition everywhere: unread threads. "Needs a reply" stays a console
  filter, not a second number.
- The console thread pane uses `MessageThread`.
- One thread-link helper for every notification, with a ratchet test that each link
  it can emit resolves on web, console and phone (the two path lists in
  `appSurface.js` and `deepLinkRouter.ts` already have a drift test to extend).
- A link to a thread the reader cannot open says so, instead of landing on the list.

### Phase 3 — quieter notifications

- One bell row per chat with a count, updated in place, instead of one per message.
- Per-chat mute.
- Split the preference: direct messages, class chats, school inbox (office).
  Add the settings screen to web.
- Give held-message alerts to office staff a destination they can open, or send
  them to the superadmin only.

### Phase 4 — delete

`sis_messaging_service` `as_school` branches and presets duplicate;
`broadcast_notification`, its route and `SendNotificationModal`;
`notify_announcement`; the unused parent list routes and one of the two parent
viewers; `unread_count_p1/p2` writes; the seven unused notification types. Route the
People-page message endpoints through Compose so every school send has a Sent row.

### Not proposed

Replacing the stub user with a real shared-mailbox table (threads with participant
rows, the shape groups already have) is the clean end state. It rewrites the DM
stack. Phases 0-2 remove the confusion without it; revisit only if the three
sentences in Phase 1 do not hold.

## 6. Decisions for the owner

1. **Office staff and parents.** Should an office member be able to hold a personal
   thread with a parent at all, or is office-to-family always the school thread?
   Always-school removes the two-threads-with-one-person case; teachers keep
   personal threads with their class families either way.
2. **Schools without the console.** Until Phase 2: hide the school contact (families
   message the admin by name), or keep it and deliver to the admin's own messages.
3. **Class-chat alerts.** Collapse to one bell row per chat by default, and should
   push stay per message?
4. **Teacher grants and reply-by-email.** Zero active grants and zero relay replies
   in production. Keep, or remove in Phase 4.

## 7. Where a merge would be wrong

- The bell and the Messages badge stay two indicators (decided 2026-09-17,
  `docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md` §7).
- A class keeps two chats: parents (adults only) and students.
- Announcements stay posts, not threads; an announcement that must also be a message
  should link to its Compose send rather than merge with it.
- `announcements` and `sis_announcements` both stay (receipt and post).

## 8. Not verified

- Realtime for the bell sends no `Authorization` header
  (`notification_service.py:134-137`); whether broadcasts succeed in production was
  not tested.
- Whether `www.optioeducation.com/messages` (relay and forward emails) reaches the
  app; shareable links should use `app.`.
- One Expo token serves the last account that registered it; a person with two
  accounts gets pushes for one and cannot tell which.
- `routes/school_inbox.py:132` requires the target's `organization_id` to equal the
  caller's; one iCreate guardian has a NULL org and may be unreachable from the
  School tab.
- `group_message_service.get_available_members` reads org users in one unpaged call.
- The four "no caller" endpoints in §3.6 (`GET /api/messages/children` and the three
  `/api/parent/student/<id>/{dm,group,tutor}-conversations` list routes) rest on
  targeted searches of `web/src` and `mobile/src`, not a full inventory of URL
  strings. A URL built from parts could escape a search. Check the access logs for
  each route before removing it in Phase 4.

## 9. Repairs made 2026-10-01 (after the audit)

Owner direction: leave Hearthwood (P1) alone; fix P2-P4. Decision 2 is answered:
a school without the console keeps its contact and its mail goes to the admin's own
messages. That is not built yet.

- **P2 and P4.** `backend/scripts/move_office_school_threads.py --apply` moved all 65
  messages out of the 7 iCreate office threads into personal threads: 44 notes now
  come from the colleague who wrote them, 21 replies went to the colleague being
  answered. Read state was kept, so the 12 unread notes are unread in threads their
  readers can open. The 7 empty threads were deleted and the matching bell rows
  re-pointed. Backup of every original value:
  `tmp/office_thread_move_backup_20261001T160515.json` (gitignored). A second run
  finds nothing.
- **The last way in is closed.** `send_as_school` now refuses an office member
  writing to themselves as the school, so no code path can put a message in that
  thread again. The unread counts were deliberately left without a filter: with nothing to
  hide, a filter would cost every user a lookup on the busiest messaging endpoint.
- **P3.** The invoice-change notice links `/family/billing`; the 71 stored rows
  were updated.

Still open from §3.4: the other dead links (`/sis`, `/credit-review`,
`/parent-dashboard`, `/treehouse/facilitator`, the Expo path, the absolute waitlist
URL, `/forms` for parents) and the retired `/communication` path.

## 10. Decisions and the build that followed (2026-10-01)

The owner answered §6:

1. Office to family is always the school thread.
2. A school without the console delivers to the admin's own messages. Not built;
   Hearthwood was set aside.
3. Class chats: one bell row per chat with a count, one phone alert per chat until
   it is opened, and a mute switch per chat.
4. Remove teacher thread grants and reply by email.

What was built from those answers, and where the rule lives:

**One sender rule** (`message_compose_service.voice_for`,
`school_inbox_service.send_as_school`). A family or student hears from the school.
Somebody on staff hears from the colleague who wrote, by name, including a teacher
who is also a parent. One exception, about the thread and not the person: a reply
typed into the school's existing thread with a teacher stays there, signed. The
Compose dialog's From line reads `voice` from the server per person and can say
"iCreate and you" for a mixed send. Gone: family-over-staff precedence, `_room_kinds`,
the client's own copy of the rule, and the unreachable "as the school" half of
`sis_messaging_service`.

**One thread between the office and a family**
(`school_inbox_service.office_family_route`). A personal message between current
office staff and a family or student of the same console school is school mail in
both directions: the office member's goes out as the school with their name
recorded; the family's goes to the school inbox. Not within one family (an office
member writing to their own child or the child's other parent), not for archived
staff, not for teachers, not for a school without the console. The contact list
follows the same rule (`school_mail_contact_ids`), and the console sends the
office to the school tab after such a send. The 11 existing personal threads with
messages (42 messages, iCreate and Horizon) were merged into the school's threads.

**Quieter class chats** (`group_message_service._deliver_group_notifications`,
`notification_repository`). One unread bell row per member per chat, rewritten in
place with a count; a push only when a new row is made. Mute is a
`notification_preferences` row keyed `chat_muted:<group_id>`, so no schema change;
`POST /api/groups/<id>/mute`, a toggle in the chat header on web and mobile. 1,652
old per-message bell rows were folded into 326 counted rows.

**Removed.** Teacher thread grants: every school-inbox route is `ADMIN_ROLES`, "Make
a task" assigns within the front office. Reply by email: the relay service, its
route and the two client actions; the inbound webhook stays for Meet notes. Both
tables (`school_thread_grants`, `message_email_relays`) are still in the database.

**After the release**, run `backend/scripts/move_office_school_threads.py --apply`
once more. Production ran the old code between the repair and the deploy, so a few
new personal threads and per-message bell rows will exist. The script is idempotent.

Still open: the mobile app cannot show the school inbox (§3.3), which this build
makes more visible, because a family's message to an office member now always
lands there. Also open: the dead links and `/communication` (§3.4), one badge
definition (§3.3), notification settings on the web, and decision 2.
