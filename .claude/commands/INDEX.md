# Autonomous Development Management System

## Complete Agent Index

**Total Agents:** 41 command files

---

## Master Orchestrators (6)

High-level commands that coordinate multiple agents for complex workflows.

| Command | Description | Use When |
|---------|-------------|----------|
| `/dev-session` | Start a full development session | Beginning of workday |
| `/ship-feature` | End-to-end feature delivery | New feature from idea to production |
| `/fix-production` | Emergency production hotfix | Production is broken |
| `/health-check` | Comprehensive system health | Regular checkups |
| `/sprint-start` | Initialize new sprint | Sprint planning |
| `/release` | Cut a new release | Ready to ship |

---

## Deployment Suite (5)

| Command | Description |
|---------|-------------|
| `/deploy-orchestrator` | Deploy to any environment (dev/staging/prod) |
| `/migration-runner` | Run database migrations safely |
| `/rollback-agent` | Revert a deployment |
| `/release-manager` | Version and release management |
| `/changelog-writer` | Generate changelogs |

---

## Code Health Suite (5)

| Command | Description |
|---------|-------------|
| `/tech-debt-scanner` | Find and prioritize technical debt |
| `/refactor-executor` | Execute refactoring plans |
| `/dependency-updater` | Update dependencies with testing |
| `/test-generator` | Generate comprehensive tests |
| `/pr-creator` | Create well-documented PRs |

---

## Intelligence Suite (4)

| Command | Description |
|---------|-------------|
| `/codebase-mapper` | Map entire codebase structure |
| `/impact-analyzer` | Predict impact of changes |
| `/pattern-detector` | Detect patterns and anti-patterns |
| `/bug-predictor` | Predict likely bug locations |

---

## Team Support Suite (4)

| Command | Description |
|---------|-------------|
| `/codebase-explainer` | Explain any code in detail |
| `/pr-reviewer` | Autonomous code reviews |
| `/doc-maintainer` | Keep documentation current |
| `/runbook-creator` | Create operational runbooks |

---

## Planning Suite (4)

| Command | Description |
|---------|-------------|
| `/sprint-planner` | Plan sprint work |
| `/estimate-generator` | Generate time estimates |
| `/backlog-groomer` | Prioritize backlog items |
| `/spec-writer` | Write technical specs |

---

## Audit Suite (10) - Previously Created

| Command | Description |
|---------|-------------|
| `/full-audit` | Comprehensive codebase audit |
| `/quick-audit` | Fast pre-merge check |
| `/architect-reviewer` | Architecture review |
| `/code-reviewer` | Code quality review |
| `/security-auditor` | Security audit |
| `/legal-risk-analyzer` | Legal/compliance review |
| `/performance-analyst` | Performance analysis |
| `/accessibility-auditor` | Accessibility audit |
| `/api-design-reviewer` | API design review |
| `/test-strategy-analyst` | Test coverage analysis |

---

## Feature Development Suite (7) - Previously Created

| Command | Description |
|---------|-------------|
| `/new-feature` | Feature development pipeline |
| `/product-manager` | Create PRDs and user stories |
| `/ux-strategist` | Design user flows |
| `/technical-architect` | Technical architecture |
| `/risk-assessor` | Risk assessment |
| `/implementation-planner` | Task breakdown |
| `/code-generator` | Generate implementation code |

---

## Debugging Suite (6) - Previously Created

| Command | Description |
|---------|-------------|
| `/debug-and-fix` | End-to-end debugging pipeline |
| `/debug-issue` | Orchestrated debugging |
| `/error-hunter` | Find error locations |
| `/root-cause-analyzer` | Trace root cause |
| `/fix-generator` | Implement fixes |
| `/verify-and-push` | Test and push fixes |

---

## Worker Agent (1)

| Command | Description |
|---------|-------------|
| `/work-queue` | Process work items from queue |

---

## Support Files (2)

| File | Description |
|------|-------------|
| `_coordination.md` | Multi-agent coordination infrastructure |
| `SETUP.md` | Complete setup instructions |

---

## Quick Reference

### Daily Workflow

```bash
# Start your day
/dev-session

# Work on a feature
/ship-feature Add notification system

# Fix a bug
/debug-and-fix Users can't login

# End of day health check
/health-check
```

### Sprint Workflow

```bash
# Start sprint
/sprint-start

# During sprint - workers process tasks
/work-queue

# End sprint - release
/release
```

### Emergency Workflow

```bash
# Production is down!
/fix-production 500 errors on checkout

# If fix makes it worse
/rollback-agent [deploy_id]
```

---

## Multi-Agent Optimization

### Recommended Terminal Configuration

| Terminals | Configuration |
|-----------|---------------|
| **1** | Simple tasks, single agent |
| **2** | Feature work (orchestrator + worker) |
| **4** | Full productivity (recommended) |
| **6** | Large features, parallel streams |

### 4-Terminal Setup (Recommended)

```
┌─────────────────────┬─────────────────────┐
│   T1: Orchestrator  │   T2: Backend       │
│   /ship-feature     │   /work-queue       │
│   /sprint-start     │                     │
│   /release          │                     │
├─────────────────────┼─────────────────────┤
│   T3: Frontend      │   T4: Quality       │
│   /work-queue       │   /work-queue       │
│                     │   /pr-reviewer      │
│                     │   /full-audit       │
└─────────────────────┴─────────────────────┘
```

### Task Distribution

When running orchestrators, work is automatically distributed:

1. Orchestrator creates work items in `.claude/workspace/queue/`
2. Workers claim items atomically (no duplicates)
3. Workers execute and mark complete
4. Orchestrator integrates results

---

## Files Location

After setup, all agents live in:
```
.claude/commands/
├── *.md (all agent files)
└── 

.claude/workspace/
├── queue/      # Pending work items
├── active/     # Work in progress
├── completed/  # Finished work
├── locks/      # Resource locks
├── state/      # Shared state
└── logs/       # Activity logs
```
