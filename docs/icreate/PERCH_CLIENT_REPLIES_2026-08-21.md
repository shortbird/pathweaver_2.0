# iCreate — draft replies (nothing sent)

Drafted 2026-08-21. **Nothing here has been sent or posted.** The email is for Tanner to
paste; the ticket notes are for Perch, once the fix is verified in production.

Plan and reasoning: [PERCH_TRIAGE_2026-08-21.md](PERCH_TRIAGE_2026-08-21.md).

---

## 1. Reply to Molly's email

```
Hi Molly,

Good questions, and all three land on the same screen. Here is where each one stands.

On the button: you are right that it costs a click, and "Assign or send" does not tell
you what it does. I have not made them tabs, because a tab is somewhere you go and come
back from, and creating a form is neither. Switching to a "new form" tab would take away
the queue you were reading. What I have done instead is put each tab's own action on the
button. On Requests it now reads "New form, request, or task". On Checklists it reads
"Assign a checklist". On Sent paperwork it reads "Send a document for signature". One
click, and it says what you are about to make. The other two stay one click away under
the little arrow beside it, so you can still start anything from anywhere.

On forms going to the right person: yes, and it is built. There is a new "Where forms go"
setting in the Task Center, under that same arrow. It lists every form type with a person
beside it, so substitute requests can go straight to Julia and maintenance can go to
whoever holds the keys. A form filed against a type you have set arrives already assigned,
and that person is notified the same way they would be if you had assigned it by hand.
Anything you leave on "the office" behaves exactly as it does today. Routing decides who
owns a form, not who can see it, so everything still appears in your queue.

On reassigning: you can already do this, and it works for anything in the queue no matter
who filed it. Open the request by clicking its row, and there is an "Assigned to" box.
Change it and the new person is notified. It was one click too deep to notice, so I have
also added an "Assigned to" filter at the top of the queue. Anyone, Me, Nobody yet, or a
named person. That is the fast way to see what is sitting with whom.

Three other things you reported are fixed in the same batch: the due date box that would
not let you type the year, the class rosters report that could not tell you who was
waitlisted, and revenue showing on the reports page where campus coordinators can see it.
That last one was a real gap on our side and you were right to flag it.

Tanner
```

---

## 2. Ticket notes

For `node app/tools/shipped.mjs --ticket <id> --note "..."` — **after** the fix is verified
in production, per the working agreement.

### Fixed in this batch

**`c8c134e2` — revenue on the reports page**
> You were right, and this was a real gap. Revenue is now part of the money side of the
> system rather than the reports page, so campus coordinators do not see it at all. They
> keep everything else on that page, because enrollment, attendance and the class reports
> are how they run the campus.

**`3de400bb` — the contract asking you to read two family forms first**
> Fixed. Sending the family service program form and the behaviour agreement out for
> signature put them in your own portal, and your teacher contract was picking them up as
> things to read before signing. A document sent out for signature is its own task now, so
> it will not turn up a second time under something unrelated.

**`aea51a67` — could not type the year into a due date**
> Fixed. The box was saving on every key you pressed, and a half-typed date reads as empty,
> so it kept wiping what you were typing. It now waits until the date is finished. The
> calendar picker works exactly as before.

**`0950b1c4` — could not tell who was waitlisted on the roster report**
> Fixed three ways. Waiting and offered students are shaded and labelled in the table, the
> Status column can no longer be turned off while the waitlist is included, and if you
> change the settings after running the report it now tells you to run it again rather than
> leaving the old sheet on screen looking current.

**`e22e07e2` — archived classes on the roster list**
> Done. The class rosters report now has its own "Include archived" tick, off by default,
> matching the class report next to it. Archived classes are labelled in the list so you
> can see what you are picking.

**`5ba8fd56` — tick the classes, and gender**
> Both done. The class picker is a list of tickboxes now instead of the highlight-to-select
> box, with Select all and Clear. Gender is a column you can add to the roster report, from
> what families gave at registration.

**`aca2cadf` — the quest dropdown**
> Done. The list is alphabetical now, and split into two groups: your school's own quests
> first, then the Optio library.

**`18909673` — assigning requests and tasks to people**
> You can, and now more easily. Every form or task in the queue can be assigned or
> reassigned to any teacher, coordinator or admin, and they are notified. On top of that you
> can now set where a kind of form goes automatically, so substitute requests can land with
> Julia without passing through you first. It is under "Where forms go" in the Task Center.

**`e9870e13` — Sent Paperwork was empty**
> That tab was empty because nothing had been sent yet. It has been listing your sends since
> that afternoon. The part worth fixing was the other half of what you said: sending should
> be startable from the Task Center rather than only from Secure Documents. On the Sent
> paperwork tab the button now reads "Send a document for signature" and does exactly that.

### Already fixed, worth confirming

**`38cc232a` — could not remove Kayla Rose**
> Fixed the same afternoon you reported it. Removing a person was failing on a piece of
> record-keeping attached to their account. It should work now. Tell us if it does not.

**`f03b849c` — knowing whether they can see a document**
> This landed just before you wrote, so you were probably on the older version. Every
> document row shows either "Shared with them" or "Private", and you can select several and
> share them in one go.

**`23edd56a` — the airspeed velocity of an unladen swallow**
> African or European? Closing this one.

### Not fixed, and why

**`db438504` — sending a screenshot with a report**
> Not possible yet. The report button captures the page address, what you clicked and any
> errors, but not a picture. It is on our list for the reporting tool itself.

**`741af39f`, `d4bc2603`, `09255e75`, `b0d6324a`, `832f07e0`**
> Each is waiting on answers we asked for on the ticket. The in-and-out button is the urgent
> one: three questions, and 24 August is the date you gave us.
