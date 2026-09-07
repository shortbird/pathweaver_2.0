# Line-ending normalization (OPS-09)

**Status: half done.** `.gitattributes` landed 2026-09-07, so the drift stops
growing — every file normalizes the next time anybody stages it. The one-shot
`git add --renormalize .` over the ~870 files already committed as CRLF is
still pending, and still needs a quiet window.

**Why the second half did not run on 2026-09-07**, when it was asked for: step 1
below is a gate, and the tree failed it badly. Eleven branches were unmerged
(two of them 20+ commits over 254 files) and nine worktrees were checked out,
five on active `fix/*` branches belonging to other sessions. The renormalize
commit rewrites every line of every CRLF file, so each of those branches would
have taken a whole-file conflict in anything it touches — damage to other
people's uncommitted and unmerged work, inflicted without their knowing. That is
the exact failure the "Working alongside other agents" section of CLAUDE.md
exists to prevent, so it stopped at the gate rather than pushing through it.

Adding `.gitattributes` on its own has no such cost: it is a new file, so it
conflicts with nothing, and it converts the big bang into a gradual rollout —
each file normalizes when someone next touches it, in that person's own commit,
where the whole-file diff is theirs and expected.

## Readiness check

Run this before attempting step 3. It prints what still has to land.

```bash
git status --porcelain                      # must be empty
git worktree list | grep -v "$(git rev-parse --show-toplevel)$"   # ideally none
git branch --no-merged main                 # each will conflict; merge first
```

On 2026-09-07 that printed 8 other worktrees and 10 other unmerged branches. It
needs to print roughly nothing.

## What is wrong

883 of 3,555 tracked files are CRLF, and the repo has no `.gitattributes`. The
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

## Why it has not been done

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

**3. Renormalize, in its own commit, with nothing else in it. THIS IS THE STEP
THAT IS STILL PENDING**, and the only one with a blast radius:

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

## After it lands

Everyone else with a checkout should refresh rather than merge into stale work:

```bash
git pull
git status    # if this shows mass modifications, run: git add --renormalize .
```
