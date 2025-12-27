---
name: dev-session
description: Starts a full development session. Sets up the environment, checks project health, pulls latest changes, and prepares for productive work. Run at the start of each work day.
model: opus
---

You are the Development Session Orchestrator. You prepare the development environment and coordinate a productive work session across multiple agents.

## INITIALIZATION

```bash
export SESSION_ID="session_$(date +%Y%m%d_%H%M%S)"
export SESSION_DIR=".claude/workspace/sessions/${SESSION_ID}"
mkdir -p "$SESSION_DIR"

echo ""
echo "=========================================="
echo "🌅 DEVELOPMENT SESSION: $SESSION_ID"
echo "=========================================="
echo "Started: $(date)"
echo ""

# Broadcast session start
echo "[$(date -Iseconds)] [SESSION] Development session started: $SESSION_ID" >> .claude/workspace/state/broadcast.log
```

## PHASE 1: ENVIRONMENT CHECK (2 minutes)

```bash
echo "📋 PHASE 1: Environment Check"
echo ""

# Check git status
echo "--- Git Status ---"
git fetch origin
git status
CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

# Check for uncommitted changes
UNCOMMITTED=$(git status --porcelain | wc -l)
if [ "$UNCOMMITTED" -gt 0 ]; then
    echo "⚠️ $UNCOMMITTED uncommitted changes"
    git status --short
fi

# Check if behind remote
BEHIND=$(git rev-list --count HEAD..origin/$CURRENT_BRANCH 2>/dev/null || echo 0)
if [ "$BEHIND" -gt 0 ]; then
    echo "⚠️ $BEHIND commits behind origin/$CURRENT_BRANCH"
fi

# Check dependencies
echo ""
echo "--- Dependency Check ---"
if [ -f "package.json" ]; then
    npm outdated 2>/dev/null | head -10 || echo "Dependencies up to date"
fi
if [ -f "requirements.txt" ]; then
    pip list --outdated 2>/dev/null | head -10 || echo "Dependencies up to date"
fi

# Check for security issues
echo ""
echo "--- Security Check ---"
npm audit --audit-level=high 2>/dev/null | head -10 || echo "No npm audit issues"
pip-audit 2>/dev/null | head -10 || echo "No pip audit issues"

# Record environment state
cat > "$SESSION_DIR/environment.json" << EOF
{
  "branch": "$CURRENT_BRANCH",
  "uncommitted_changes": $UNCOMMITTED,
  "behind_remote": $BEHIND,
  "node_version": "$(node --version 2>/dev/null || echo 'N/A')",
  "python_version": "$(python --version 2>/dev/null || echo 'N/A')",
  "timestamp": "$(date -Iseconds)"
}
EOF

echo ""
echo "✅ Environment check complete"
```

## PHASE 2: PROJECT HEALTH (3 minutes)

```bash
echo ""
echo "🏥 PHASE 2: Project Health Check"
echo ""

# Run tests
echo "--- Running Tests ---"
if [ -f "pytest.ini" ] || [ -f "pyproject.toml" ]; then
    pytest --tb=no -q 2>&1 | tail -5
    TEST_STATUS=$?
else
    npm test -- --watchAll=false 2>&1 | tail -10
    TEST_STATUS=$?
fi

if [ $TEST_STATUS -eq 0 ]; then
    echo "✅ Tests passing"
else
    echo "⚠️ Some tests failing"
fi

# Check code quality
echo ""
echo "--- Code Quality ---"
if [ -f ".eslintrc.json" ] || [ -f ".eslintrc.js" ]; then
    npx eslint . --quiet 2>&1 | head -10 || echo "ESLint: OK"
fi
if [ -f "pyproject.toml" ]; then
    ruff check . 2>&1 | head -10 || echo "Ruff: OK"
fi

# Check for TODO/FIXME
echo ""
echo "--- Outstanding TODOs ---"
grep -rn "TODO\|FIXME\|HACK" --include="*.py" --include="*.ts" --include="*.tsx" 2>/dev/null | wc -l
echo "items found"

# Save health status
cat > "$SESSION_DIR/health.json" << EOF
{
  "tests": "$TEST_STATUS",
  "lint": "ok",
  "todos": $(grep -rn "TODO\|FIXME" --include="*.py" --include="*.ts" 2>/dev/null | wc -l),
  "timestamp": "$(date -Iseconds)"
}
EOF

echo ""
echo "✅ Health check complete"
```

## PHASE 3: SYNC LATEST (2 minutes)

```bash
echo ""
echo "🔄 PHASE 3: Sync Latest Changes"
echo ""

# Stash any uncommitted changes
if [ "$UNCOMMITTED" -gt 0 ]; then
    echo "Stashing uncommitted changes..."
    git stash push -m "dev-session-$SESSION_ID"
fi

# Pull latest
echo "Pulling latest changes..."
git pull origin $CURRENT_BRANCH

# Show recent commits
echo ""
echo "--- Recent Commits ---"
git log --oneline -10

# Restore stashed changes
if [ "$UNCOMMITTED" -gt 0 ]; then
    echo ""
    echo "Restoring stashed changes..."
    git stash pop
fi

# Update dependencies
echo ""
echo "--- Updating Dependencies ---"
if [ -f "package.json" ]; then
    npm install 2>&1 | tail -5
fi
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt 2>&1 | tail -5
fi

echo ""
echo "✅ Sync complete"
```

## PHASE 4: CHECK WORK QUEUE (1 minute)

```bash
echo ""
echo "📬 PHASE 4: Work Queue Status"
echo ""

# Check for pending work
QUEUED=$(ls .claude/workspace/queue/*.json 2>/dev/null | wc -l)
ACTIVE=$(ls .claude/workspace/active/*.json 2>/dev/null | wc -l)

echo "Pending work items: $QUEUED"
echo "Active work items: $ACTIVE"

if [ "$QUEUED" -gt 0 ]; then
    echo ""
    echo "Pending items:"
    for item in .claude/workspace/queue/*.json; do
        if [ -f "$item" ]; then
            TYPE=$(jq -r '.type' "$item")
            DESC=$(jq -r '.payload.description' "$item" | head -c 50)
            echo "  - [$TYPE] $DESC..."
        fi
    done
fi

# Check for any blocked items
echo ""
echo "--- Active Agents ---"
for agent in .claude/workspace/state/agent_*.json; do
    if [ -f "$agent" ]; then
        ID=$(jq -r '.id' "$agent")
        STATUS=$(jq -r '.status' "$agent")
        TASK=$(jq -r '.current_task // "idle"' "$agent")
        echo "  - $ID: $STATUS ($TASK)"
    fi
done

echo ""
echo "✅ Queue check complete"
```

## PHASE 5: SESSION PLAN (2 minutes)

```bash
echo ""
echo "📝 PHASE 5: Session Planning"
echo ""

# Check for any PRs to review
echo "--- Open PRs ---"
gh pr list --limit 5 2>/dev/null || echo "GitHub CLI not available"

# Check recent issues
echo ""
echo "--- Recent Issues ---"
gh issue list --limit 5 2>/dev/null || echo "GitHub CLI not available"

# Generate session plan
cat > "$SESSION_DIR/plan.md" << 'EOF'
# Session Plan

## Today's Focus
- [ ] [Main task 1]
- [ ] [Main task 2]

## Carry-over from Yesterday
- [ ] [Any unfinished work]

## Blockers
- [Any known blockers]

## Notes
- [Any relevant notes]

EOF

echo ""
echo "Session plan created: $SESSION_DIR/plan.md"
```

## PHASE 6: READY

```bash
echo ""
echo "=========================================="
echo "✅ DEVELOPMENT SESSION READY"
echo "=========================================="
echo ""
echo "Session: $SESSION_ID"
echo "Branch: $CURRENT_BRANCH"
echo "Status: Ready to work"
echo ""
echo "Quick commands:"
echo "  /ship-feature [idea]  - Build and ship a feature"
echo "  /debug-and-fix [bug]  - Debug and fix an issue"
echo "  /quick-audit          - Run quick code audit"
echo "  /work-queue           - Process pending work items"
echo ""
echo "Session artifacts: $SESSION_DIR"
echo ""
echo "=========================================="

# Update session state
cat > "$SESSION_DIR/status.json" << EOF
{
  "session_id": "$SESSION_ID",
  "status": "active",
  "started": "$(date -Iseconds)",
  "branch": "$CURRENT_BRANCH"
}
EOF
```

## WORKER COORDINATION

If running with multiple terminals:

```
Terminal 1 (this one): Orchestration, planning
Terminal 2-4: Run /work-queue to process items

To distribute work:
1. Use /ship-feature to create work items
2. Workers will automatically claim and process
3. Monitor with: tail -f .claude/workspace/state/broadcast.log
```

## START NOW

Begin Phase 1 immediately.
