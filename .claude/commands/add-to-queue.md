---
name: add-to-queue
description: Converts current context, issues, or to-do lists into queue tasks for parallel workers. Call anytime to parallelize work.
model: sonnet
---

You convert the current conversation context into actionable queue tasks for worker agents.

## How This Works

The user calls `/add-to-queue` during a conversation. You:
1. Review the current context (issues discussed, to-do lists, findings, errors, etc.)
2. Break it into discrete, parallelizable tasks
3. Create JSON task files in `.claude/workspace/queue/`
4. Tell user to start workers

## Step 1: Ensure queue directory exists

```bash
mkdir -p .claude/workspace/queue
```

## Step 2: Identify tasks from context

Look at the current conversation for:
- To-do lists or checklists
- Audit findings that need fixing
- Multiple files that need similar changes
- Features that can be split (backend/frontend/tests)
- Errors or issues to investigate
- Refactoring targets
- Any list of discrete work items

## Step 3: Create task files

For EACH discrete task, create a JSON file:

```bash
cat > ".claude/workspace/queue/task_$(date +%s%N | cut -c1-13).json" << 'EOF'
{
  "id": "descriptive_task_id",
  "type": "task_type",
  "priority": 1,
  "payload": {
    "description": "SPECIFIC instructions for what to do",
    "files": ["list", "of", "relevant", "files"],
    "context": "Any additional context needed"
  }
}
EOF
```

### Task Types (use appropriate one)

| Type | When to Use |
|------|-------------|
| `implement_fix` | Fix a specific issue in a file |
| `implement_backend` | Create/modify backend code |
| `implement_frontend` | Create/modify frontend code |
| `write_tests` | Add tests for code |
| `write_docs` | Add documentation |
| `refactor` | Restructure/improve code |
| `investigate` | Research an issue, report findings |
| `security_audit` | Security-focused review |
| `performance_audit` | Performance-focused review |
| `accessibility_audit` | A11y-focused review |
| `code_quality_audit` | Quality-focused review |

### Priority Levels

- `1` = Critical (do first)
- `2` = High (do soon)
- `3` = Medium (normal)
- `4` = Low (if time permits)

## Step 4: Confirm what was created

```bash
echo ""
echo "=========================================="
echo "TASKS ADDED TO QUEUE"
echo "=========================================="
echo ""
for f in .claude/workspace/queue/*.json; do
    if [ -f "$f" ]; then
        echo "--- $(basename $f) ---"
        cat "$f" | head -15
        echo ""
    fi
done
echo "=========================================="
echo "Total tasks: $(ls .claude/workspace/queue/*.json 2>/dev/null | wc -l)"
echo "=========================================="
```

## Step 5: Tell user next steps

```
✅ [N] tasks added to queue.

To process these tasks:
1. Open additional terminal windows
2. Run /work-queue in each worker terminal
3. Workers will process tasks automatically

Or continue adding more with /add-to-queue
Check status anytime with /queue-status
```

## Examples

### Example 1: From a to-do list

User's context has:
```
To-do:
- Fix auth bug in login.py
- Add tests for UserService
- Update README with new API endpoints
```

You create 3 tasks:
1. `implement_fix` for auth bug
2. `write_tests` for UserService
3. `write_docs` for README

### Example 2: From audit findings

User's context has:
```
Audit found:
- 3 large files needing refactor
- 5 TODOs to implement
- 2 security issues
```

You create 10 tasks with appropriate types and priorities (security = priority 1).

### Example 3: From feature discussion

User's context has:
```
Let's add email notifications:
- Backend: notification service + API endpoints
- Frontend: notification bell component
- Tests for both
```

You create 4 tasks:
1. `implement_backend` - notification service
2. `implement_backend` - API endpoints  
3. `implement_frontend` - bell component
4. `write_tests` - notification tests

### Example 4: From error investigation

User's context has:
```
Getting 500 errors on:
- /api/quests endpoint
- /api/tasks endpoint
- /api/badges endpoint
```

You create 3 `investigate` tasks, one per endpoint.

## Important Notes

- Make each task SPECIFIC and ACTIONABLE
- Include file paths when known
- Include enough context that a worker can execute without asking questions
- Prefer more small tasks over fewer large tasks (better parallelization)
- Don't create tasks for things that need sequential execution

STOP after creating tasks. Do not process them yourself.