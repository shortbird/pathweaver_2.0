# Autonomous Development Management System

## Complete Setup Guide

This guide covers setting up the full autonomous development management system with multi-agent coordination for parallel execution.

---

## Prerequisites

- Claude Code CLI installed (`npm install -g @anthropic-ai/claude-code`)
- Git configured
- Project repository cloned
- Terminal multiplexer (tmux recommended) or multiple terminal windows

---

## Quick Start

### 1. Install Agent Files

Copy all `.md` files from this package to your project's `.claude/commands/` directory:

```bash
mkdir -p .claude/commands
cp /path/to/agents/*.md .claude/commands/
```

### 2. Initialize Workspace

```bash
# Create coordination directories
mkdir -p .claude/workspace/{queue,active,completed,locks,state,logs}
mkdir -p .claude/config

# Initialize state
echo '{"initialized": true, "agents": {}}' > .claude/workspace/state/system.json
echo '[]' > .claude/workspace/state/agents.json
touch .claude/workspace/state/broadcast.log

# Add to .gitignore
echo ".claude/workspace/" >> .gitignore
```

### 3. Start Agents

Open 4 terminal windows/panes and run in each:

```bash
# Terminal 1 (Primary - Orchestrator)
claude --dangerously-skip-permissions

# Terminal 2 (Worker 1)
claude --dangerously-skip-permissions

# Terminal 3 (Worker 2)
claude --dangerously-skip-permissions

# Terminal 4 (Worker 3)
claude --dangerously-skip-permissions
```

---

## Terminal Configuration

### Recommended: tmux Setup

Create a tmux session with 4 panes:

```bash
# Create session
tmux new-session -d -s dev

# Split into 4 panes
tmux split-window -h
tmux split-window -v
tmux select-pane -t 0
tmux split-window -v

# Start Claude in each pane
tmux send-keys -t 0 'claude --dangerously-skip-permissions' C-m
tmux send-keys -t 1 'claude --dangerously-skip-permissions' C-m
tmux send-keys -t 2 'claude --dangerously-skip-permissions' C-m
tmux send-keys -t 3 'claude --dangerously-skip-permissions' C-m

# Attach to session
tmux attach -t dev
```

### tmux Quick Reference

| Key | Action |
|-----|--------|
| `Ctrl+b, arrow` | Switch panes |
| `Ctrl+b, z` | Zoom current pane |
| `Ctrl+b, d` | Detach (agents keep running) |
| `tmux attach -t dev` | Reattach |

---

## Agent Assignment Strategy

### 4-Terminal Optimal Configuration

| Terminal | Role | Agents | Focus |
|----------|------|--------|-------|
| **T1** | Orchestrator | Master orchestrators | Coordination, planning, oversight |
| **T2** | Backend Worker | Backend-focused agents | APIs, database, server code |
| **T3** | Frontend Worker | Frontend-focused agents | UI, components, styling |
| **T4** | Quality Worker | Testing/audit agents | Tests, reviews, documentation |

### Task Distribution

When running a major command like `/ship-feature`:

```
T1 (Orchestrator):
  → Runs /ship-feature
  → Breaks down work
  → Distributes to T2-T4
  → Monitors progress
  → Handles integration

T2 (Backend):
  → Claims backend work items
  → Implements APIs
  → Writes migrations
  → Backend tests

T3 (Frontend):
  → Claims frontend work items
  → Implements components
  → Writes UI code
  → Frontend tests

T4 (Quality):
  → Runs audits
  → Reviews code
  → Generates docs
  → Integration tests
```

---

## Command Reference

### Master Orchestrators

| Command | Purpose | When to Use |
|---------|---------|-------------|
| `/dev-session` | Full development session | Starting a work day |
| `/ship-feature` | End-to-end feature delivery | New feature from idea to prod |
| `/fix-production` | Emergency hotfix | Production is broken |
| `/health-check` | System health assessment | Regular checkup |
| `/sprint-start` | Begin new sprint | Sprint planning |
| `/release` | Cut a release | Ready to ship |

### Individual Agents

#### Deployment (Priority 1)
| Command | Purpose |
|---------|---------|
| `/deploy-orchestrator` | Deploy to any environment |
| `/migration-runner` | Run database migrations |
| `/rollback-agent` | Revert a deployment |
| `/release-manager` | Version and release |
| `/changelog-writer` | Generate changelog |

#### Code Health (Priority 2)
| Command | Purpose |
|---------|---------|
| `/tech-debt-scanner` | Find tech debt |
| `/refactor-executor` | Execute refactoring |
| `/dependency-updater` | Update dependencies |
| `/test-generator` | Generate tests |
| `/pr-creator` | Create pull requests |

#### Intelligence (Priority 3)
| Command | Purpose |
|---------|---------|
| `/codebase-mapper` | Map the codebase |
| `/impact-analyzer` | Analyze change impact |
| `/pattern-detector` | Detect patterns |
| `/bug-predictor` | Predict bugs |

#### Team Support (Priority 4)
| Command | Purpose |
|---------|---------|
| `/codebase-explainer` | Explain code |
| `/pr-reviewer` | Review PRs |
| `/doc-maintainer` | Maintain docs |
| `/runbook-creator` | Create runbooks |

#### Planning (Priority 5)
| Command | Purpose |
|---------|---------|
| `/sprint-planner` | Plan sprints |
| `/estimate-generator` | Generate estimates |
| `/backlog-groomer` | Groom backlog |
| `/spec-writer` | Write specs |

---

## Workflow Examples

### Example 1: Ship a New Feature (4 Agents)

**Terminal 1 (Orchestrator):**
```
/ship-feature Add a notification system for when students complete quests
```

The orchestrator will:
1. Create work items for each component
2. Distribute to worker terminals
3. Monitor and integrate

**Terminals 2-4 (Workers):**
```
/work-queue  # Each worker claims and processes work items
```

### Example 2: Fix Production Issue (2 Agents)

**Terminal 1:**
```
/fix-production Users getting 500 error on profile page
```

**Terminal 2:**
```
/work-queue  # Assists with testing and verification
```

### Example 3: Start a Sprint (4 Agents)

**Terminal 1:**
```
/sprint-start
```

**Terminals 2-4:**
```
/work-queue  # Process grooming, estimation, and planning tasks
```

---

## Clarification Handling

Agents will request clarification when needed. You'll see:

```
==========================================
🤔 CLARIFICATION NEEDED
==========================================

Should the notification system support email, in-app, or both?

Context: Designing notification feature

Waiting for response...
==========================================
```

### To Respond:

The agent will pause and wait. Simply type your response in that terminal:

```
Both email and in-app notifications. Email should be optional and configurable per user.
```

---

## Monitoring

### Check Agent Status

```bash
# List active agents
ls -la .claude/workspace/state/agent_*.json

# Check work queue
ls -la .claude/workspace/queue/

# Check active work
ls -la .claude/workspace/active/

# View broadcast log
tail -50 .claude/workspace/state/broadcast.log
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Agent stuck | Check `.claude/workspace/locks/` for stale locks |
| Work not being claimed | Verify queue has items: `ls .claude/workspace/queue/` |
| Merge conflicts | One agent should run `/resolve-conflicts` |

---

## File Organization

After setup, your `.claude/` directory should look like:

```
.claude/
├── commands/
│   ├── _coordination.md       # Shared coordination code
│   │
│   ├── # Master Orchestrators
│   ├── dev-session.md
│   ├── ship-feature.md
│   ├── fix-production.md
│   ├── health-check.md
│   ├── sprint-start.md
│   ├── release.md
│   │
│   ├── # Deployment Suite
│   ├── deploy-orchestrator.md
│   ├── migration-runner.md
│   ├── rollback-agent.md
│   ├── release-manager.md
│   ├── changelog-writer.md
│   │
│   ├── # Code Health Suite
│   ├── tech-debt-scanner.md
│   ├── refactor-executor.md
│   ├── dependency-updater.md
│   ├── test-generator.md
│   ├── pr-creator.md
│   │
│   ├── # Intelligence Suite
│   ├── codebase-mapper.md
│   ├── impact-analyzer.md
│   ├── pattern-detector.md
│   ├── bug-predictor.md
│   │
│   ├── # Team Support Suite
│   ├── codebase-explainer.md
│   ├── pr-reviewer.md
│   ├── doc-maintainer.md
│   ├── runbook-creator.md
│   │
│   ├── # Planning Suite
│   ├── sprint-planner.md
│   ├── estimate-generator.md
│   ├── backlog-groomer.md
│   ├── spec-writer.md
│   │
│   ├── # Existing Suites (from before)
│   ├── # ... audit agents
│   ├── # ... feature dev agents
│   ├── # ... debugging agents
│   │
│   └── work-queue.md          # Worker agent for queue processing
│
├── workspace/
│   ├── queue/                 # Pending work items
│   ├── active/                # Work in progress
│   ├── completed/             # Finished work
│   ├── locks/                 # Resource locks
│   ├── state/                 # Shared state
│   └── logs/                  # Activity logs
│
└── config/
    └── settings.json          # Optional configuration
```

---

## Best Practices

### 1. Terminal Roles

- **Terminal 1** should always run orchestrators
- **Terminals 2-4** should run `/work-queue` and process items
- Don't run orchestrators in worker terminals

### 2. Git Hygiene

- Each agent creates isolated work branches
- Only orchestrators merge to feature branches
- Use conventional commits

### 3. Communication

- Agents broadcast status to `.claude/workspace/state/broadcast.log`
- Check this log to monitor progress
- Agents will request clarification rather than guess

### 4. Recovery

If something goes wrong:
```bash
# Clear all locks
rm -f .claude/workspace/locks/*

# Clear stale work
mv .claude/workspace/active/* .claude/workspace/queue/

# Reset agent registry
echo '[]' > .claude/workspace/state/agents.json
```

---

## Getting Help

In any terminal, ask:
```
What commands are available for [deployment/testing/etc]?
```

Or:
```
Explain how to use /ship-feature
```

---

**Ready to start? Open 4 terminals and run the Quick Start commands!**
