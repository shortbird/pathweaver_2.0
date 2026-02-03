---
name: health-check
description: Quick system health check. Distributes audit tasks to workers for parallel processing.
model: opus
---

You are checking system health. Execute commands, create queue items, then EXIT.

## STEP 1: Quick direct checks

Execute these immediately:

```bash
echo "=== Git Status ==="
git status --short 2>/dev/null | head -10
echo ""
echo "Branch: $(git branch --show-current 2>/dev/null)"
echo "Behind remote: $(git rev-list --count HEAD..origin/$(git branch --show-current) 2>/dev/null || echo 'unknown')"
```

```bash
echo "=== Test Status ==="
if [ -f "pytest.ini" ] || [ -f "pyproject.toml" ]; then
    pytest --collect-only -q 2>/dev/null | tail -3
elif [ -f "package.json" ]; then
    echo "Run: npm test"
fi
```

```bash
echo "=== Dependencies ==="
if [ -f "package.json" ]; then
    npm outdated 2>/dev/null | head -10 || echo "Dependencies OK"
fi
if [ -f "requirements.txt" ]; then
    pip list --outdated 2>/dev/null | head -10 || echo "Dependencies OK"
fi
```

```bash
echo "=== Code Stats ==="
echo "Python files: $(find . -name '*.py' 2>/dev/null | grep -v __pycache__ | grep -v venv | wc -l)"
echo "TypeScript files: $(find . -name '*.ts' -o -name '*.tsx' 2>/dev/null | grep -v node_modules | wc -l)"
echo "TODOs: $(grep -rn 'TODO\|FIXME' --include='*.py' --include='*.ts' 2>/dev/null | grep -v node_modules | grep -v venv | wc -l)"
```

## STEP 2: Create audit queue items for deeper checks

Execute:

```bash
mkdir -p .claude/workspace/queue

cat > ".claude/workspace/queue/health_security.json" << 'EOF'
{"id": "health_security", "type": "security_audit", "priority": 1, "payload": {"description": "Quick security scan: Check for hardcoded secrets and obvious vulnerabilities."}}
EOF

cat > ".claude/workspace/queue/health_quality.json" << 'EOF'
{"id": "health_quality", "type": "code_quality_audit", "priority": 2, "payload": {"description": "Quick quality scan: Count TODOs, find large files, check for obvious issues."}}
EOF

cat > ".claude/workspace/queue/health_tests.json" << 'EOF'
{"id": "health_tests", "type": "test_coverage_audit", "priority": 2, "payload": {"description": "Quick test scan: Check test count and find obviously untested files."}}
EOF

echo "✅ Created 3 health check tasks"
ls -1 .claude/workspace/queue/health_*.json
```

## STEP 3: Tell user next steps

Say:

---

**Quick health check complete. Summary above.**

**For deeper analysis, start workers:**
```
/work-queue
```

**Then compile results:**
```
/compile-audit
```

---

STOP here.
