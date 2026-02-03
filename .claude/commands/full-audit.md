---
name: full-audit
description: Creates audit tasks for worker agents. Does NOT run audits itself.
model: sonnet
---

Create 8 audit task files in the work queue, then stop.

DO NOT run any audits yourself. ONLY create the JSON files below.

## Step 1: Create directories

```bash
mkdir -p .claude/workspace/queue .claude/workspace/active .claude/workspace/completed
```

## Step 2: Create these 7 files

Create file `.claude/workspace/queue/audit_1_security.json`:
```json
{
  "id": "audit_1_security",
  "type": "security_audit",
  "description": "Find hardcoded secrets, SQL injection, XSS, dangerous functions. Use grep to search."
}
```

Create file `.claude/workspace/queue/audit_2_performance.json`:
```json
{
  "id": "audit_2_performance",
  "type": "performance_audit",
  "description": "Find large files, N+1 queries, nested loops, missing caching."
}
```

Create file `.claude/workspace/queue/audit_3_accessibility.json`:
```json
{
  "id": "audit_3_accessibility",
  "type": "accessibility_audit",
  "description": "Find missing alt text, ARIA labels, keyboard handlers in TSX/JSX files."
}
```

Create file `.claude/workspace/queue/audit_4_quality.json`:
```json
{
  "id": "audit_4_quality",
  "type": "code_quality_audit",
  "description": "Find TODOs, FIXMEs, large functions, deep nesting, poor error handling."
}
```

Create file `.claude/workspace/queue/audit_5_architecture.json`:
```json
{
  "id": "audit_5_architecture",
  "type": "architecture_audit",
  "description": "Analyze module structure, find god classes, check separation of concerns."
}
```

Create file `.claude/workspace/queue/audit_6_tests.json`:
```json
{
  "id": "audit_6_tests",
  "type": "test_audit",
  "description": "Find missing tests, skipped tests, files without test coverage."
}
```

Create file `.claude/workspace/queue/audit_7_legal.json`:
```json
{
  "id": "audit_7_legal",
  "type": "legal_audit",
  "description": "Check LICENSE file, dependency licenses, PII handling, GDPR/FERPA patterns."
}
```

Create file `.claude/workspace/queue/audit_8_claude_md.json`:
```json
{
  "id": "audit_8_claude_md",
  "type": "documentation_audit",
  "description": "Audit claude.md for accuracy and optimization. Check: 1) Table names match actual database schema, 2) File paths exist and are correct, 3) API endpoints documented match actual routes, 4) Environment variables are current, 5) Recent changes section is up to date, 6) No outdated/removed features documented, 7) Instructions are clear and actionable for AI agents."
}
```

## Step 3: Confirm creation

```bash
echo "Queue contents:" && ls -1 .claude/workspace/queue/
```

## Step 4: Tell the user

Print this message:

```
Created 8 audit tasks in queue.

NEXT STEPS:
1. Run /work-queue in Terminal 2
2. Run /work-queue in Terminal 3  
3. Run /work-queue in Terminal 4
4. Wait for workers to say "Queue empty"
5. Come back here and run: /compile-audit
```

## STOP

Do not continue. Do not run any audits. Just create the files and print the message above.
