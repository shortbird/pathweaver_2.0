---
name: compile-audit
description: Compiles audit findings into a report and saves them for /fix-audit to process.
model: opus
---

You compile audit findings into a report and save structured data for automated fixes.

## Step 1: Check audits are done

```bash
echo "Queue: $(ls .claude/workspace/queue/*.json 2>/dev/null | wc -l)"
echo "Active: $(ls .claude/workspace/active/*.json 2>/dev/null | wc -l)"
```

If Queue or Active > 0, tell user to wait for workers.

## Step 2: Run all scans and capture findings

Execute each scan and collect findings into a structured format.

```bash
mkdir -p .claude/workspace/audits
FINDINGS_FILE=".claude/workspace/audits/findings_$(date +%Y%m%d_%H%M%S).json"
echo '{"findings": [' > "$FINDINGS_FILE"
```

**Security scan:**
```bash
echo "=== SECURITY ===" 

# Hardcoded secrets
SECRETS=$(grep -rn "password.*=.*['\"]" --include="*.py" --include="*.ts" 2>/dev/null | grep -v node_modules | grep -v venv | grep -v test | head -10)
echo "$SECRETS"

# For each finding, add to JSON
while IFS=: read -r file line content; do
    if [ -n "$file" ]; then
        echo "{\"type\":\"security\",\"severity\":\"critical\",\"file\":\"$file\",\"line\":$line,\"issue\":\"hardcoded_secret\",\"description\":\"Possible hardcoded secret\"}," >> "$FINDINGS_FILE"
    fi
done <<< "$SECRETS"

# Dangerous functions
DANGEROUS=$(grep -rn "eval(\|exec(" --include="*.py" 2>/dev/null | grep -v venv | head -5)
echo "$DANGEROUS"
```

**Code quality scan:**
```bash
echo "=== CODE QUALITY ==="

# TODOs
TODOS=$(grep -rn "TODO\|FIXME" --include="*.py" --include="*.ts" 2>/dev/null | grep -v node_modules | grep -v venv | head -15)
echo "$TODOS"

while IFS=: read -r file line content; do
    if [ -n "$file" ]; then
        echo "{\"type\":\"quality\",\"severity\":\"low\",\"file\":\"$file\",\"line\":$line,\"issue\":\"todo\",\"description\":\"TODO/FIXME comment\"}," >> "$FINDINGS_FILE"
    fi
done <<< "$TODOS"
```

**Large files scan:**
```bash
echo "=== LARGE FILES ==="
LARGE=$(find . -name "*.py" -o -name "*.ts" 2>/dev/null | grep -v node_modules | grep -v venv | xargs wc -l 2>/dev/null | sort -rn | awk '$1 > 300 {print}' | head -10)
echo "$LARGE"

while read -r lines file; do
    if [ -n "$file" ] && [ "$file" != "total" ]; then
        echo "{\"type\":\"architecture\",\"severity\":\"medium\",\"file\":\"$file\",\"line\":0,\"issue\":\"large_file\",\"description\":\"File has $lines lines - consider splitting\"}," >> "$FINDINGS_FILE"
    fi
done <<< "$LARGE"
```

**Accessibility scan:**
```bash
echo "=== ACCESSIBILITY ==="
echo "-- Images Without Alt (multi-line aware) --"
for f in $(find . \( -name "*.tsx" -o -name "*.jsx" \) 2>/dev/null | grep -v node_modules | head -30); do
    perl -0777 -ne 'while(/<(?:img|Image)\s[^>]*?>/gsi){ print "'"$f"': missing alt\n" if $& !~ /alt\s*=/i }' "$f" 2>/dev/null
done | head -10

while IFS=: read -r file line content; do
    if [ -n "$file" ]; then
        echo "{\"type\":\"accessibility\",\"severity\":\"medium\",\"file\":\"$file\",\"line\":$line,\"issue\":\"missing_alt\",\"description\":\"Image missing alt text\"}," >> "$FINDINGS_FILE"
    fi
done <<< "$NO_ALT"
```

**Finalize JSON:**
```bash
# Remove trailing comma and close JSON
sed -i '$ s/,$//' "$FINDINGS_FILE"
echo ']}' >> "$FINDINGS_FILE"
echo ""
echo "Findings saved to: $FINDINGS_FILE"
```

## Step 3: Generate summary report

Count findings by severity and type, then display:

```bash
echo ""
echo "=========================================="
echo "AUDIT REPORT"
echo "=========================================="
echo ""
echo "Findings by severity:"
grep -o '"severity":"[^"]*"' "$FINDINGS_FILE" | sort | uniq -c
echo ""
echo "Findings by type:"
grep -o '"type":"[^"]*"' "$FINDINGS_FILE" | sort | uniq -c
echo ""
echo "Total findings: $(grep -c '"issue"' "$FINDINGS_FILE")"
echo "=========================================="
```

## Step 4: Display actionable items

Read the JSON and display prioritized list:

```bash
echo ""
echo "CRITICAL (fix immediately):"
grep '"severity":"critical"' "$FINDINGS_FILE" | head -5
echo ""
echo "MEDIUM (fix soon):"
grep '"severity":"medium"' "$FINDINGS_FILE" | head -5
echo ""
echo "LOW (backlog):"
grep '"severity":"low"' "$FINDINGS_FILE" | head -5
```

## Step 5: Tell user next steps

```
✅ Audit compiled. Findings saved.

NEXT STEPS:
1. Review findings above
2. Run /fix-audit to create fix tasks for workers
3. Run /work-queue in T2-T4 to implement fixes
4. Run /verify-fixes to confirm
```

STOP here.
