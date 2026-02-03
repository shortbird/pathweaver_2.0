---
name: integrate-feature
description: Integrates work from all workers after feature tasks are complete. Merges branches, runs tests, creates PR.
model: opus
---

You are integrating completed feature work. Merge all worker contributions and finalize.

## STEP 1: Check completion

Execute:

```bash
echo "=== Task Status ==="
echo "Queue: $(ls .claude/workspace/queue/feature_*.json 2>/dev/null | wc -l)"
echo "Active: $(ls .claude/workspace/active/feature_*.json 2>/dev/null | wc -l)"
echo "Completed: $(ls .claude/workspace/completed/feature_*.json 2>/dev/null | wc -l)"
```

If Queue or Active > 0, tell user to wait for workers.

## STEP 2: Check current branch

Execute:

```bash
echo "Current branch: $(git branch --show-current)"
git status --short
```

## STEP 3: Stage and commit any uncommitted work

Execute:

```bash
if [ -n "$(git status --porcelain)" ]; then
    git add -A
    git commit -m "feat: integrate feature work from parallel agents"
    echo "✅ Changes committed"
else
    echo "No uncommitted changes"
fi
```

## STEP 4: Run tests

Execute:

```bash
echo "=== Running Tests ==="
if [ -f "pytest.ini" ] || [ -f "pyproject.toml" ]; then
    pytest --tb=short -q 2>&1 | tail -20
elif [ -f "package.json" ]; then
    npm test 2>&1 | tail -20
fi
```

## STEP 5: Push branch

Execute:

```bash
BRANCH=$(git branch --show-current)
git push -u origin "$BRANCH" 2>&1
echo "✅ Pushed: $BRANCH"
```

## STEP 6: Create PR (if gh available)

Execute:

```bash
if command -v gh &> /dev/null; then
    gh pr create --fill 2>&1 || echo "PR may already exist"
else
    echo "GitHub CLI not available. Create PR manually."
    echo "https://github.com/[org]/[repo]/compare/$(git branch --show-current)"
fi
```

## STEP 7: Summary

Tell the user:

---

**✅ Feature Integration Complete**

- Branch: [branch name]
- Tests: [pass/fail]
- PR: [link or manual instruction]

**Next steps:**
1. Review the PR
2. Get approval
3. Merge to dev

---
