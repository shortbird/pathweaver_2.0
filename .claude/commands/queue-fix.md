---
name: queue-fix
description: Add specific fix tasks to the queue. Use when you want workers to fix particular issues.
model: sonnet
---

You help the user add specific fix tasks to the work queue.

## How to Use

The user will describe what they want fixed. Create a task for it.

## Step 1: Understand the request

Read what the user wants fixed. It might be:
- "Fix the 3 large architecture files"
- "Refactor backend/services/quest_service.py - it's 450 lines"
- "Split AdminDashboard.tsx into smaller components"
- "Fix the remaining TODOs in auth module"

## Step 2: Analyze if needed

If the user's request is vague, examine the files:

```bash
# For large files
wc -l [file] 
head -50 [file]

# For TODOs
grep -n "TODO\|FIXME" [file]
```

## Step 3: Create specific fix task(s)

```bash
mkdir -p .claude/workspace/queue
```

For each fix, create a task with SPECIFIC instructions:

```bash
cat > ".claude/workspace/queue/fix_$(date +%s)_[name].json" << 'EOF'
{
  "id": "fix_[descriptive_name]",
  "type": "implement_fix",
  "priority": 2,
  "payload": {
    "file": "[exact/file/path]",
    "issue": "[issue_type]",
    "description": "[SPECIFIC instructions for what to do]"
  }
}
EOF
echo "✓ Created fix task"
```

**Issue types:**
- `large_file` - Split into smaller modules
- `refactor` - Restructure code
- `todo` - Implement TODO items
- `performance` - Optimize code
- `security` - Fix security issue
- `accessibility` - Fix a11y issue
- `test_coverage` - Add missing tests

## Step 4: Show what was queued

```bash
echo ""
echo "=== Tasks Queued ==="
ls -1 .claude/workspace/queue/*.json 2>/dev/null
echo ""
echo "Total: $(ls .claude/workspace/queue/*.json 2>/dev/null | wc -l)"
```

## Step 5: Tell user

```
✅ Fix task(s) added to queue.

Run /work-queue in worker terminals to process.
Run /queue-fix again to add more tasks.
Run /verify-fixes when done.
```

## Examples

**User says:** "Fix the large files from the audit"

You would:
1. Find the large files: `find . -name "*.py" -o -name "*.ts" | xargs wc -l | sort -rn | head -5`
2. Create a task for each with specific refactoring instructions

**User says:** "Refactor QuestService.py"

You would:
1. Read the file to understand its structure
2. Create a task with specific instructions like "Split into QuestService (core), QuestValidator, QuestNotifier"

**User says:** "Fix remaining TODOs in frontend/components"

You would:
1. Find them: `grep -rn "TODO" frontend/components/`
2. Create tasks for each meaningful TODO

STOP after creating tasks. Do not implement fixes yourself.
