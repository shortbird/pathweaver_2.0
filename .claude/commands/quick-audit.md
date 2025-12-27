---
name: quick-audit
description: Fast pre-merge check covering security, code quality, and tests.
model: sonnet
---

Run a focused pre-merge audit:

1. **Code Review** - Check the recent git diff for issues
2. **Security Quick Scan** - Auth, injection, secrets exposure  
3. **Test Coverage** - Verify critical paths are tested

Output a brief pass/fail summary with blocking issues only.