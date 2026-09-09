# Line-ending normalization (OPS-09)

**Status: DONE.** Both halves have landed and the finding is closed.

| | |
|---|---|
| `.gitattributes` | 2026-09-07 |
| `git add --renormalize .` | **2026-09-08, commit `5638a977`** — 879 files, LF only |
| `.git-blame-ignore-revs` | carries `5638a977` |
| Measured 2026-09-09 | **0 CRLF blobs** across 3,690 tracked text files |

Verify it yourself in one line — it is the same check
`backend/tests/unit/test_line_endings_stay_lf.py` runs on every build:

```bash
git ls-files --eol | grep -c 'i/crlf'   # expect 0
```

> **Your WORKING TREE may still show CRLF and that is fine.** `git ls-files
> --eol` prints `i/<index> w/<worktree>`, and a file already on disk with CRLF
> keeps it until git next checks it out. What matters is the index column: that
> is what is committed, diffed and merged. On 2026-09-09 the index was 100% LF
> while ~790 files on disk were still CRLF, and nothing was wrong.

This document is kept because it is the record of a change that rewrote 879
files, and because the "After it lands" section at the end is still live advice
for anyone with an older checkout. **Everything between here and that section
describes a job that is finished** — the readiness gate, the reasons it was
blocked, and the recipe. Read it as history.

---

## Why the second half waited a day

Step 1 of the recipe below is a gate, and on 2026-09-07 the tree failed it
badly: eleven unmerged branches (two of them 20+ commits over 254 files) and
nine checked-out worktrees, five on active `fix/*` branches belonging to other
sessions. The renormalize commit rewrites every line of every CRLF file, so each
of those branches would have taken a whole-file conflict in anything it touched
— damage to other people's uncommitted and unmerged work, inflicted without
their knowing. That is the exact failure the "Working alongside other agents"
section of CLAUDE.md exists to prevent, so it stopped at the gate rather than
pushing through.

`.gitattributes` alone had no such cost: it is a new file, so it conflicts with
nothing, and it converts the big bang into a gradual rollout — each file
normalizes when someone next touches it, in that person's own commit, where the
whole-file diff is theirs and expected. That bought the day it took for the tree
to go quiet.

## Readiness check

Historical. This was the gate before step 3, and it prints what had to land first.

```bash
git status --porcelain                      # must be empty
git worktree list | grep -v "$(git rev-parse --show-toplevel)$"   # ideally none
git branch --no-merged main                 # each will conflict; merge first
```

On 2026-09-07 that printed 8 other worktrees and 10 other unmerged branches.
By 2026-09-08 it printed close to nothing, and the renormalize ran.

## What was wrong

883 of 3,555 tracked files were CRLF, and the repo had no `.gitattributes`. The
mix is historical — the project began on Windows and moved to macOS — so the
line ending a file carries records which machine last rewrote it rather than
anything meaningful.

What it costs day to day:

- **Whole-file diffs.** An editor that rewrites line endings on save turns a
  one-line change into a diff touching every line. Review becomes impossible
  and `git blame` attributes the whole file to that commit.
- **Silent breakage in tooling that reads bytes.** Anything comparing file
  content byte-for-byte (this audit's own move-verification scripts, for one)
  reports false differences unless it opens files in binary mode and knows to
  expect it.
- **Merge conflicts with no semantic content**, which is the failure mode most
  likely to hit whoever merges a long-lived branch.

## Why it was not done sooner

`git add --renormalize` rewrites every affected file in one commit. That commit
touches ~883 files, and any branch with uncommitted work in one of them gets a
conflict on every line. Several agents work in this tree at once, so the recipe
is safe only in a genuinely quiet moment: no other session mid-task, no
long-lived branch waiting to merge.

It also moves `git blame` for those files to the normalization commit. That is
recoverable — see the ignore-revs step, which is not optional.

## The recipe

**1. Confirm the tree is quiet.** No other agent working, and every branch you
care about either merged or freshly rebased.

```bash
git status --porcelain          # must be empty
git worktree list               # check nobody else is mid-task
git branch -a --no-merged main  # each of these will conflict; merge them first
```

**2. Add `.gitattributes`** at the repo root — **DONE 2026-09-07**, and it is
already in the repo. Kept here for the record:

```gitattributes
# Normalize line endings on commit; check out platform-native.
* text=auto

# Explicitly text, so a file that starts with a byte that looks binary is not
# misdetected.
*.py     text
*.js     text
*.jsx    text
*.ts     text
*.tsx    text
*.json   text
*.md     text
*.sql    text
*.yml    text
*.yaml   text
*.html   text
*.css    text
*.sh     text eol=lf
*.mjs    text

# Binary — never touch these.
*.png    binary
*.jpg    binary
*.jpeg   binary
*.gif    binary
*.ico    binary
*.webp   binary
*.pdf    binary
*.woff   binary
*.woff2  binary
*.ttf    binary
*.otf    binary
*.keystore binary
*.jks    binary
```

**3. Renormalize, in its own commit, with nothing else in it** — the only step
with a blast radius. **Done 2026-09-08 as `5638a977`:**

```bash
git add --renormalize .
git status --porcelain | wc -l        # expect ~883
git commit -m "Normalize line endings to LF (OPS-09)"
```

**4. Preserve blame.** Without this the commit swallows authorship for 883
files:

```bash
git rev-parse HEAD > .git-blame-ignore-revs   # append if the file exists
git add .git-blame-ignore-revs
git commit -m "Ignore the normalization commit in blame"
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

GitHub reads `.git-blame-ignore-revs` automatically. Local clones need that
`git config` line once, per clone.

**5. Verify nothing but line endings changed:**

```bash
git show --stat HEAD~1 | tail -3
git diff HEAD~2 HEAD~1 --ignore-all-space --stat   # expect no output
```

The second command is the real check: if anything other than whitespace moved,
it prints. It should print nothing.

**6. Run the suites** before pushing. A file whose line endings changed can
still break a test that compares fixture bytes.

## After it lands — STILL LIVE ADVICE

This is the one section that is not history. It applies to anyone whose
checkout predates 2026-09-08.

Everyone else with a checkout should refresh rather than merge into stale work:

```bash
git pull
git status    # if this shows mass modifications, run: git add --renormalize .
```
