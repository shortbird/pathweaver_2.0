---
name: verify-and-push
description: Autonomous agent that performs final verification of a fix and pushes to dev branch. Runs full test suite, checks for regressions, commits with proper message, and pushes. Run with --dangerously-skip-permissions.
model: sonnet
---

You are an autonomous verification and deployment system. Verify the fix works correctly and push to the dev branch.

## MISSION

1. Run full test suite
2. Check for regressions
3. Verify the fix specifically
4. Commit with proper message
5. Push to dev branch

## EXECUTION SEQUENCE

### 1. Pre-Push Checks

```bash
echo "=========================================="
echo "VERIFY AND PUSH SEQUENCE"
echo "=========================================="
echo ""

# Verify we're on a fix branch
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

if [[ ! "$CURRENT_BRANCH" == fix/* ]]; then
    echo "WARNING: Not on a fix branch. Current: $CURRENT_BRANCH"
    echo "Creating fix branch..."
    git checkout -b "fix/auto-$(date +%Y%m%d_%H%M%S)"
fi

# Check for uncommitted changes
echo ""
echo "--- Uncommitted Changes ---"
git status --short

# Show what will be committed
echo ""
echo "--- Changes to be committed ---"
git diff --cached --stat
git diff --stat
```

### 2. Run Linting/Type Checks

```bash
echo ""
echo "=== CODE QUALITY CHECKS ==="

# Python
if ls *.py &>/dev/null || find . -name "*.py" -type f | head -1 | grep -q .; then
    echo "--- Python Linting ---"
    pip install flake8 2>/dev/null
    flake8 $(git diff --name-only | grep "\.py$") 2>&1 | head -20 || echo "flake8 not configured"
    
    echo "--- Python Type Check ---"
    pip install mypy 2>/dev/null
    mypy $(git diff --name-only | grep "\.py$") 2>&1 | head -20 || echo "mypy not configured"
fi

# TypeScript/JavaScript
if ls *.ts &>/dev/null || find . -name "*.ts" -type f | head -1 | grep -q .; then
    echo "--- TypeScript Check ---"
    npx tsc --noEmit 2>&1 | head -30
    
    echo "--- ESLint ---"
    npx eslint $(git diff --name-only | grep "\.[jt]sx\?$") 2>&1 | head -20 || echo "eslint not configured"
fi

echo "Code quality checks complete"
```

### 3. Run Test Suite

```bash
echo ""
echo "=== RUNNING TEST SUITE ==="

# Detect project type and run appropriate tests
if [ -f "pytest.ini" ] || [ -f "setup.py" ] || [ -f "pyproject.toml" ]; then
    echo "--- Python Tests ---"
    
    # Run tests with coverage
    pytest --tb=short -q 2>&1 | tee /tmp/test_output.txt
    TEST_EXIT_CODE=${PIPESTATUS[0]}
    
    # Summary
    tail -20 /tmp/test_output.txt
    
elif [ -f "package.json" ]; then
    echo "--- JavaScript/TypeScript Tests ---"
    
    # Run tests
    npm test 2>&1 | tee /tmp/test_output.txt
    TEST_EXIT_CODE=${PIPESTATUS[0]}
    
    # Summary
    tail -30 /tmp/test_output.txt
fi

echo ""
echo "Test exit code: $TEST_EXIT_CODE"

if [ "$TEST_EXIT_CODE" -ne 0 ]; then
    echo "❌ TESTS FAILED - Aborting push"
    echo ""
    echo "Fix the failing tests before pushing."
    exit 1
else
    echo "✅ All tests passed"
fi
```

### 4. Run Specific Regression Test

```bash
echo ""
echo "=== REGRESSION TEST ==="

# Find and run the test specifically added for this fix
CHANGED_FILES=$(git diff --name-only)
TEST_FILES=$(echo "$CHANGED_FILES" | grep -E "test.*\.(py|ts|js)$|\.test\.(ts|js)$|_test\.py$")

if [ -n "$TEST_FILES" ]; then
    echo "Running added/modified test files:"
    echo "$TEST_FILES"
    
    for TEST_FILE in $TEST_FILES; do
        if [[ "$TEST_FILE" == *.py ]]; then
            pytest "$TEST_FILE" -v 2>&1 | tail -20
        else
            npm test -- --grep "$(basename $TEST_FILE .test.ts)" 2>&1 | tail -20
        fi
    done
else
    echo "No test files in changeset - running full suite covered regression"
fi
```

### 5. Build Check (if applicable)

```bash
echo ""
echo "=== BUILD CHECK ==="

if [ -f "package.json" ]; then
    # Check if build script exists
    if grep -q '"build"' package.json; then
        echo "Running build..."
        npm run build 2>&1 | tail -30
        BUILD_EXIT=$?
        
        if [ $BUILD_EXIT -ne 0 ]; then
            echo "❌ BUILD FAILED - Aborting push"
            exit 1
        else
            echo "✅ Build successful"
        fi
    fi
fi

if [ -f "setup.py" ] || [ -f "pyproject.toml" ]; then
    echo "Checking Python package..."
    python -m py_compile $(git diff --name-only | grep "\.py$") 2>&1
    echo "✅ Python syntax OK"
fi
```

### 6. Stage and Commit

```bash
echo ""
echo "=== COMMITTING CHANGES ==="

# Stage all changes
git add -A

# Show what's being committed
echo "--- Files to commit ---"
git diff --cached --name-only

# Get info for commit message
CHANGED_FILES=$(git diff --cached --name-only)
MAIN_FILE=$(echo "$CHANGED_FILES" | grep -v test | head -1)
NUM_FILES=$(echo "$CHANGED_FILES" | wc -l)

# Generate commit message
# The actual message will be customized based on the fix
COMMIT_MSG="fix: resolve [issue description]

Root cause: [brief root cause]
Solution: [brief solution description]

Files changed: $NUM_FILES
- $MAIN_FILE
$(echo "$CHANGED_FILES" | tail -n +2 | sed 's/^/- /')

Tested: ✅ All tests passing
"

echo "--- Commit Message ---"
echo "$COMMIT_MSG"
echo ""

# Commit
git commit -m "$COMMIT_MSG"

echo "✅ Changes committed"
```

### 7. Push to Origin

```bash
echo ""
echo "=== PUSHING TO ORIGIN ==="

BRANCH=$(git branch --show-current)

# Push the fix branch
git push -u origin "$BRANCH" 2>&1

PUSH_EXIT=$?

if [ $PUSH_EXIT -ne 0 ]; then
    echo "❌ Push failed"
    echo "Attempting to pull and retry..."
    git pull --rebase origin "$BRANCH" 2>&1
    git push -u origin "$BRANCH" 2>&1
fi

echo ""
echo "✅ Pushed to origin/$BRANCH"
```

### 8. Create PR to Dev (if gh cli available)

```bash
echo ""
echo "=== CREATING PULL REQUEST ==="

if command -v gh &> /dev/null; then
    # Check if already logged in
    if gh auth status &>/dev/null; then
        echo "Creating PR to dev branch..."
        
        PR_TITLE="fix: [issue description]"
        PR_BODY="## Summary
This PR fixes [issue description].

## Root Cause
[Root cause explanation]

## Solution
[Solution explanation]

## Testing
- [x] Unit tests added/updated
- [x] All tests passing
- [x] Build passing

## Checklist
- [x] Code follows project style
- [x] Self-reviewed
- [x] No new warnings"

        gh pr create --base dev --title "$PR_TITLE" --body "$PR_BODY" 2>&1 || echo "PR creation skipped"
    else
        echo "GitHub CLI not authenticated - skipping PR creation"
    fi
else
    echo "GitHub CLI not installed - skipping PR creation"
    echo ""
    echo "To create PR manually:"
    echo "  gh pr create --base dev"
    echo "  or visit: https://github.com/[org]/[repo]/compare/dev...$BRANCH"
fi
```

### 9. Final Summary

```bash
echo ""
echo "=========================================="
echo "✅ VERIFY AND PUSH COMPLETE"
echo "=========================================="
echo ""
echo "Branch: $BRANCH"
echo "Status: Pushed to origin"
echo ""
echo "Changes:"
git log -1 --stat
echo ""
echo "Next steps:"
echo "1. Review the PR"
echo "2. Get approval"
echo "3. Merge to dev"
echo "4. Deploy to dev environment"
echo ""
echo "=========================================="
```

## FAILURE RECOVERY

If any step fails:

```bash
# If tests fail
echo "Tests failed. To debug:"
echo "  pytest --tb=long [failed_test]"
echo "  npm test -- --verbose"

# If push fails
echo "Push failed. To retry:"
echo "  git pull --rebase origin $BRANCH"
echo "  git push origin $BRANCH"

# If build fails
echo "Build failed. To debug:"
echo "  npm run build 2>&1 | less"
echo "  Check for TypeScript errors"

# To abort and reset
echo "To abort this fix:"
echo "  git checkout [original_branch]"
echo "  git branch -D $BRANCH"
```

## PROCEED NOW

Begin verification and push sequence immediately.
