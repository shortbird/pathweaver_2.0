# iCreate requests v2 — what is done, and what needs you

Branch `icreate/requests-v2`, worktree `~/pathweaver-icreate`. 14 commits, nothing
on `main` or `develop`. Backend 6089 pass, web 3222 pass, mobile 945 pass,
pyflakes clean, mobile tsc clean.

Plan: `~/.claude/plans/we-re-going-to-edit-delightful-crane.md`.

---

## Do this first (15 minutes)

```bash
cd ~/pathweaver-icreate
source ~/pathweaver_2.0/venv/bin/activate && python backend/app.py    # :5001
cd web && npm install && npm run dev                                  # :3000
```

`npm install` is needed once — the worktree has no `node_modules` of its own.

Then walk these, as an iCreate org_admin at `http://localhost:3000/?app=sis`:

1. **Messaging → New message** on the My messages tab. Tick "All teachers",
   write something, send. You should get one group thread. Do it again with
   "Send separately" ticked — you should get one private thread per person.
2. **Messaging** now has three tabs: the school inbox, your own messages,
   announcements. Confirm your own threads appear on the middle one.
3. **Sidebar** — the Messaging item should show an unread count when something
   is waiting.
4. **People → a family → Message.** Reply as that parent from the learning app.
   The reply must land in Messaging → the school tab. *(This is the live bug; it
   needs the migration below to be fully fixed for existing threads.)*
5. **A class → Quests → a task.** Add a link and upload a file. Open the quest
   as a student — the file should be inside that task, not in a separate list.

And at `http://localhost:3000` as an iCreate parent:

6. **/school** should now show your children's classes, each opening to its own
   handouts. Same on `/parent/dashboard/<child>`.
7. **/parent/dashboard/<child>** should show an Attendance card once a teacher
   has taken a roll.
8. Open a child's quest → **"Work on this as <name>"** should hand you into
   their workspace with the banner up.

---

## Then: the two migrations

I could not run these. There is no Docker, psql or Supabase CLI on this machine,
so **the SQL has never been executed anywhere.** Read it before you apply it.

```
supabase/migrations/20260910190000_merge_org_messaging_sender_into_school_inbox.sql
supabase/migrations/20260910200000_group_conversations_staff_audience.sql
supabase/migrations/20260910210000_quest_resources.sql
```

- The **staff audience** and **quest_resources** ones are small and additive.
- The **merge** one is the important one and the only one with any risk. It
  folds the second school account and its threads into `organizations.
  inbox_user_id`. Verification queries are in the file — run them after, and
  capture `SELECT count(*) FROM direct_messages` before and after; it must not
  change.

Apply order does not matter. Run them on a throwaway local stack first if you
can get one up.

---

## Decisions I left for you

1. **The old composer is gone** (you asked for this on 2026-09-10). With it
   went four things: sending to particular classes, teachers or an age band; the
   nudge that re-notified whoever had not read a send; saved announcement
   templates; and the staff read-receipt view. Board posts are the record now.
   `GET /api/announcements` is kept and now has no caller, so a "what we have
   sent" panel could be re-added cheaply if the office misses it.

2. **`curriculum_materials.py` has no role gate.** A teacher of any class on a
   curriculum can flip `visible_to_students` on materials every section sharing
   it inherits. Fine at iCreate today. Written up in
   `docs/sis/ROLE_CAPABILITIES.md`.

3. **`StudentClassMaterials.jsx` is no longer mounted** — the new class hub
   replaced it. Left in the tree; one line to put back if the hub is wrong.

4. **Nine of the ten open PARENT-side reads** in `test_one_definition_of_parent.py`
   are legitimate writers. Four are access checks still to sweep
   (portfolio_service, bounty_service, sis/goals.py, family_student_service).
   The ratchet stops it growing; lowering it is follow-up work.

---

## What is in each commit

| Commit | What |
|---|---|
| `42afeb81` | Notification sweep filtered the wrong column name — never ran. Coordinators locked out of group chats. |
| `ec69cf0d` | Seven route files imported a tier under another tier's name; `billing.py` read as teacher-accessible. |
| `544de655` | **Live bug.** Two school accounts; parent replies to family messages went where nobody reads. |
| `516dca33` | One definition of "parent". Household guardians were refused their own child's dashboard. |
| `273d48cd` | Message a group of teachers, or each privately (backend). |
| `f5b27822` | Personal inbox for admins, the compose UI, sidebar unread badge. |
| `b8084ce7` | Announcements expire at end of school year; one notify checkbox; family home reads the board. |
| `7eaad3f6` | Parent attendance view; web parents can finish a task via act-as. |
| `e70691d1` | `quest_resources` table, service, routes; stopped the training editor churning task ids. |
| `5a9f62c8` | Resources shown to students and parents; teacher's attach panel; mobile. |
| `0987f74a` | A parent's children's classes in one place, handouts inside each class. |
| `06064ae2` | `docs/sis/ROLE_CAPABILITIES.md` + a guard that fails when it drifts from the code. |

---

## Not done from the plan

- **N3**: mobile announcement dedupe by `source_announcement_id`.
- **P5 mobile**: no mobile class-materials screen exists; unchanged.
- **R3 nav flags**: `hrOnly` / `superadmin` / `hideInPreview` in `SisSidebar` are
  unused but working extension points, not dead code. Left alone. The plan's
  "add Secure Documents to the nav" was based on a wrong reading — it is already
  reachable as a Task Center tab, deliberately.
