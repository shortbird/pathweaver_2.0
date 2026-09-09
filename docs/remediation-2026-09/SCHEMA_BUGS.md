# Schema bugs found in production

Found while standing up staging on 2026-09-09. **Neither is fixed** — the phase
rule was to record bugs rather than fix them inline, and both need a migration
and a decision.

---

## 1. `public.quests.quest_type` defaults to a value its own CHECK rejects

```
column default : 'custom'::quest_source
check_quest_type : CHECK (quest_type = ANY (ARRAY['optio','course','class']))
```

**Any `INSERT INTO public.quests` that omits `quest_type` fails:**

```
ERROR: new row for relation "quests" violates check constraint "check_quest_type"
```

### Why nothing is broken today

All 1,445 production rows carry a valid value — `optio` 1,361, `class` 62,
`course` 22. The application always sets the column explicitly, so the default
has never once been used. This is latent, not live.

### Why it is still worth fixing

A default exists to be relied on. The next person writing an insert, a fixture,
a backfill or a seed script will reasonably omit a column that has one, and get
a constraint violation that points at the value `custom` — which appears nowhere
in their code. That is a confusing five minutes at best, and at worst it happens
inside a migration against production.

It is also evidence that `quest_source` (the enum, whose values are
`khan_academy, brilliant, custom, optio`) and `check_quest_type` (which permits
`optio, course, class`) have drifted apart. The column is typed as one and
constrained by the other, and only their intersection — `optio` — satisfies
both. `class` and `course` are permitted by the CHECK but are **not** members of
the enum type.

That last point deserves a second look before anyone writes the migration: if
`class` and `course` are not enum members, the CHECK can only be comparing
`(quest_type)::text`, and the enum is doing no work at all.

### What a fix would involve — decide before writing it

1. **Change the default** to `'optio'` (the overwhelming majority) or drop it and
   make the column `NOT NULL` so omission fails loudly at write time rather than
   confusingly at constraint time.
2. **Reconcile the enum with the CHECK.** Either add `class` and `course` to
   `quest_source`, or stop using the enum type for this column. Leaving a type
   whose members are mostly invalid is the underlying defect.

Both touch a 1,445-row table on the read path of the quest hub, so this belongs
in `migrate-prod.yml` with a `plan` first.

---

## 2. `CLAUDE.md` documented a column that does not exist

Not a schema bug — a documentation bug about the schema, recorded here because it
was found the same way and has the same failure mode.

The "Core Tables" section listed:

```
quest_task_completions - id, user_id, quest_id, task_id, xp_awarded, completed_at
```

There is no `xp_awarded` column on `quest_task_completions`. XP lives on
`user_quest_tasks.xp_value` and in `user_skill_xp`. Any code written from that
line fails at the insert.

**Fixed** in `CLAUDE.md` on 2026-09-09. Listed here because it is the second time
today a confident line in the docs turned out to be false — the other being the
claim that the migration CLI ignores 8-digit filename stamps — and both were
found by running something, not by reading.

---

## How these were found

`scripts/seed_staging.py` writes to twelve tables. It had never run. Standing up
staging ran it, and six failures in it were mine (assumed columns, assumed
constraint values); the two above were not.

Nothing in the test suite would have caught either. The backend suite is 5,538
tests and passes with both of these present, because it mocks the database.
