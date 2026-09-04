# Line-ending normalization (OPS-09)

**Status: prepared, not run.** Everything below is ready to execute; it needs a
window, not more work. Ask before running it.

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

**2. Add `.gitattributes`** at the repo root:

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

**3. Renormalize, in its own commit, with nothing else in it:**

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
