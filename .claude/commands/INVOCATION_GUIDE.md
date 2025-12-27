# Subagent Invocation Guide

## Complete Suite Overview

| Agent | Model | Primary Use | Invoke When |
|-------|-------|-------------|-------------|
| `architect-reviewer` | opus | Structure & patterns | New services, refactoring, module changes |
| `code-reviewer` | sonnet | Quality & reliability | After writing/modifying any code |
| `security-auditor` | opus | Vulnerabilities | Auth changes, data handling, pre-release |
| `legal-risk-analyzer` | opus | Compliance & licensing | Adding deps, user data changes, releases |
| `performance-analyst` | sonnet | Speed & efficiency | Feature completion, slowness, scaling |
| `accessibility-auditor` | opus | Inclusive design | UI changes, new components, pre-release |
| `api-design-reviewer` | sonnet | API consistency | New endpoints, API modifications |
| `test-strategy-analyst` | sonnet | Test coverage & quality | After features, before releases, test failures |

## Quick Reference: When to Use Each Agent

### After Writing Code
```bash
# Always run code-reviewer first
/run code-reviewer

# Then if structural changes were made
/run architect-reviewer

# Then if tests were added/modified
/run test-strategy-analyst
```

### Before Releases
```bash
# Security check
/run security-auditor

# Legal compliance
/run legal-risk-analyzer

# Accessibility (for UI)
/run accessibility-auditor

# Test coverage
/run test-strategy-analyst
```

### Feature-Specific Triggers

| If you changed... | Run these agents |
|-------------------|------------------|
| Authentication/authorization | security-auditor, code-reviewer |
| User data handling | security-auditor, legal-risk-analyzer |
| API endpoints | api-design-reviewer, security-auditor |
| Database schema | architect-reviewer, code-reviewer |
| UI components | accessibility-auditor, code-reviewer |
| Dependencies | legal-risk-analyzer, security-auditor |
| Performance-critical code | performance-analyst, code-reviewer |
| Tests | test-strategy-analyst |
| Configuration | code-reviewer |

## Agent Interaction Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        Code Change                                │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│                      code-reviewer                                │
│              Quality, correctness, reliability                    │
└──────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
    ┌───────────────┐ ┌───────────────┐ ┌───────────────┐
    │   architect   │ │   security    │ │     test      │
    │   reviewer    │ │   auditor     │ │   strategy    │
    │  (structure)  │ │(vulnerabilities)│ │  (coverage)  │
    └───────────────┘ └───────────────┘ └───────────────┘
            │                 │                 │
            │                 ▼                 │
            │         ┌───────────────┐        │
            │         │    legal      │        │
            │         │   analyzer    │        │
            │         │ (compliance)  │        │
            │         └───────────────┘        │
            │                                  │
            └─────────────────┬────────────────┘
                              ▼
            ┌─────────────────┴─────────────────┐
            ▼                                   ▼
    ┌───────────────┐                   ┌───────────────┐
    │  performance  │                   │ accessibility │
    │   analyst     │                   │   auditor     │
    │ (if backend)  │                   │  (if UI)      │
    └───────────────┘                   └───────────────┘
            │                                   │
            └─────────────────┬─────────────────┘
                              ▼
                    ┌───────────────┐
                    │  api-design   │
                    │   reviewer    │
                    │ (if API work) │
                    └───────────────┘
```

## Typical Workflows

### 1. New Feature Development

```bash
# Phase 1: Implementation
[write code]
/run code-reviewer

# Phase 2: Architecture check (if structural)
/run architect-reviewer

# Phase 3: Security review
/run security-auditor

# Phase 4: Domain-specific
/run accessibility-auditor  # if UI
/run performance-analyst    # if backend/data
/run api-design-reviewer    # if API

# Phase 5: Test coverage
/run test-strategy-analyst
```

### 2. Pre-Release Audit

```bash
# Full security sweep
/run security-auditor

# Legal compliance check
/run legal-risk-analyzer

# Test coverage verification
/run test-strategy-analyst

# Accessibility audit (if user-facing)
/run accessibility-auditor
```

### 3. Investigating Issues

```bash
# Performance problem
/run performance-analyst
/run code-reviewer          # for config issues

# Test failures
/run test-strategy-analyst
/run code-reviewer

# Security incident
/run security-auditor
/run code-reviewer
```

### 4. Adding Dependencies

```bash
# Check license and security
/run legal-risk-analyzer
/run security-auditor
```

### 5. API Changes

```bash
# Design review
/run api-design-reviewer

# Security implications
/run security-auditor

# Documentation check (api-design covers this)
```

### 6. Database Changes

```bash
# Schema/architecture review
/run architect-reviewer

# Performance implications
/run performance-analyst

# Security (data access)
/run security-auditor
```

## Cross-References Between Agents

Agents are designed to defer to each other:

| Agent | Defers To | For |
|-------|-----------|-----|
| architect-reviewer | performance-analyst | Runtime metrics |
| architect-reviewer | security-auditor | Security boundaries |
| code-reviewer | security-auditor | Deep security review |
| code-reviewer | performance-analyst | Optimization |
| security-auditor | legal-risk-analyzer | Privacy compliance |
| legal-risk-analyzer | security-auditor | Implementation details |
| performance-analyst | architect-reviewer | Scalability patterns |
| accessibility-auditor | legal-risk-analyzer | Compliance implications |
| api-design-reviewer | security-auditor | Auth implementation |
| test-strategy-analyst | code-reviewer | Code quality |

## Optio-Specific Recommendations

### Student Data Changes
```bash
/run security-auditor        # Student data protection
/run legal-risk-analyzer     # FERPA compliance
/run architect-reviewer      # Access control design
```

### LMS Integration Work
```bash
/run api-design-reviewer     # API contracts
/run security-auditor        # OAuth, data sync security
/run test-strategy-analyst   # Idempotency, error handling tests
```

### Parent Portal Changes
```bash
/run accessibility-auditor   # Parent accessibility
/run security-auditor        # Parent/student separation
/run legal-risk-analyzer     # FERPA parent rights
```

### Progress/Portfolio Features
```bash
/run architect-reviewer      # Data model design
/run performance-analyst     # Query optimization
/run accessibility-auditor   # Progress visualization accessibility
```

## Output Consolidation

When running multiple agents, look for:

1. **Overlapping findings**: Same issue flagged by multiple agents = high priority
2. **Cross-referenced concerns**: Agent A flags something for Agent B to review
3. **Conflicting recommendations**: Rare, but resolve by considering context

## Model Cost Optimization

**High-value opus usage** (complex analysis):
- architect-reviewer (deep structural analysis)
- security-auditor (security requires thoroughness)
- legal-risk-analyzer (compliance requires precision)
- accessibility-auditor (WCAG compliance is detailed)

**Efficient sonnet usage** (pattern matching):
- code-reviewer (pattern-based detection)
- performance-analyst (metric analysis)
- api-design-reviewer (consistency checks)
- test-strategy-analyst (coverage analysis)

## Tips for Best Results

1. **Run code-reviewer first** — catches obvious issues before deeper analysis
2. **Be specific in invocation** — "review the new payment module" > "review code"
3. **Share context** — mention what changed and why
4. **Address critical findings first** — don't let them pile up
5. **Re-run after fixes** — verify remediation worked
