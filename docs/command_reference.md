# Autonomous Development Management System
## Master Command Reference

---

## How Multi-Agent Works

| Step | Terminal | What Happens |
|------|----------|--------------|
| 1 | T1 | Run orchestrator (`/full-audit`, `/ship-feature`) |
| 2 | T1 | Creates queue items, then STOPS |
| 3 | T2-T4 | Run `/work-queue` in each |
| 4 | T2-T4 | Workers process ALL tasks automatically |
| 5 | T2-T4 | Workers say "Queue empty" when done |
| 6 | T1 | Run compiler (`/compile-audit`, `/integrate-feature`) |

**Your manual actions:** Start orchestrator → Start workers → Run compiler

---

## Daily Workflow

| Command | When to Use |
|---------|-------------|
| `/dev-session` | Start of workday - pulls latest, runs tests, checks health |
| `/health-check` | Quick health check + optional deeper audit via workers |
| `/quick-audit` | Before any commit or merge (runs solo, no workers) |

---
Complete Audit-to-Fix Flow
T1: /full-audit           → Creates 7 audit tasks
T2: /work-queue           → Runs audits
T3: /work-queue           → Runs audits  
T4: /work-queue           → Runs audits
[Workers say "Queue empty"]

T1: /compile-audit        → Scans code, saves findings.json

T1: /fix-audit            → Creates fix tasks from findings
T2: /work-queue           → Implements fixes
T3: /work-queue           → Implements fixes
T4: /work-queue           → Implements fixes
[Workers say "Queue empty"]

T1: /verify-fixes         → Runs tests, confirms fixes worked
T1: git add -A && git commit -m "fix: audit fixes"

## Feature Development

| Command | When to Use |
|---------|-------------|
| `/ship-feature [description]` | Create tasks for feature → workers build → integrate |
| `/integrate-feature` | After workers finish, merge and create PR |
| `/new-feature [description]` | Plan a feature (PRD, architecture, tasks) - solo |
| `/impact-analyzer [file or change]` | Before making changes - see what's affected - solo |
| `/test-generator [file]` | Add tests to existing code - solo |
| `/pr-creator [base-branch]` | Create a polished PR - solo |

### Ship Feature Flow
```
T1: /ship-feature Add notifications for quest completion
    → Creates 4 queue tasks (backend, frontend, tests, docs)
    → STOPS

T2: /work-queue  → Claims and builds backend
T3: /work-queue  → Claims and builds frontend  
T4: /work-queue  → Claims and writes tests, then docs

[Workers say "Queue empty"]

T1: /integrate-feature
    → Merges all work, runs tests, creates PR
```

---

## Bug Fixing

| Command | When to Use |
|---------|-------------|
| `/debug-and-fix [error]` | Complete debug → fix → push pipeline |
| `/fix-production [error]` | **EMERGENCY** - production is down |
| `/error-hunter [symptom]` | Just find where the bug is |
| `/root-cause-analyzer [file:line]` | Understand why a bug exists |

### Examples
```
/debug-and-fix Users getting 500 error on login
/fix-production Checkout page returning blank screen
/error-hunter "TypeError: Cannot read property 'id' of undefined"
```

---

## Code Quality

| Command | When to Use |
|---------|-------------|
| `/full-audit` | Create 7 audit tasks → workers process → compile results |
| `/compile-audit` | After workers finish audits, compile the report |
| `/quick-audit` | Fast pre-merge sanity check (solo, no workers) |
| `/pr-reviewer [branch]` | Review someone's code (solo) |
| `/tech-debt-scanner` | Find and prioritize tech debt (solo) |

### Full Audit Flow
```
T1: /full-audit
    → Creates 7 audit queue tasks
    → STOPS

T2: /work-queue  → Runs security + performance audits
T3: /work-queue  → Runs accessibility + quality audits
T4: /work-queue  → Runs architecture + test + legal audits

[Workers say "Queue empty"]

T1: /compile-audit
    → Gathers all findings into prioritized report
```

---

## Understanding Code

| Command | When to Use |
|---------|-------------|
| `/codebase-explainer [file or topic]` | Understand unfamiliar code |
| `/codebase-mapper` | Map entire codebase structure |

### Examples
```
/codebase-explainer backend/services/auth.py
/codebase-explainer "How does the quest system work?"
/codebase-explainer src/components/
```

---

## Sprint & Planning

| Command | When to Use |
|---------|-------------|
| `/sprint-start` | Beginning of sprint - groom, estimate, plan |
| `/estimate-generator [task]` | Get time estimates |
| `/backlog-groomer` | Prioritize backlog |
| `/spec-writer [feature]` | Write technical spec |

---

## Releases & Deployment

| Command | When to Use |
|---------|-------------|
| `/release` | Cut a new version (changelog, tag, deploy) |
| `/deploy-orchestrator [env]` | Deploy to specific environment |
| `/rollback-agent [deploy_id]` | Revert a bad deployment |
| `/changelog-writer` | Generate changelog from commits |

### Examples
```
/release
/deploy-orchestrator staging
/deploy-orchestrator production v1.2.3
/rollback-agent deploy_production_20240115_143022
```

---

## Multi-Agent (Worker Terminals)

| Command | When to Use |
|---------|-------------|
| `/work-queue` | Run in T2-T4 to process ALL tasks until queue empty |
| `/compile-audit` | After audit workers finish, compile report |
| `/integrate-feature` | After feature workers finish, merge and PR |

### Worker Behavior
- Processes ALL queue items automatically
- No human input needed once started
- Says "Queue empty" when done
- Just start it and let it run

---

## Quick Copy-Paste Starters

```bash
# === SOLO COMMANDS (T1 only) ===
/dev-session              # Morning startup
/quick-audit              # Before merging
/debug-and-fix [error]    # Fix a bug
/codebase-explainer [file]  # Understand code

# === MULTI-AGENT FLOW ===

# Full Audit (T1 → T2-T4 → T1)
T1: /full-audit
T2: /work-queue
T3: /work-queue
T4: /work-queue
[wait for "Queue empty"]
T1: /compile-audit

# Ship Feature (T1 → T2-T4 → T1)
T1: /ship-feature Add notifications for quest completion
T2: /work-queue
T3: /work-queue
T4: /work-queue
[wait for "Queue empty"]
T1: /integrate-feature

# Health Check with Deep Scan
T1: /health-check
T2: /work-queue
[optional: /compile-audit]
```

---

## Optio-Specific Suggestions

```bash
# Quest system work
/ship-feature Add XP multiplier for streak bonuses
/codebase-explainer "How does quest completion trigger badge awards?"

# Student portfolio
/ship-feature Auto-populate portfolio when quest artifacts are submitted
/impact-analyzer "Add portfolio_items table"

# Parent features
/new-feature Parent notification preferences dashboard

# LMS integration
/ship-feature OnFire Spark LMS grade sync webhook
```

---

## Complete Agent Inventory

### Master Orchestrators (6)
- `/dev-session` - Start development session
- `/ship-feature` - End-to-end feature delivery
- `/fix-production` - Emergency hotfix
- `/health-check` - System health assessment
- `/sprint-start` - Initialize sprint
- `/release` - Cut new release

### Deployment Suite (5)
- `/deploy-orchestrator` - Deploy to any environment
- `/migration-runner` - Run database migrations
- `/rollback-agent` - Revert deployment
- `/release-manager` - Version management
- `/changelog-writer` - Generate changelog

### Code Health Suite (5)
- `/tech-debt-scanner` - Find technical debt
- `/refactor-executor` - Execute refactoring
- `/dependency-updater` - Update dependencies
- `/test-generator` - Generate tests
- `/pr-creator` - Create pull requests

### Intelligence Suite (4)
- `/codebase-mapper` - Map codebase structure
- `/impact-analyzer` - Predict change impact
- `/pattern-detector` - Detect patterns
- `/bug-predictor` - Predict bug locations

### Team Support Suite (4)
- `/codebase-explainer` - Explain code
- `/pr-reviewer` - Review code
- `/doc-maintainer` - Maintain docs
- `/runbook-creator` - Create runbooks

### Planning Suite (4)
- `/sprint-planner` - Plan sprints
- `/estimate-generator` - Generate estimates
- `/backlog-groomer` - Groom backlog
- `/spec-writer` - Write specs

### Audit Suite (10)
- `/full-audit` - Comprehensive audit
- `/quick-audit` - Fast pre-merge check
- `/architect-reviewer` - Architecture review
- `/code-reviewer` - Code quality review
- `/security-auditor` - Security audit
- `/legal-risk-analyzer` - Legal/compliance
- `/performance-analyst` - Performance analysis
- `/accessibility-auditor` - Accessibility audit
- `/api-design-reviewer` - API design review
- `/test-strategy-analyst` - Test coverage

### Feature Development Suite (7)
- `/new-feature` - Feature pipeline
- `/product-manager` - PRDs and user stories
- `/ux-strategist` - Design user flows
- `/technical-architect` - Technical architecture
- `/risk-assessor` - Risk assessment
- `/implementation-planner` - Task breakdown
- `/code-generator` - Generate code

### Debugging Suite (6)
- `/debug-and-fix` - End-to-end debugging
- `/debug-issue` - Orchestrated debugging
- `/error-hunter` - Find error locations
- `/root-cause-analyzer` - Trace root cause
- `/fix-generator` - Implement fixes
- `/verify-and-push` - Test and push

### Worker (1)
- `/work-queue` - Process distributed tasks