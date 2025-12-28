---
name: cleanup
description: Cleans up completed tasks and old workspace files. Run periodically to keep things organized.
model: haiku
---

Clean up the workspace by removing completed tasks and stale files.

## Show current state

```bash
echo "=== Workspace Status ==="
echo "Queue: $(ls .claude/workspace/queue/*.json 2>/dev/null | wc -l) files"
echo "Active: $(ls .claude/workspace/active/*.json 2>/dev/null | wc -l) files"
echo "Completed: $(ls .claude/workspace/completed/*.json 2>/dev/null | wc -l) files"
echo ""
echo "Completed tasks:"
ls -1 .claude/workspace/completed/*.json 2>/dev/null | head -20
```

## Clean completed tasks

```bash
rm -f .claude/workspace/completed/*.json
echo "✅ Cleared completed tasks"
```

## Clean stale locks (older than 1 hour)

```bash
find .claude/workspace/locks -type f -mmin +60 -delete 2>/dev/null
echo "✅ Cleared stale locks"
```

## Clean old logs (older than 7 days)

```bash
find .claude/workspace/logs -type f -mtime +7 -delete 2>/dev/null
echo "✅ Cleared old logs"
```

## Confirm

```bash
echo ""
echo "=== Cleanup Complete ==="
echo "Queue: $(ls .claude/workspace/queue/*.json 2>/dev/null | wc -l) files"
echo "Active: $(ls .claude/workspace/active/*.json 2>/dev/null | wc -l) files"
echo "Completed: $(ls .claude/workspace/completed/*.json 2>/dev/null | wc -l) files"
```
