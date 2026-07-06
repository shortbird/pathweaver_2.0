# First Class Free — Email Automation Flow (copy + schedule)

**Purpose:** Full, copy-paste-ready email sequence for the "first class free" funnel — the
flagship B2C flow triggered when someone submits the `FreeClassModal` on `/classes`
(source `claim_free_class`). Built to run in Brevo.

**Aha moment:** the learner starts (and ideally completes) their first free, accredited class
in the Optio app. Every email either drives toward that action or, once it's done, converts
them to a paid path.

> **Before sending, confirm:** (1) double opt-in / marketing consent is captured on the modal;
> (2) current pricing and plan names (placeholders below: individual class **$150**, **Optio
> Family $50/mo**, **Academy $8,000/yr**, scholarships where state-eligible) — verify before
> send; (3) the app "claim/start" deep link. No emojis (brand tone).

---

## Global settings

| Setting | Value |
|---|---|
| Brevo list | **Free Class Leads** |
| Entry trigger | Contact added to *Free Class Leads* list (via `POST /api/contact`, type `claim_free_class`) |
| From name / email | **Tanner at Optio** / `support@optioeducation.com` |
| Reply-to | `support@optioeducation.com` (monitored — replies are a strong intent signal) |
| Capture note | Modal collects **email only** — do not rely on a first name. If `FIRSTNAME` exists, personalize; otherwise use a neutral greeting. |
| Attributes used for branching | `ACTIVATED` (account created + class started), `COMPLETED` (free class finished), `CONVERTED` (started any paid path), `STATE` (scholarship eligibility) |
| Global exit condition | `CONVERTED = true` → exit sequence immediately (stop selling what they bought) |
| Suppression | 6–12 months zero clicks → re-engagement branch → suppression list |

**Neutral greeting standard:** "Hi there," (used when no first name). If `FIRSTNAME` is present,
use "Hi {{ contact.FIRSTNAME }},".

---

## Schedule at a glance

| # | Send | Trigger / branch | Goal | Subject |
|---|---|---|---|---|
| 1 | Day 0, immediate | On list entry | Claim + start the free class | Your free class is ready |
| 2 | Day 1 | All still in flow | Explain the model + credibility | How a hobby becomes real credit |
| 3 | Day 3 | All not `COMPLETED` | Social proof | "She actually wants to do school now" |
| 4 | Day 5 | Branch on `ACTIVATED` / `COMPLETED` | Remove obstacles or celebrate | (3 variants) |
| 5 | Day 8 | Branch on `COMPLETED` | Convert to a paid path | (2 variants) |
| 6 | Day 12 | Not `CONVERTED` | Final decision / choose a path | Which path fits your family? |
| R1 | +35 days inactive | No opens/clicks since Day 12 | Soft re-engage | Still want your free credit? |
| R2 | +7 days after R1 | No engagement | Time-limited nudge | A quick nudge before we close this |
| R3 | +7 days after R2 | No engagement | Last chance, then suppress | Should we give your spot to someone else? |

Cadence logic: daily for the first few days (highest-engagement window), then widening to
every 2–3 days; re-engagement spans 30–60 days. Anyone who converts exits immediately.

---

## Email 1 — Day 0 (immediate)

- **Trigger:** contact enters *Free Class Leads*.
- **Goal:** get them into the app and starting the class today.
- **Subject:** Your free class is ready
- **Subject A/B:** Claim your free Optio class
- **Preview text:** Real high-school credit, zero cost — here's how to start in about five minutes.

**Body:**

Hi there,

Your free class is reserved and ready whenever you are.

Here's what that actually means: you (or your student) get a real high-school class built
around something you genuinely care about — photography, coding, music, business, cooking,
whatever lights you up. You do real work, and it earns credit that appears on an official,
WASC-accredited transcript. Not a certificate of completion. Real, transferable credit.

At Optio, the process is the goal. You learn by doing the thing, not by sitting through
lectures about it.

Getting started takes about five minutes:

1. Create your free account
2. Choose the topic for your first class
3. Start your first task

**[ Start my free class ]**

No payment, no card, no obligation — the first class is on us.

If you have any questions, just reply to this email. A real person reads every one.

Tanner
Optio

---

## Email 2 — Day 1

- **Trigger:** still in flow (has not exited).
- **Goal:** explain the model and establish credibility so the free class feels worth doing.
- **Subject:** How a hobby becomes real credit
- **Subject A/B:** Turn what you love into a transcript
- **Preview text:** Photography, coding, music, cooking — here's how Optio turns real projects into accredited credit.

**Body:**

Hi there,

If "get high-school credit for a hobby" sounds too good to be true, here's exactly how it
works — no magic involved:

- **Pick a real interest.** Your first class starts from something the student actually wants
  to do.
- **Do real work.** Each class is a series of hands-on tasks — make the thing, solve the
  problem, run the experiment.
- **Submit evidence.** Photos, writing, video, links, files — proof of the work.
- **Earn credit.** Completed work builds a portfolio and earns credit on an official
  WASC-accredited transcript that colleges and employers recognize.

That accreditation is the part most families care about, and it's the part most "learn
anything online" tools can't offer. With Optio, the learning is self-directed, but the
credential is the real thing.

Your free class is the fastest way to see it for yourself.

**[ Start my free class ]**

Tanner
Optio

---

## Email 3 — Day 3

- **Trigger:** all contacts where `COMPLETED` is not true.
- **Goal:** social proof — lower the risk with a real story.
- **Subject:** "She actually wants to do school now"
- **Subject A/B:** A real Optio family's story
- **Preview text:** How one family turned reluctant learners into motivated ones — with credit to show for it.

**Body:**

Hi there,

The line in the subject came from an Optio parent, a few weeks after their daughter started.

Her story is a common one: a bright kid who'd checked out of traditional school, doing the
minimum, convinced none of it mattered. She started an Optio class on something she already
loved — and for the first time in a long time, she was the one asking to do more.

Here's what changed: the work was hers. It was real. And it counted — every project added up
to actual, accredited credit on her transcript.

That is the whole idea behind Optio. Motivation isn't something you force. It shows up on its
own when the work is real and the learner has a say in it.

Your free class is set up to create exactly that moment. If you haven't started yet, this is
your sign.

**[ Start my free class ]**

Tanner
Optio

---

## Email 4 — Day 5 (branch on activation)

Split by whether they've engaged with the product yet.

### 4A — Not activated (`ACTIVATED` is not true)

- **Goal:** remove whatever's blocking them.
- **Subject:** Your free class is still waiting
- **Subject A/B:** Stuck? Let's get you started
- **Preview text:** It takes about five minutes, and we'll help with the first step.

**Body:**

Hi there,

I noticed you claimed a free class but haven't started it yet — no worries at all, life gets
busy. I just don't want you to miss it.

If something got in the way, here's the short version to get going:

1. Create your free account (about a minute)
2. Pick the topic for your first class
3. Start the first task — that's it

**[ Start my free class ]**

And if you got stuck somewhere, or you're not sure a topic "counts," just reply to this email
and tell me what the student's into. I'll point you to a good first class. Genuinely happy to
help.

Tanner
Optio

### 4B — Activated but not completed (`ACTIVATED` true, `COMPLETED` not true)

- **Goal:** encourage finishing.
- **Subject:** You're partway there
- **Subject A/B:** Don't leave your credit on the table
- **Preview text:** You've started — finishing the class is what turns the work into credit.

**Body:**

Hi there,

You've started your free class — that's the hardest part, and you're already past it.

Here's the thing worth knowing: the credit lands when the class is complete. Finishing is what
turns the work you've already done into credit on your transcript. You're closer than it feels.

**[ Finish my free class ]**

If you hit a point where you weren't sure what to do next, reply and let me know — I'll help
you get unstuck.

Tanner
Optio

### 4C — Completed (`COMPLETED` true)

- **Goal:** celebrate, then open the door to what's next.
- **Subject:** You just earned real credit — here's what's next
- **Subject A/B:** That's one accredited class down
- **Preview text:** Your first class is done and on your transcript. Here's how the full path works.

**Body:**

Hi there,

You did it — your first class is complete, and that credit is now on an official,
WASC-accredited transcript. That's real.

So here's the honest question: was that worth doing again?

Because the free class is a single class. The families who get the most out of Optio use it to
build a full, accredited path — sometimes a class or two a semester, sometimes a complete
homeschool diploma. Same approach you just experienced, scaled to a real transcript.

I'll lay out the options in a couple of days. For now — nice work. This is exactly how it's
supposed to feel.

**[ See what's next ]**

Tanner
Optio

---

## Email 5 — Day 8 (branch on completion) — the conversion email

### 5A — Completed the free class (`COMPLETED` true)

- **Goal:** convert to a paid path.
- **Subject:** Individual classes, or the full diploma?
- **Subject A/B:** Ready for the next class?
- **Preview text:** You've seen how it works — here are the three ways families keep going.

**Body:**

Hi there,

Now that you've been through a full class, here are the three ways families keep going with
Optio:

- **Individual classes — $150 each.** Add accredited classes one at a time, whenever a new
  interest shows up. Great if you just want to supplement.
- **Optio Family — $50/month.** Unlimited classes and a path to a complete, accredited
  homeschool diploma. This is what most families choose.
- **Optio Academy — full-time.** A complete, guided program for students who want Optio to be
  the whole thing. (Scholarships available in some states — reply and I'll check yours.)

There's no pressure and no wrong answer. If you're not sure which fits, reply with a sentence
about your situation and I'll tell you honestly where I'd start — even if that's "stick with
one class for now."

**[ Choose your path ]**

Tanner
Optio

> Optional incentive block (only if you want a nudge): "As a thank-you for finishing your free
> class, your first month of Optio Family is on us if you start in the next 72 hours." Keep it
> honest and time-boxed; remove if you'd rather not discount.

### 5B — Did not complete the free class (`COMPLETED` not true)

- **Goal:** re-anchor value, low-pressure path back in.
- **Subject:** No rush — but here's what you'd unlock
- **Subject A/B:** Still worth finishing
- **Preview text:** Your free class is still open, and it's the best way to decide if Optio fits.

**Body:**

Hi there,

You haven't finished your free class yet, and that's completely fine — no sequence of emails
should make anyone feel guilty about their week.

I'll just leave this here: the free class exists so you can decide whether Optio is right for
your family without spending a dollar. It's the clearest way to answer the only question that
matters — does this actually get my student engaged?

Whenever you've got twenty quiet minutes, it's still open.

**[ Pick up where I left off ]**

Tanner
Optio

---

## Email 6 — Day 12 (final decision)

- **Trigger:** `CONVERTED` is not true.
- **Goal:** one clear decision, then route out of the active sequence.
- **Subject:** Which path fits your family?
- **Subject A/B:** A quick guide to choosing
- **Preview text:** Individual classes, a full diploma, or the Academy — here's how to pick in two minutes.

**Body:**

Hi there,

This is the last note in this series, so I'll make it simple. If Optio feels like a fit, here's
how to choose:

- **Just want to add credit here and there?** Individual classes ($150 each).
- **Ready to make Optio your main path to an accredited diploma?** Optio Family ($50/month).
- **Want a complete, full-time program?** Optio Academy — reply and I'll send details (and check
  scholarship eligibility for your state).

Not ready to decide? That's okay too. Reply with any question — a real person answers — or book
a 15-minute call and we'll figure out the right starting point together.

**[ Start my free account ]**   **[ Book a 15-minute call ]**

Thanks for giving Optio a look. However you decide, I hope the free class showed your student
something worth chasing.

Tanner
Optio

> After Email 6: non-converters move to the monthly Optio newsletter and become eligible for
> the re-engagement branch below.

---

## Re-engagement branch (Days ~35–55 of inactivity)

Enter contacts with no opens or clicks since Email 6. 3 emails, then suppress if still silent.

### R1 — soft reminder

- **Subject:** Still want your free credit?
- **Preview text:** Your first accredited class is still on us — no strings.

Hi there,

A while back you claimed a free class with Optio and didn't get the chance to use it. It's still
reserved, and it's still free — one real, accredited high-school class, no cost.

If the timing is better now, it's waiting.

**[ Claim my free class ]**

Tanner
Optio

### R2 — time-limited nudge

- **Subject:** A quick nudge before we close this
- **Preview text:** We're tidying up open spots this week — yours is still here for now.

Hi there,

Quick heads-up: we periodically close out free-class spots that haven't been used, to keep
things current. Yours is still open, but I wanted to give you a fair nudge before it goes.

If you'd like to use it, the best time is this week.

**[ Start my free class ]**

Tanner
Optio

### R3 — last chance (then suppress)

- **Subject:** Should we give your spot to someone else?
- **Preview text:** Last note from us — reply or click and we'll keep it open.

Hi there,

This is the last email I'll send about your free class. If it's just not the right fit or the
right time, no hard feelings at all — I won't keep filling your inbox.

If you'd still like to keep the door open, just click below or reply. Otherwise I'll assume the
timing isn't right and step back.

**[ Keep my free class open ]**

Thanks for considering Optio.

Tanner
Optio

> Contacts who don't engage with R1–R3 move to the suppression list to protect deliverability
> (Gmail/Yahoo penalize sending to unengaged addresses).

---

## Testing, measurement, and notes

- **A/B test** subject lines on Emails 1, 4A, and 5A first — those carry the most weight
  (claim, re-activation, conversion). Keep subjects under ~50 characters; preview text 80–100.
- **Primary metrics:** free-class **start rate** (Email 1–4), free-class **completion rate**,
  and **conversion to a paid path** (the real goal). Opens are a vanity metric — watch the
  downstream actions.
- **Behavioral upgrade (later):** once the app fires events to Brevo (e.g. `class_started`,
  `class_completed`), convert the Day-4/5 branches from attribute checks to true event
  triggers so timing matches each learner's actual progress. Behavior-triggered emails
  outperform fixed schedules.
- **Personalization:** if you later capture a first name (or the student's interest) on the
  modal, thread it into Emails 1–3 for a meaningful lift.
- **Deliverability:** authenticate the sending domain (SPF/DKIM/DMARC) in Brevo and keep the
  spam-complaint rate under 0.3%. Double opt-in on the modal is strongly recommended given it
  auto-opens for first-time visitors.
