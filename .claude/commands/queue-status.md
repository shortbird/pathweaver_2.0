---
name: queue-status
description: Shows current state of the work queue. See what's pending, active, and completed.
model: haiku
---

Show the current state of the work queue.

```bash
echo "=========================================="
echo "WORK QUEUE STATUS"
echo "=========================================="
echo ""

echo "📋 QUEUED (waiting for workers):"
ls -1 .claude/workspace/queue/*.json 2>/dev/null || echo "  (empty)"
QUEUED=$(ls .claude/workspace/queue/*.json 2>/dev/null | wc -l)

echo ""
echo "🔄 ACTIVE (being processed):"
ls -1 .claude/workspace/active/*.json 2>/dev/null || echo "  (empty)"
ACTIVE=$(ls .claude/workspace/active/*.json 2>/dev/null | wc -l)

echo ""
echo "✅ COMPLETED:"
ls -1 .claude/workspace/completed/*.json 2>/dev/null | tail -10 || echo "  (empty)"
COMPLETED=$(ls .claude/workspace/completed/*.json 2>/dev/null | wc -l)

echo ""
echo "=========================================="
echo "Summary: $QUEUED queued | $ACTIVE active | $COMPLETED completed"
echo "=========================================="
```

If there are queued tasks, show their details:

```bash
if [ $QUEUED -gt 0 ]; then
    echo ""
    echo "Queued task details:"
    for f in .claude/workspace/queue/*.json; do
        echo "--- $(basename $f) ---"
        cat "$f" | head -10
        echo ""
    done
fi
```

Then tell user:

```
Commands:
- /work-queue     → Process queued tasks (run in worker terminals)
- /queue-fix      → Add more fix tasks
- /cleanup        → Clear completed tasks
```
