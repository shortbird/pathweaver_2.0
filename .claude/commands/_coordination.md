# Multi-Agent Coordination System

This document defines the shared infrastructure for coordinating multiple Claude Code terminal agents working in parallel.

## Directory Structure

```
.claude/
├── commands/           # All agent command files
├── workspace/          # Shared workspace for coordination
│   ├── queue/          # Work items waiting to be claimed
│   ├── active/         # Work items currently being processed
│   ├── completed/      # Completed work items
│   ├── locks/          # Resource locks
│   ├── state/          # Shared state files
│   └── logs/           # Agent activity logs
└── config/             # Configuration files
```

## Initialization Script

Run this once before starting any agents:

```bash
#!/bin/bash
# initialize-workspace.sh

mkdir -p .claude/workspace/{queue,active,completed,locks,state,logs}
mkdir -p .claude/config

# Create shared state file
cat > .claude/workspace/state/system.json << 'EOF'
{
  "initialized": true,
  "initialized_at": "$(date -Iseconds)",
  "agents": {},
  "current_sprint": null,
  "current_release": null
}
EOF

# Create agent registry
cat > .claude/workspace/state/agents.json << 'EOF'
{
  "registered": [],
  "active": [],
  "last_heartbeat": {}
}
EOF

echo "✅ Multi-agent workspace initialized"
```

## Agent Registration Protocol

Every agent MUST register on startup:

```bash
# Register agent
AGENT_ID="agent_$(hostname)_$$_$(date +%s)"
AGENT_FILE=".claude/workspace/state/agent_${AGENT_ID}.json"

cat > "$AGENT_FILE" << EOF
{
  "id": "$AGENT_ID",
  "started": "$(date -Iseconds)",
  "pid": $$,
  "status": "active",
  "current_task": null,
  "last_heartbeat": "$(date -Iseconds)"
}
EOF

echo "$AGENT_ID" >> .claude/workspace/state/agents.json
```

## Work Queue Protocol

### Adding Work to Queue

```bash
# Create work item
WORK_ID="work_$(date +%s%N)"
cat > ".claude/workspace/queue/${WORK_ID}.json" << EOF
{
  "id": "$WORK_ID",
  "type": "[task_type]",
  "priority": 1,
  "created": "$(date -Iseconds)",
  "created_by": "$AGENT_ID",
  "payload": {
    "description": "[task description]",
    "files": [],
    "dependencies": []
  },
  "status": "pending"
}
EOF
```

### Claiming Work

```bash
# Atomic claim using lock file
claim_work() {
    WORK_FILE="$1"
    LOCK_FILE=".claude/workspace/locks/$(basename $WORK_FILE).lock"
    
    # Try to create lock (atomic operation)
    if (set -o noclobber; echo "$AGENT_ID" > "$LOCK_FILE") 2>/dev/null; then
        # Move to active
        mv "$WORK_FILE" ".claude/workspace/active/"
        # Update with our agent ID
        jq ".claimed_by = \"$AGENT_ID\" | .claimed_at = \"$(date -Iseconds)\"" \
            ".claude/workspace/active/$(basename $WORK_FILE)" > /tmp/work.json
        mv /tmp/work.json ".claude/workspace/active/$(basename $WORK_FILE)"
        return 0
    else
        return 1
    fi
}

# Find and claim next available work
find .claude/workspace/queue -name "*.json" -type f | while read work_file; do
    if claim_work "$work_file"; then
        echo "Claimed: $work_file"
        break
    fi
done
```

### Completing Work

```bash
# Mark work as complete
complete_work() {
    WORK_FILE="$1"
    RESULT="$2"  # "success" or "failed"
    
    # Update status
    jq ".status = \"$RESULT\" | .completed_at = \"$(date -Iseconds)\"" \
        "$WORK_FILE" > /tmp/work.json
    
    # Move to completed
    mv /tmp/work.json ".claude/workspace/completed/$(basename $WORK_FILE)"
    
    # Remove lock
    rm -f ".claude/workspace/locks/$(basename $WORK_FILE).lock"
}
```

## Resource Locking

For exclusive access to files/resources:

```bash
# Acquire lock
acquire_lock() {
    RESOURCE="$1"
    LOCK_FILE=".claude/workspace/locks/${RESOURCE//\//_}.lock"
    MAX_WAIT=30
    WAITED=0
    
    while [ $WAITED -lt $MAX_WAIT ]; do
        if (set -o noclobber; echo "$AGENT_ID $(date -Iseconds)" > "$LOCK_FILE") 2>/dev/null; then
            return 0
        fi
        sleep 1
        WAITED=$((WAITED + 1))
    done
    
    return 1  # Failed to acquire lock
}

# Release lock
release_lock() {
    RESOURCE="$1"
    LOCK_FILE=".claude/workspace/locks/${RESOURCE//\//_}.lock"
    rm -f "$LOCK_FILE"
}
```

## Git Branching for Parallel Work

When multiple agents work on the same feature:

```
main
  └── feature/[feature-name]           # Feature branch
        ├── work/[feature]-agent-1     # Agent 1's work
        ├── work/[feature]-agent-2     # Agent 2's work
        ├── work/[feature]-agent-3     # Agent 3's work
        └── work/[feature]-agent-4     # Agent 4's work
```

### Branch Protocol

```bash
# Create isolated work branch
create_work_branch() {
    FEATURE="$1"
    git fetch origin
    git checkout -b "work/${FEATURE}-${AGENT_ID}" "origin/feature/${FEATURE}" 2>/dev/null || \
    git checkout -b "work/${FEATURE}-${AGENT_ID}" "origin/dev"
}

# Merge work back
merge_work() {
    FEATURE="$1"
    TARGET="feature/${FEATURE}"
    
    # Acquire merge lock
    if acquire_lock "merge_${FEATURE}"; then
        git checkout "$TARGET"
        git pull origin "$TARGET"
        git merge "work/${FEATURE}-${AGENT_ID}" --no-edit
        git push origin "$TARGET"
        release_lock "merge_${FEATURE}"
    fi
}
```

## Inter-Agent Communication

### Signals

```bash
# Send signal to another agent
signal_agent() {
    TARGET_AGENT="$1"
    SIGNAL="$2"
    MESSAGE="$3"
    
    SIGNAL_FILE=".claude/workspace/state/signal_${TARGET_AGENT}_$(date +%s%N).json"
    cat > "$SIGNAL_FILE" << EOF
{
  "from": "$AGENT_ID",
  "to": "$TARGET_AGENT",
  "signal": "$SIGNAL",
  "message": "$MESSAGE",
  "timestamp": "$(date -Iseconds)"
}
EOF
}

# Check for signals
check_signals() {
    for signal_file in .claude/workspace/state/signal_${AGENT_ID}_*.json; do
        if [ -f "$signal_file" ]; then
            cat "$signal_file"
            rm "$signal_file"
        fi
    done
}
```

### Broadcast

```bash
# Broadcast to all agents
broadcast() {
    MESSAGE="$1"
    
    cat >> ".claude/workspace/state/broadcast.log" << EOF
[$(date -Iseconds)] [$AGENT_ID] $MESSAGE
EOF
}

# Read recent broadcasts
read_broadcasts() {
    tail -20 ".claude/workspace/state/broadcast.log" 2>/dev/null
}
```

## Clarification Protocol

When an agent needs human input:

```bash
# Request clarification
request_clarification() {
    QUESTION="$1"
    CONTEXT="$2"
    
    CLARIFICATION_FILE=".claude/workspace/state/clarification_$(date +%s%N).json"
    cat > "$CLARIFICATION_FILE" << EOF
{
  "agent": "$AGENT_ID",
  "question": "$QUESTION",
  "context": "$CONTEXT",
  "asked_at": "$(date -Iseconds)",
  "answered": false,
  "answer": null
}
EOF
    
    echo ""
    echo "=========================================="
    echo "🤔 CLARIFICATION NEEDED"
    echo "=========================================="
    echo ""
    echo "$QUESTION"
    echo ""
    echo "Context: $CONTEXT"
    echo ""
    echo "Waiting for response..."
    echo "(Answer will be read from: $CLARIFICATION_FILE)"
    echo "=========================================="
    
    # Wait for answer (with timeout)
    TIMEOUT=300  # 5 minutes
    WAITED=0
    while [ $WAITED -lt $TIMEOUT ]; do
        if [ "$(jq -r '.answered' "$CLARIFICATION_FILE")" = "true" ]; then
            ANSWER=$(jq -r '.answer' "$CLARIFICATION_FILE")
            echo "Answer received: $ANSWER"
            rm "$CLARIFICATION_FILE"
            echo "$ANSWER"
            return 0
        fi
        sleep 2
        WAITED=$((WAITED + 2))
    done
    
    echo "Timeout waiting for clarification. Proceeding with best judgment."
    rm "$CLARIFICATION_FILE"
    return 1
}
```

## Heartbeat Protocol

Keep agents aware of each other:

```bash
# Send heartbeat
heartbeat() {
    AGENT_FILE=".claude/workspace/state/agent_${AGENT_ID}.json"
    jq ".last_heartbeat = \"$(date -Iseconds)\" | .current_task = \"$CURRENT_TASK\"" \
        "$AGENT_FILE" > /tmp/agent.json
    mv /tmp/agent.json "$AGENT_FILE"
}

# Check for dead agents (no heartbeat in 5 minutes)
cleanup_dead_agents() {
    NOW=$(date +%s)
    for agent_file in .claude/workspace/state/agent_*.json; do
        if [ -f "$agent_file" ]; then
            LAST_BEAT=$(jq -r '.last_heartbeat' "$agent_file")
            BEAT_TIME=$(date -d "$LAST_BEAT" +%s 2>/dev/null || echo 0)
            if [ $((NOW - BEAT_TIME)) -gt 300 ]; then
                echo "Cleaning up dead agent: $agent_file"
                # Release any locks held by this agent
                DEAD_AGENT=$(jq -r '.id' "$agent_file")
                grep -l "$DEAD_AGENT" .claude/workspace/locks/*.lock 2>/dev/null | xargs rm -f
                rm "$agent_file"
            fi
        fi
    done
}
```

## Shared State

Agents can share state through JSON files:

```bash
# Read shared state
read_state() {
    KEY="$1"
    jq -r ".$KEY" .claude/workspace/state/system.json
}

# Update shared state (with locking)
update_state() {
    KEY="$1"
    VALUE="$2"
    
    if acquire_lock "system_state"; then
        jq ".$KEY = $VALUE" .claude/workspace/state/system.json > /tmp/state.json
        mv /tmp/state.json .claude/workspace/state/system.json
        release_lock "system_state"
    fi
}
```
