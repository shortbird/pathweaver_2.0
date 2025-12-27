---
name: sprint-start
description: Analyzes codebase and creates a sprint plan. Solo command - does not use workers.
model: opus
---

You analyze the codebase and create a prioritized sprint plan.

## Step 1: Initialize

```bash
SPRINT_ID="sprint_$(date +%Y%m%d)"
mkdir -p ".claude/workspace/sprints/$SPRINT_ID"
echo "Sprint: $SPRINT_ID"
```

## Step 2: Analyze codebase for work

```bash
echo "=== Analyzing Codebase ==="

echo ""
echo "--- TODOs/FIXMEs ---"
grep -rn "TODO\|FIXME" --include="*.py" --include="*.ts" --include="*.tsx" 2>/dev/null | grep -v node_modules | grep -v venv | head -20

echo ""
echo "--- Files Lacking Tests ---"
for f in $(find . -name "*.py" -path "*/routes/*" -o -name "*.py" -path "*/services/*" 2>/dev/null | grep -v test | head -10); do
    echo "  No tests: $f"
done

echo ""
echo "--- Large Files (refactor candidates) ---"
find . -name "*.py" -o -name "*.ts" 2>/dev/null | grep -v node_modules | grep -v venv | xargs wc -l 2>/dev/null | sort -rn | awk '$1 > 300' | head -10

echo ""
echo "--- Recent Bug Patterns ---"
git log --oneline --all --grep="fix\|bug" 2>/dev/null | head -10
```

## Step 3: Check open issues (if GitHub CLI available)

```bash
echo ""
echo "--- Open GitHub Issues ---"
gh issue list --limit 15 2>/dev/null || echo "(GitHub CLI not available)"

echo ""
echo "--- Open PRs ---"
gh pr list --limit 10 2>/dev/null || echo "(GitHub CLI not available)"
```

## Step 4: Create sprint plan

Based on your analysis, create a prioritized sprint plan:

```bash
cat > ".claude/workspace/sprints/$SPRINT_ID/plan.md" << 'PLANEOF'
# Sprint Plan

**Sprint ID:** SPRINT_ID_HERE
**Created:** DATE_HERE

## High Priority (must complete)

1. **[Feature/Bug/Debt]**: [description]
   - Files: [affected files]
   - Estimate: [hours]

2. **[Feature/Bug/Debt]**: [description]
   - Files: [affected files]
   - Estimate: [hours]

## Medium Priority (should complete)

3. **[Item]**: [description]
4. **[Item]**: [description]

## Low Priority (if time permits)

5. **[Item]**: [description]

## Total Estimated Hours: X

PLANEOF
```

Now EDIT that file with actual items from your analysis. Replace placeholders with real work items.

## Step 5: Display the plan

```bash
echo ""
echo "=========================================="
echo "SPRINT PLAN CREATED"
echo "=========================================="
cat ".claude/workspace/sprints/$SPRINT_ID/plan.md"
echo "=========================================="
```

## Step 6: Tell user next steps

```
Sprint plan saved to: .claude/workspace/sprints/[sprint_id]/plan.md

TO EXECUTE SPRINT ITEMS:
- For features: /ship-feature [description]
- For bugs: /debug-and-fix [description]  
- For audits: /full-audit

Each command will create tasks for workers to process.
```

STOP here.
