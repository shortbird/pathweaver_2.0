---
name: email
description: Find one email in Tanner's Gmail inbox by sender or subject and deal with it end to end - read the thread, work out who wrote it and what they need, then answer from the Optio code and data, fix the bug it reports, or schedule the meeting, and leave a reply draft in Gmail. Use for "/email <sender or subject>", "handle the email from X", "deal with the X email", "answer X's email".
---

# Handle one email

The argument is a fragment of a sender or a subject: `/email nnhi`,
`/email Marika`, `/email invoice question`. The job is to find that email,
understand it, do whatever it actually asks for, and leave Tanner a reply
draft he can send. **Never send.** Drafts only, every time.

Gmail is the `claude.ai Gmail` connector: `mcp__claude_ai_Gmail__*`, loaded
through ToolSearch (`select:mcp__claude_ai_Gmail__search_threads,...`). If the
tools are absent from the session, the headless fallback is in the memory
file `gmail-access-recipe.md`.

## 1. Find the email

Search the inbox first, newest first, and widen only if that finds nothing:

1. `in:inbox (from:<arg> OR subject:(<arg>))`
2. `in:inbox <arg>` (body text, display names)
3. `(from:<arg> OR subject:(<arg>)) newer_than:60d` (archived mail too)

Pick the thread like this:

- One match: use it.
- Several matches from one person: take the newest thread whose **last
  message is not from Tanner** (that is the one waiting on him). Mention the
  others in one line at the end.
- Several people or several live threads and no clear winner: list them
  (sender, subject, date, one-line snippet) and ask with AskUserQuestion.
  Do not guess between two real conversations.
- Nothing: say what queries ran and stop.

Then read the whole thread with `get_thread` (`messageFormat: PLAIN_TEXT`).
Read every message, not only the last one; the ask is often in an earlier
message and the last one says "any update?". Attachments: `get_message` with
`messageFormat: RAW`, then decode as `gmail-access-recipe.md` describes.
Screenshots matter; look at them.

Check `in:draft` and `in:sent` for the same thread. If Tanner already replied
after the last inbound message, or a draft already exists, say so and ask
before doing anything else.

## 2. Know the sender

Before deciding anything, find out who this is:

- **Optio account**: look the address up on production
  (`vvfgxcykxjybtvpfzwyx`) - `users` (role, org_role, organization_id),
  `organizations` (name, `feature_flags.sis_enabled`), and for a parent
  their children through `household_members` and `parent_student_links`.
  Check the schema first if a column name is in doubt.
- **Memory**: grep the memory directory for the person's name, email and org.
  There is often a file on exactly this customer (Marika, Jackie, Katie,
  Michelle, Raleigh ...) with context and a reader level for the reply.
- **Ticket history**: `bug_reports` where `user_email` matches or the org
  matches. A repeat complaint about something already `fixed` or `resolved`
  is a regression or an undeployed fix; say which.
- **CRM**: if not a user, they may be a lead. Check the CRM tables before
  treating them as a stranger.

Whether the org runs the SIS console or the web platform decides which code
is relevant (memory: `org-surface-sis-vs-web.md`). Get this right before
reading code; fixing the wrong surface ships nothing.

## 3. Decide what it needs

Name the kind of email in one line to yourself, then follow the matching
path. One email can need more than one.

| Kind | What "address it" means |
|---|---|
| **Question about how Optio works** | Answer from the code and their real data, not from memory. Find the page, the click path, the rule. Check a `/docs` Help Center article exists (`docs_articles`); link it if so. |
| **Something is broken** | Reproduce from their data, find the root cause, fix it (section 4). File a `bug_reports` row (`source = 'hq'`) so the release mails them when it is live, following the `tickets` skill. |
| **Feature or change request** | Small and clearly wanted: build it (section 4). Large, or a product decision: write a short plan and ask Tanner before building. |
| **Data fix** (wrong charge, missing child, wrong enrollment) | Find the cause in code first, then the data. Any write to production data: show the exact statement and ask before running it. |
| **Scheduling** | Read Google Calendar, propose two or three real open times in the draft. Do not create or accept events without asking. |
| **Billing / money** | Look at the Stripe and SIS invoice data. Never refund, charge or change a plan without asking. |
| **Partner, sales, legal** | Pull the context (memory, CRM, prior threads), draft a reply, flag anything that commits Optio to terms. |
| **No action needed** (FYI, newsletter, receipt, thanks) | Say so in one line. Offer to archive. Do not draft. |

When the email holds several questions, answer every one. A reply that
answers two of three gets a second email asking about the third.

## 4. When it needs code

This is a normal coding session under the repository's rules. Follow the
skill that fits: `debug-production` for a live error, `ship-feature` for new
behaviour, `tickets` for the bookkeeping. The rules that bite here:

- Verify locally. Restart backend :5001 and web :3000 (mobile :8081 if
  touched) and give Tanner the exact localhost steps, logged in as which
  user, to see the fix. His confirmation is the only verification.
- Commit only your own files, by name. Do not push. Pushing to `main` is his
  call.
- A migration goes through the documented path, never casually.
- If the fix is bigger than one sitting, stop after the diagnosis: root
  cause, plan, rough size, and ask.

## 5. Draft the reply

Create the draft as a reply in the thread: `create_draft` with
`replyToMessageId` set to the last inbound message id, `to` the sender, and
`cc` whoever was on the thread unless that is clearly wrong. To change a
draft later, create a fresh one and delete the old one; `update_draft`
detaches a reply from its thread.

Write it in Tanner's email style (memory: `email-drafting-style.md` and
`prose-style-no-ai-tells.md`). The short version:

- `htmlBody` with `<p>` paragraphs and `<strong>` headers, plus an unwrapped
  plain `body`. Never hard-wrap. Never `*asterisks*`.
- First person singular. No em dashes. No question at the end.
- The plainest words the reader knows. Most customers do not know "SIS",
  "org", "module" or "console"; Marika does. Check the memory for the reader.
- Say what changed and the click path to see it, in order.
- No "not X, but Y" constructions.

**Timing.** If the answer depends on a fix that is not live yet, the draft
says what will be true once it ships, and you tell Tanner the draft waits on
the deploy. Do not let him send "this is fixed" while it is on local main.
If the ticket is filed with `notify_reporter = true`, the release mails the
reporter anyway; decide whether a personal draft is still worth it (usually
yes for a customer who wrote to him directly) and say which.

## 6. Report back

End with a short summary for Tanner:

- Which email (sender, subject, date) and what they asked, in one or two lines.
- What you found and did: answer, root cause, commit SHA, ticket id, data
  change.
- The draft: its Gmail link, and whether it can go now or waits on a deploy.
- Anything left for him: a decision, a localhost check, a push.

If the work is worth remembering for a later session (a customer decision,
an undeployed fix with a draft waiting), save a memory file for it.
