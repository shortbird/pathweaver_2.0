# iCreate — draft replies (nothing sent)

Drafted 2026-08-22. **Nothing here has been sent or posted.** The nudges are for Tanner to
send; the ticket notes are for Perch, once each fix is verified in production.

Plan and reasoning: [PERCH_SWEEP_2026-08-22.md](PERCH_SWEEP_2026-08-22.md).
Yesterday's batch: [PERCH_CLIENT_REPLIES_2026-08-21.md](PERCH_CLIENT_REPLIES_2026-08-21.md).

---

## 1. The urgent one — `09255e75`, the in/out button

Molly has not answered the three questions from 19 August, and the date she named was the
**24th**. Send this today or the date goes.

```
Hi Molly,

Chasing the three questions on the in/out button, because the 24th is close and I do not
want to build the wrong thing in a hurry.

If it is easier, say nothing and I will build it the way I proposed: "in" means back from
being out rather than arrived at school, the signed waiver is what grants a student the
button with the office able to override either way, and it runs on a tablet at the door so
students need nothing set up beforehand. Those are the safe versions of all three.

The only one I would rather hear from you on is the second. If a student having the button
should be purely the office ticking a box, rather than tied to the waiver, tell me and I
will do that instead.

Tanner
```

---

## 2. The three still waiting

Same three as 19 August, all still blocked. One short note rather than three:

```
Hi Molly,

Three things are sitting waiting on an answer from you rather than on us. No rush on any
of them, but they will not move until you say.

Teacher pay from attendance: I need to know how your teachers are actually paid before any
number is trustworthy - an hourly rate, a flat amount per class, or per session. None of
your six staff records has a rate on it, and the system can only hold hourly today.

Monthly payments: your settings carry a 6% convenience fee and a 10-instalment plan. I need
to know whether that 6% IS the monthly uplift, whether it applies to tuition that is not
block-priced, and what should happen if a family switches after an invoice has gone out.

Refunds: you asked how to note one. Right now you cannot, on purpose - a payment's amount
cannot be edited, so the history stays honest. Doing it properly means a refund is its own
reversing entry rather than a correction. Tell me whether you want that built, or whether
recording it by hand is fine for now.

Tanner
```

---

## 3. Ticket notes — shipped this batch

Post after Tanner has confirmed each in production. Deploy is a merge to `main` plus a
green `Release (main)`.

| Ticket | Note |
|---|---|
| `dbfe0f0f` | Getting into one section of a class now takes the student off the waitlists for the other sections of it. One thing to know, because your two-day classes are separate sections: a child enrolled in Choir (Tuesday) can still join the waitlist for Choir (Thursday). If you would rather that were also blocked, say so and I will change it. |
| `0df0e616` | Onboarding templates can be duplicated, and the items inside one can be moved up and down. |
| `4d47fa32` | Same as above — Duplicate is on each template, and each item has up and down arrows. |
| `d3b86332` | Each item on a template now has its own Duplicate button. |
| `7f040de5` | Templates have a Directions box. What you write there shows at the top of the checklist, above the items, for whoever it is assigned to. |
| `f4e1589d` | Each template has a **Sync assigned** button. It updates the checklists people are already holding: new items appear, wording is corrected, and anything anybody has already done — ticked, uploaded, signed — is never touched. Finished checklists are left alone, and it tells you how many of each it changed. |
| `b9583855` | An item holds several documents now. Uploading a second one says "Add another document" instead of offering to replace the first, so Ruth can put her ID and her birth certificate on the same item. |
| `87093f6b` | Two things were wrong. The banner was showing whichever checklist was most recently assigned to that person, including a family one, which is why it said ALD Ordering Form on a teacher portal. And it linked to a page that does not follow preview, which is why you landed on your own tasks. Both fixed. |
| `417e98bf` | This was the same fault. Ana has two checklists because she is both a parent and a teacher: her employee onboarding lives in the staff portal, her family one in the family portal. The banner was picking the wrong one. Template updates are the Sync button above. |
| `9d7f9a98` | The payments report and the recorded revenue are closed to campus coordinators. Also closed: the class report used to include tuition and supply fee columns, ticked by default, which was the same leak one screen over. |
| `87d32ab1` | Everybody shows on the tuition page now whether or not their CLP is finished. The ones that are not finished carry an amber badge, and there is a filter if you want to see only one group. |
| `d406dd7a` | The billing page sorts by family — on Charges and on Outstanding both. |
| `7e6b0be9` | New **Day rosters** report. Each day, each block, every class in it with its room and who should be in it, and a Print button per day so you get one sheet per day rather than a booklet. |
| `d63154c7` | Messaging can be aimed at particular classes now, and it can email as well as post in-app — see the next one. |
| `2e930120` | You can pick several classes at once, several teachers, and an age range. Everything you pick has to be true together, so an age range on top of a class means only the children in that class who are that age. Families are reached through their children. |
| `857b5f70` | You were right that everything emailed. Email is a tick box now, off by default on the Messaging page — everyone still gets it in the app and as a push. The community board already worked this way, so the two now behave the same. |
| `16b736f3` | You can build your own forms: Task Center → Forms & checklists → New form. Give it a name, add questions of whatever kind (paragraph, choice, date, tick box, or a picker for a student or a class), and say who it goes to. The built-in ones still work. |
| `b0d6324a` | This is what that was really about, I think: doing the paperwork was already one list, but SETTING IT UP was two screens. Forms and checklists are built on the same tab now. They are still stored separately underneath, because a checklist can take signatures and a form cannot. |
| `b0818709` | Item 4, the document that was too long: fixed properly. The limit was raised to 120,000 characters a few days ago, but this screen had its own older limit of 20,000 that nobody had updated — so the AI read your whole handbook and then we filed the first sixth of it. |
| `db438504` | You already have this and we never said so, which is our fault. A picture of the page goes with every report you send, and has since July. The report box now says so. |

---

## 4. Still open after this batch

| Ticket | Why |
|---|---|
| `09255e75` `741af39f` `d4bc2603` `832f07e0` `b0d6324a` (the merge question) | Waiting on Molly — §1 and §2 above. |
| `b0818709` item 7 | Following tasks already written in a document: improved, still not guaranteed. Honestly answered as such on the ticket already. |
