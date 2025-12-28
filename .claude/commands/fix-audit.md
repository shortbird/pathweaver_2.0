---
name: fix-audit
description: Creates fix tasks from audit findings. Workers will implement the fixes.
model: opus
---

You read audit findings and create fix tasks for workers to implement.

## Step 1: Find the latest findings file

```bash
FINDINGS_FILE=$(ls -t .claude/workspace/audits/findings_*.json 2>/dev/null | head -1)
if [ -z "$FINDINGS_FILE" ]; then
    echo "No findings file found. Run /compile-audit first."
    exit 1
fi
echo "Using: $FINDINGS_FILE"
```

## Step 2: Read and display findings

```bash
echo ""
echo "=== FINDINGS SUMMARY ==="
echo "Total: $(grep -c '"issue"' "$FINDINGS_FILE")"
echo ""
cat "$FINDINGS_FILE"
```

## Step 3: Create fix tasks

For each finding, create a specific fix task. Prioritize by severity.

**Create critical fix tasks first:**

```bash
echo ""
echo "Creating fix tasks..."

# Read each finding and create a task
TASK_NUM=1

# Critical first
for finding in $(grep -o '{[^}]*"severity":"critical"[^}]*}' "$FINDINGS_FILE" | head -5); do
    FILE=$(echo "$finding" | grep -o '"file":"[^"]*"' | cut -d'"' -f4)
    LINE=$(echo "$finding" | grep -o '"line":[0-9]*' | cut -d':' -f2)
    ISSUE=$(echo "$finding" | grep -o '"issue":"[^"]*"' | cut -d'"' -f4)
    DESC=$(echo "$finding" | grep -o '"description":"[^"]*"' | cut -d'"' -f4)
    
    cat > ".claude/workspace/queue/fix_${TASK_NUM}_critical.json" << EOF
{
  "id": "fix_${TASK_NUM}_critical",
  "type": "implement_fix",
  "priority": 1,
  "payload": {
    "severity": "critical",
    "file": "$FILE",
    "line": $LINE,
    "issue": "$ISSUE",
    "description": "$DESC",
    "instructions": "Fix this critical issue. Read the file, understand the problem, implement a fix, and verify it works."
  }
}
EOF
    echo "✓ Created: fix_${TASK_NUM}_critical.json ($FILE:$LINE - $ISSUE)"
    TASK_NUM=$((TASK_NUM + 1))
done
```

**Then medium severity:**

```bash
for finding in $(grep -o '{[^}]*"severity":"medium"[^}]*}' "$FINDINGS_FILE" | head -5); do
    FILE=$(echo "$finding" | grep -o '"file":"[^"]*"' | cut -d'"' -f4)
    LINE=$(echo "$finding" | grep -o '"line":[0-9]*' | cut -d':' -f2)
    ISSUE=$(echo "$finding" | grep -o '"issue":"[^"]*"' | cut -d'"' -f4)
    DESC=$(echo "$finding" | grep -o '"description":"[^"]*"' | cut -d'"' -f4)
    
    cat > ".claude/workspace/queue/fix_${TASK_NUM}_medium.json" << EOF
{
  "id": "fix_${TASK_NUM}_medium",
  "type": "implement_fix",
  "priority": 2,
  "payload": {
    "severity": "medium",
    "file": "$FILE",
    "line": $LINE,
    "issue": "$ISSUE",
    "description": "$DESC",
    "instructions": "Fix this issue. Read the file, understand the problem, implement a fix."
  }
}
EOF
    echo "✓ Created: fix_${TASK_NUM}_medium.json ($FILE:$LINE - $ISSUE)"
    TASK_NUM=$((TASK_NUM + 1))
done
```

## Step 4: Confirm and instruct

```bash
echo ""
echo "=========================================="
echo "✅ FIX TASKS CREATED"
echo "=========================================="
ls -1 .claude/workspace/queue/fix_*.json 2>/dev/null
echo ""
echo "Total: $(ls .claude/workspace/queue/fix_*.json 2>/dev/null | wc -l) fix tasks"
echo "=========================================="
```

Tell user:

```
Fix tasks are queued.

NEXT STEPS:
1. Run /work-queue in T2, T3, T4
2. Workers will implement fixes automatically
3. When done, run /verify-fixes
```

STOP here.
