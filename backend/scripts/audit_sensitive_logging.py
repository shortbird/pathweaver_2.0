"""
Audit script to find sensitive data logging (P1-SEC-4)

Scans backend codebase for potential PII exposure in logging statements:
- User IDs (UUIDs) logged without masking
- Email addresses logged without masking
- Tokens logged without masking
- Logger calls that should use mask_user_id(), mask_email(), mask_token()

Usage:
    python backend/scripts/audit_sensitive_logging.py

Output:
    - Console report of files with potential PII exposure
    - Sorted by severity (high priority first)
    - Line numbers and context for each finding
"""

import os
import re
from pathlib import Path
from collections import defaultdict

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    OKBLUE = '\033[94m'
    OKCYAN = '\033[96m'
    OKGREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'
    UNDERLINE = '\033[4m'

def scan_file_for_pii_logging(file_path):
    """
    Scan a single file for potential PII exposure in logging.

    Returns:
        List of dictionaries with findings:
        [{
            'line_number': int,
            'line_content': str,
            'severity': 'high'|'medium'|'low',
            'issue': str (description),
            'recommendation': str
        }]
    """
    findings = []

    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            lines = f.readlines()
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return findings

    for line_num, line in enumerate(lines, start=1):
        line_stripped = line.strip()

        # Skip comments and imports
        if line_stripped.startswith('#') or line_stripped.startswith('from ') or line_stripped.startswith('import '):
            continue

        # Pattern 1: logger.info/warning/error with user_id variable (HIGH SEVERITY)
        # Matches: logger.info(f"User {user_id} logged in")
        # Should be: logger.info(f"User {mask_user_id(user_id)} logged in")
        if re.search(r'logger\.(info|warning|error|debug)\s*\([^)]*\{user_id\}', line):
            # Check if it's already using mask_user_id
            if 'mask_user_id(user_id)' not in line:
                findings.append({
                    'line_number': line_num,
                    'line_content': line_stripped,
                    'severity': 'high',
                    'issue': 'User ID logged without masking',
                    'recommendation': 'Use mask_user_id(user_id) instead of {user_id}'
                })

        # Pattern 2: logger with email variable (HIGH SEVERITY)
        # Matches: logger.info(f"Login for {email}")
        # Should be: logger.info(f"Login for {mask_email(email)}")
        if re.search(r'logger\.(info|warning|error|debug)\s*\([^)]*\{email\}', line):
            # Check if it's already using mask_email
            if 'mask_email(email)' not in line:
                findings.append({
                    'line_number': line_num,
                    'line_content': line_stripped,
                    'severity': 'high',
                    'issue': 'Email address logged without masking',
                    'recommendation': 'Use mask_email(email) instead of {email}'
                })

        # Pattern 3: Manual email masking (MEDIUM SEVERITY - should use utility)
        # Matches: email[:3]*** or similar patterns
        # Should be: mask_email(email)
        if re.search(r'email\[:3\]', line) and 'logger.' in line:
            if 'mask_email' not in line:
                findings.append({
                    'line_number': line_num,
                    'line_content': line_stripped,
                    'severity': 'medium',
                    'issue': 'Manual email masking - should use mask_email() utility',
                    'recommendation': 'Replace email[:3]*** with mask_email(email) for consistency'
                })

        # Pattern 4: Manual user_id masking (MEDIUM SEVERITY)
        # Matches: user_id[:8] or similar
        # Should be: mask_user_id(user_id)
        if re.search(r'user_id\[:8\]', line) and 'logger.' in line:
            if 'mask_user_id' not in line:
                findings.append({
                    'line_number': line_num,
                    'line_content': line_stripped,
                    'severity': 'medium',
                    'issue': 'Manual user_id masking - should use mask_user_id() utility',
                    'recommendation': 'Replace user_id[:8] with mask_user_id(user_id) for consistency'
                })

        # Pattern 5: Token logging (HIGH SEVERITY)
        # Matches: logger with token/access_token/refresh_token
        # Should be: logger.debug with mask_token() and environment check
        if re.search(r'logger\.(info|warning|error)\s*\([^)]*\{.*token.*\}', line, re.IGNORECASE):
            if 'mask_token' not in line:
                findings.append({
                    'line_number': line_num,
                    'line_content': line_stripped,
                    'severity': 'high',
                    'issue': 'Token logged without masking (security risk)',
                    'recommendation': 'Move to DEBUG level with mask_token() and should_log_sensitive_data() check'
                })

        # Pattern 6: logger.info with potential sensitive data (LOW SEVERITY)
        # Look for common sensitive field names
        sensitive_fields = ['password', 'ssn', 'credit_card', 'api_key', 'secret', 'private_key']
        for field in sensitive_fields:
            if field in line.lower() and 'logger.' in line:
                findings.append({
                    'line_number': line_num,
                    'line_content': line_stripped,
                    'severity': 'high',
                    'issue': f'Potentially logging sensitive field: {field}',
                    'recommendation': f'Verify {field} is not being logged. If necessary, mask with appropriate function'
                })

        # Pattern 7: Missing environment check for DEBUG logs (MEDIUM SEVERITY)
        # Matches: logger.debug with sensitive data but no should_log_sensitive_data() check
        if 'logger.debug' in line and any(term in line for term in ['user_id', 'email', 'token']):
            # Check if previous lines have should_log_sensitive_data() check
            context_start = max(0, line_num - 3)
            context_lines = lines[context_start:line_num]
            has_env_check = any('should_log_sensitive_data()' in l for l in context_lines)

            if not has_env_check and 'mask_' not in line:
                findings.append({
                    'line_number': line_num,
                    'line_content': line_stripped,
                    'severity': 'medium',
                    'issue': 'DEBUG log with sensitive data missing environment check',
                    'recommendation': 'Wrap in: if should_log_sensitive_data(): logger.debug(...)'
                })

    return findings


def generate_report(all_findings):
    """
    Generate a comprehensive audit report.

    Args:
        all_findings: Dict mapping file paths to lists of findings
    """
    print(f"\n{Colors.HEADER}{'='*80}{Colors.ENDC}")
    print(f"{Colors.HEADER}{Colors.BOLD}P1-SEC-4 Sensitive Logging Audit Report{Colors.ENDC}")
    print(f"{Colors.HEADER}{'='*80}{Colors.ENDC}\n")

    # Count findings by severity
    severity_counts = defaultdict(int)
    total_files_with_issues = 0
    total_findings = 0

    for file_path, findings in all_findings.items():
        if findings:
            total_files_with_issues += 1
            total_findings += len(findings)
            for finding in findings:
                severity_counts[finding['severity']] += 1

    # Summary
    print(f"{Colors.BOLD}Summary:{Colors.ENDC}")
    print(f"  Files scanned: {len(all_findings)}")
    print(f"  Files with issues: {total_files_with_issues}")
    print(f"  Total findings: {total_findings}")
    print(f"\n{Colors.BOLD}Findings by severity:{Colors.ENDC}")
    print(f"  {Colors.FAIL}High:{Colors.ENDC}   {severity_counts['high']}")
    print(f"  {Colors.WARNING}Medium:{Colors.ENDC} {severity_counts['medium']}")
    print(f"  {Colors.OKBLUE}Low:{Colors.ENDC}    {severity_counts['low']}")

    print(f"\n{Colors.HEADER}{'='*80}{Colors.ENDC}\n")

    # Detailed findings (sorted by severity)
    severity_order = {'high': 0, 'medium': 1, 'low': 2}
    sorted_files = sorted(
        [(path, findings) for path, findings in all_findings.items() if findings],
        key=lambda x: (
            min(severity_order[f['severity']] for f in x[1]),  # Highest severity first
            -len(x[1])  # Most findings first
        )
    )

    for file_path, findings in sorted_files:
        # Color code severity
        max_severity = min((f['severity'] for f in findings), key=lambda s: severity_order[s])
        if max_severity == 'high':
            file_color = Colors.FAIL
        elif max_severity == 'medium':
            file_color = Colors.WARNING
        else:
            file_color = Colors.OKBLUE

        print(f"{file_color}{Colors.BOLD}{file_path}{Colors.ENDC} ({len(findings)} issues)")

        for finding in sorted(findings, key=lambda f: severity_order[f['severity']]):
            severity_color = Colors.FAIL if finding['severity'] == 'high' else Colors.WARNING if finding['severity'] == 'medium' else Colors.OKBLUE
            print(f"  {severity_color}[{finding['severity'].upper()}]{Colors.ENDC} Line {finding['line_number']}")
            print(f"    Issue: {finding['issue']}")
            print(f"    Code: {finding['line_content'][:100]}{'...' if len(finding['line_content']) > 100 else ''}")
            print(f"    Fix: {finding['recommendation']}")
            print()

    print(f"{Colors.HEADER}{'='*80}{Colors.ENDC}\n")

    # Migration checklist
    print(f"{Colors.BOLD}Next Steps:{Colors.ENDC}\n")
    print("1. Import log scrubbing utilities in files with findings:")
    print("   from utils.log_scrubber import mask_user_id, mask_email, mask_token, should_log_sensitive_data")
    print("\n2. Update logger calls according to recommendations above")
    print("\n3. Move sensitive DEBUG logs behind should_log_sensitive_data() checks")
    print("\n4. Test changes in development environment (FLASK_ENV=development)")
    print("\n5. Verify production logs no longer contain PII (grep for UUID/email patterns)")
    print("\n6. Update COMPREHENSIVE_CODEBASE_REVIEW.md when complete")

    print(f"\n{Colors.OKGREEN}Files already compliant (using log scrubbing utilities):{Colors.ENDC}")
    compliant_files = [path for path, findings in all_findings.items() if not findings]
    if compliant_files:
        for file_path in compliant_files[:10]:  # Show first 10
            print(f"  ✓ {file_path}")
        if len(compliant_files) > 10:
            print(f"  ... and {len(compliant_files) - 10} more")
    else:
        print("  (None yet - this is the first migration)")


def main():
    """Main audit function"""
    backend_dir = Path(__file__).parent.parent

    # File patterns to scan
    scan_patterns = [
        'routes/**/*.py',
        'services/**/*.py',
        'middleware/**/*.py',
        'utils/**/*.py'
    ]

    all_findings = {}

    print(f"{Colors.OKBLUE}Scanning backend codebase for sensitive logging...{Colors.ENDC}\n")

    for pattern in scan_patterns:
        for file_path in backend_dir.glob(pattern):
            # Skip __pycache__ and test files
            if '__pycache__' in str(file_path) or 'test_' in file_path.name:
                continue

            # Skip the log scrubber itself
            if 'log_scrubber.py' in file_path.name:
                continue

            relative_path = file_path.relative_to(backend_dir)
            findings = scan_file_for_pii_logging(file_path)
            all_findings[str(relative_path)] = findings

    # Generate report
    generate_report(all_findings)


if __name__ == '__main__':
    main()
