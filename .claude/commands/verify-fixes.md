---
name: verify-fixes
description: Verifies that audit fixes were implemented correctly. Runs tests and re-scans for issues.
model: sonnet
---

You verify that fixes from /fix-audit were implemented correctly.

## Step 1: Check fixes are done

```bash
echo "=== Task Status ==="
echo "Queue: $(ls .claude/workspace/queue/fix_*.json 2>/dev/null | wc -l)"
echo "Active: $(ls .claude/workspace/active/*fix*.json 2>/dev/null | wc -l)"
echo "Completed: $(ls .claude/workspace/completed/*fix*.json 2>/dev/null | wc -l)"
```

If Queue or Active > 0, tell user to wait for workers.

## Step 2: Check git status

```bash
echo ""
echo "=== Git Status ==="
git status --short
echo ""
echo "Files modified:"
git diff --name-only
```

## Step 3: Run tests

```bash
echo ""
echo "=== Running Tests ==="
if [ -f "pytest.ini" ] || [ -f "pyproject.toml" ]; then
    pytest --tb=short -q 2>&1 | tail -20
    TEST_EXIT=$?
elif [ -f "package.json" ]; then
    npm test 2>&1 | tail -20
    TEST_EXIT=$?
else
    echo "No test framework detected"
    TEST_EXIT=0
fi

if [ $TEST_EXIT -eq 0 ]; then
    echo "✅ Tests passing"
else
    echo "❌ Tests failing - review fixes"
fi
```

## Step 4: Re-scan for original issues

```bash
echo ""
echo "=== Re-scanning for Issues ==="

echo "-- Hardcoded Secrets --"
SECRETS=$(grep -rn "password.*=.*['\"]" --include="*.py" --include="*.ts" 2>/dev/null | grep -v node_modules | grep -v venv | grep -v test | wc -l)
echo "Found: $SECRETS (should be 0 or fewer than before)"

echo "-- Dangerous Functions --"
DANGEROUS=$(grep -rn "eval(\|exec(" --include="*.py" 2>/dev/null | grep -v venv | wc -l)
echo "Found: $DANGEROUS"

echo "-- TODOs Remaining --"
TODOS=$(grep -rn "TODO\|FIXME" --include="*.py" --include="*.ts" 2>/dev/null | grep -v node_modules | grep -v venv | wc -l)
echo "Found: $TODOS"
```

## Step 5: Summary

```bash
echo ""
echo "=========================================="
echo "VERIFICATION COMPLETE"
echo "=========================================="
echo ""
echo "Tests: $([ $TEST_EXIT -eq 0 ] && echo '✅ PASSING' || echo '❌ FAILING')"
echo "Modified files: $(git diff --name-only | wc -l)"
echo ""
```

## Step 6: Next steps

Tell user:

```
Verification complete.

If tests pass:
  1. Review changes: git diff
  2. Commit: git add -A && git commit -m "fix: implement audit fixes"
  3. Push: git push

If tests fail:
  1. Review failing tests
  2. Fix issues manually or run /debug-and-fix
```

STOP here.
