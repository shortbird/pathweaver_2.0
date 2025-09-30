"""
Security Audit Script - Phase 7.1: Pre-Launch Security Checklist
This script audits all endpoints for proper authentication, authorization, and security controls.
"""

import os
import sys
import ast
import json
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def analyze_route_file(file_path):
    """Analyze a Python route file for security patterns"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            tree = ast.parse(content)

        routes = []
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef):
                # Check for Flask route decorators
                has_route = any(
                    isinstance(decorator, ast.Call) and
                    hasattr(decorator.func, 'attr') and
                    decorator.func.attr == 'route'
                    for decorator in node.decorator_list
                )

                if has_route:
                    # Extract decorators
                    decorators = []
                    for decorator in node.decorator_list:
                        if isinstance(decorator, ast.Name):
                            decorators.append(decorator.id)
                        elif isinstance(decorator, ast.Call):
                            if hasattr(decorator.func, 'attr'):
                                decorators.append(decorator.func.attr)
                            elif hasattr(decorator.func, 'id'):
                                decorators.append(decorator.func.id)

                    # Check for auth decorators
                    has_auth = any(
                        dec in ['require_auth', 'require_admin', 'require_paid_tier', 'require_role']
                        for dec in decorators
                    )

                    # Determine HTTP methods
                    methods = ['GET']  # Default
                    for decorator in node.decorator_list:
                        if isinstance(decorator, ast.Call) and hasattr(decorator.func, 'attr'):
                            if decorator.func.attr == 'route':
                                for keyword in decorator.keywords:
                                    if keyword.arg == 'methods':
                                        if isinstance(keyword.value, ast.List):
                                            methods = [elt.value for elt in keyword.value.elts if isinstance(elt, ast.Constant)]

                    routes.append({
                        'function': node.name,
                        'decorators': decorators,
                        'has_auth': has_auth,
                        'methods': methods,
                        'is_state_changing': any(method in ['POST', 'PUT', 'DELETE', 'PATCH'] for method in methods)
                    })

        return routes
    except Exception as e:
        print(f"Error analyzing {file_path}: {str(e)}", file=sys.stderr)
        return []

def main():
    """Run comprehensive security audit"""
    print("=" * 80)
    print("OPTIO PLATFORM - PHASE 7.1 SECURITY AUDIT")
    print("=" * 80)
    print()

    results = {
        'total_endpoints': 0,
        'authenticated_endpoints': 0,
        'unauthenticated_endpoints': 0,
        'state_changing_endpoints': 0,
        'state_changing_with_auth': 0,
        'public_endpoints': [],
        'protected_endpoints': [],
        'missing_auth': []
    }

    # Scan all route files
    routes_dir = Path(__file__).parent.parent / 'routes'
    route_files = list(routes_dir.rglob('*.py'))

    print(f"Scanning {len(route_files)} route files...\n")

    for route_file in route_files:
        if route_file.name == '__init__.py':
            continue

        relative_path = route_file.relative_to(routes_dir.parent)
        routes = analyze_route_file(route_file)

        if routes:
            print(f"\n{'=' * 80}")
            print(f"File: {relative_path}")
            print('=' * 80)

            for route in routes:
                results['total_endpoints'] += 1

                status = "PROTECTED" if route['has_auth'] else "PUBLIC"
                warning = ""

                if route['has_auth']:
                    results['authenticated_endpoints'] += 1
                    results['protected_endpoints'].append({
                        'file': str(relative_path),
                        'function': route['function'],
                        'methods': route['methods'],
                        'decorators': route['decorators']
                    })
                else:
                    results['unauthenticated_endpoints'] += 1
                    results['public_endpoints'].append({
                        'file': str(relative_path),
                        'function': route['function'],
                        'methods': route['methods']
                    })

                    # Flag if state-changing without auth
                    if route['is_state_changing']:
                        warning = " - WARNING: State-changing endpoint without auth!"
                        results['missing_auth'].append({
                            'file': str(relative_path),
                            'function': route['function'],
                            'methods': route['methods']
                        })

                if route['is_state_changing']:
                    results['state_changing_endpoints'] += 1
                    if route['has_auth']:
                        results['state_changing_with_auth'] += 1

                print(f"  [{status}] {route['function']}")
                print(f"    Methods: {', '.join(route['methods'])}")
                if route['decorators']:
                    print(f"    Decorators: {', '.join(route['decorators'])}")
                if warning:
                    print(f"    {warning}")

    # Print summary
    print("\n" + "=" * 80)
    print("SECURITY AUDIT SUMMARY")
    print("=" * 80)
    print(f"\nTotal Endpoints: {results['total_endpoints']}")
    print(f"  Protected (with auth): {results['authenticated_endpoints']}")
    print(f"  Public (no auth): {results['unauthenticated_endpoints']}")
    print(f"\nState-Changing Endpoints (POST/PUT/DELETE/PATCH): {results['state_changing_endpoints']}")
    print(f"  With Authentication: {results['state_changing_with_auth']}")
    print(f"  Without Authentication: {len(results['missing_auth'])}")

    # Known public endpoints that should be allowed
    known_public = [
        'health',  # Health check
        'login', 'register', 'refresh_token', 'logout',  # Auth endpoints
        'get_csrf_token',  # CSRF token
        'get_public_portfolio', 'get_public_diploma',  # Public portfolios
        'webhook'  # Stripe webhook
    ]

    print("\n" + "=" * 80)
    print("PUBLIC ENDPOINTS (No Authentication Required)")
    print("=" * 80)
    for endpoint in results['public_endpoints']:
        is_expected = any(known in endpoint['function'].lower() for known in known_public)
        status = "EXPECTED" if is_expected else "REVIEW NEEDED"
        print(f"\n[{status}] {endpoint['file']}")
        print(f"  Function: {endpoint['function']}")
        print(f"  Methods: {', '.join(endpoint['methods'])}")

    if results['missing_auth']:
        print("\n" + "=" * 80)
        print("CRITICAL: STATE-CHANGING ENDPOINTS WITHOUT AUTH")
        print("=" * 80)
        for endpoint in results['missing_auth']:
            is_expected = any(known in endpoint['function'].lower() for known in known_public)
            if not is_expected:
                print(f"\nFILE: {endpoint['file']}")
                print(f"  Function: {endpoint['function']}")
                print(f"  Methods: {', '.join(endpoint['methods'])}")
                print(f"  ACTION REQUIRED: Add @require_auth or similar decorator")

    # Save results to file
    output_file = Path(__file__).parent.parent / 'docs' / 'security_audit_results.json'
    output_file.parent.mkdir(exist_ok=True)

    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n\nDetailed results saved to: {output_file}")

    # Calculate pass/fail
    critical_issues = len([e for e in results['missing_auth']
                          if not any(known in e['function'].lower()
                                   for known in known_public)])

    print("\n" + "=" * 80)
    if critical_issues == 0:
        print("RESULT: PASSED - All endpoints have appropriate authentication")
        return 0
    else:
        print(f"RESULT: FAILED - {critical_issues} critical security issues found")
        return 1

if __name__ == '__main__':
    sys.exit(main())