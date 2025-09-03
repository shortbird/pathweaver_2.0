#!/usr/bin/env python3
"""
Backend Endpoint and Database Table Audit Script
Scans all backend Python files to identify:
1. Which endpoints exist
2. Which database tables they reference
3. Whether they use legacy (integer ID) or new (UUID) tables
"""

import os
import re
import ast
from pathlib import Path
from collections import defaultdict
import json
from datetime import datetime

# Define legacy vs new tables
LEGACY_TABLES = {
    'user', 'student', 'parent', 'advisor', 'goal', 'milestone', 
    'credit', 'goal_credits', 'milestone_credits', 'task', 'comment',
    'notification', 'role', 'roles_users', 'pending_child', 'parent_child',
    'advisors_students', 'student_logs', 'discovery_goal_responses',
    'goal_frameworks', 'goal_starters', 'case_studies', 'document_signatures',
    'document_templates', 'ai_usage_tracker', 'student_activity',
    'user_action_logs', 'password_reset_tokens'
}

NEW_TABLES = {
    'users', 'quests', 'quest_tasks', 'quest_task_completions',
    'user_skill_xp', 'user_quests', 'quest_submissions', 'quest_xp_awards',
    'friendships', 'team_requests', 'activity_log', 'submissions',
    'submission_evidence'
}

# Tables that might not exist (referenced in docs but not in schema)
MISSING_TABLES = {
    'quest_tasks', 'quest_task_completions', 'user_skill_xp', 
    'quest_submissions', 'team_requests'
}

class EndpointAuditor:
    def __init__(self, backend_path='backend'):
        self.backend_path = Path(backend_path)
        self.endpoints = defaultdict(lambda: {
            'file': '',
            'methods': [],
            'tables_used': set(),
            'legacy_tables': set(),
            'new_tables': set(),
            'missing_tables': set(),
            'raw_queries': [],
            'supabase_calls': [],
            'warnings': []
        })
        
    def scan_directory(self):
        """Scan all Python files in the backend directory"""
        print(f"🔍 Scanning {self.backend_path}...")
        
        routes_path = self.backend_path / 'routes'
        services_path = self.backend_path / 'services'
        
        # Scan routes directory
        if routes_path.exists():
            for file_path in routes_path.glob('*.py'):
                self.analyze_file(file_path, is_route=True)
        
        # Scan services directory
        if services_path.exists():
            for file_path in services_path.glob('*.py'):
                self.analyze_file(file_path, is_route=False)
        
        # Also scan root backend files
        for file_path in self.backend_path.glob('*.py'):
            if file_path.is_file():
                self.analyze_file(file_path, is_route=False)
    
    def analyze_file(self, file_path, is_route=False):
        """Analyze a Python file for endpoints and database usage"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Find Flask routes
            if is_route:
                self.find_routes(content, file_path)
            
            # Find database table references
            self.find_table_references(content, file_path)
            
        except Exception as e:
            print(f"❌ Error analyzing {file_path}: {e}")
    
    def find_routes(self, content, file_path):
        """Extract Flask route definitions"""
        # Patterns for Flask routes
        route_patterns = [
            r'@.*\.route\([\'"]([^\'"]+)[\'"]\s*(?:,\s*methods=\[(.*?)\])?\)',
            r'@app\.route\([\'"]([^\'"]+)[\'"]\s*(?:,\s*methods=\[(.*?)\])?\)',
            r'@blueprint\.route\([\'"]([^\'"]+)[\'"]\s*(?:,\s*methods=\[(.*?)\])?\)',
            r'@bp\.route\([\'"]([^\'"]+)[\'"]\s*(?:,\s*methods=\[(.*?)\])?\)',
        ]
        
        for pattern in route_patterns:
            matches = re.finditer(pattern, content, re.MULTILINE)
            for match in matches:
                route = match.group(1)
                methods = match.group(2) if len(match.groups()) > 1 else 'GET'
                if methods:
                    methods = [m.strip().strip('"\'') for m in methods.split(',')]
                else:
                    methods = ['GET']
                
                self.endpoints[route]['file'] = str(file_path.relative_to(self.backend_path))
                self.endpoints[route]['methods'] = methods
    
    def find_table_references(self, content, file_path):
        """Find all database table references in the code"""
        file_rel_path = str(file_path.relative_to(self.backend_path))
        
        # Pattern for Supabase table calls
        supabase_patterns = [
            r'supabase\.table\([\'"]([^\'"]+)[\'"]\)',
            r'supabase\.from_\([\'"]([^\'"]+)[\'"]\)',
            r'\.from\([\'"]([^\'"]+)[\'"]\)',
            r'supabase\.rpc\([\'"]([^\'"]+)[\'"]\)',
        ]
        
        # Pattern for raw SQL queries
        sql_patterns = [
            r'FROM\s+["\']?(\w+)["\']?',
            r'JOIN\s+["\']?(\w+)["\']?',
            r'INTO\s+["\']?(\w+)["\']?',
            r'UPDATE\s+["\']?(\w+)["\']?',
            r'INSERT\s+INTO\s+["\']?(\w+)["\']?',
            r'DELETE\s+FROM\s+["\']?(\w+)["\']?',
        ]
        
        # Find all endpoints that might be in this file
        file_endpoints = [ep for ep, data in self.endpoints.items() if data['file'] == file_rel_path]
        
        # If no specific endpoints found, create a general entry for the file
        if not file_endpoints and ('service' in file_rel_path.lower() or 'util' in file_rel_path.lower()):
            file_endpoints = [f"[Service: {file_rel_path}]"]
            self.endpoints[file_endpoints[0]]['file'] = file_rel_path
        
        # Find Supabase calls
        for pattern in supabase_patterns:
            matches = re.finditer(pattern, content, re.IGNORECASE)
            for match in matches:
                table = match.group(1)
                context = self.get_context(content, match.span()[0], 50)
                
                for endpoint in file_endpoints or [f"[File: {file_rel_path}]"]:
                    self.endpoints[endpoint]['tables_used'].add(table)
                    self.endpoints[endpoint]['supabase_calls'].append({
                        'table': table,
                        'context': context
                    })
                    
                    # Categorize the table
                    if table in LEGACY_TABLES:
                        self.endpoints[endpoint]['legacy_tables'].add(table)
                        self.endpoints[endpoint]['warnings'].append(
                            f"⚠️ Using legacy table: {table}"
                        )
                    elif table in NEW_TABLES:
                        self.endpoints[endpoint]['new_tables'].add(table)
                        if table in MISSING_TABLES:
                            self.endpoints[endpoint]['missing_tables'].add(table)
                            self.endpoints[endpoint]['warnings'].append(
                                f"🔴 Using potentially missing table: {table}"
                            )
        
        # Find raw SQL queries
        if 'SELECT' in content.upper() or 'INSERT' in content.upper() or 'UPDATE' in content.upper():
            for pattern in sql_patterns:
                matches = re.finditer(pattern, content, re.IGNORECASE)
                for match in matches:
                    table = match.group(1).lower()
                    if table in LEGACY_TABLES or table in NEW_TABLES:
                        context = self.get_context(content, match.span()[0], 80)
                        
                        for endpoint in file_endpoints or [f"[File: {file_rel_path}]"]:
                            self.endpoints[endpoint]['tables_used'].add(table)
                            self.endpoints[endpoint]['raw_queries'].append({
                                'table': table,
                                'context': context
                            })
                            
                            if table in LEGACY_TABLES:
                                self.endpoints[endpoint]['legacy_tables'].add(table)
                                self.endpoints[endpoint]['warnings'].append(
                                    f"⚠️ Raw SQL using legacy table: {table}"
                                )
    
    def get_context(self, content, position, context_length=50):
        """Get surrounding context for a match"""
        start = max(0, position - context_length)
        end = min(len(content), position + context_length)
        context = content[start:end].replace('\n', ' ').strip()
        return f"...{context}..."
    
    def generate_report(self):
        """Generate a comprehensive audit report"""
        report = {
            'timestamp': datetime.now().isoformat(),
            'summary': {
                'total_endpoints': len(self.endpoints),
                'endpoints_using_legacy': 0,
                'endpoints_using_new': 0,
                'endpoints_using_both': 0,
                'endpoints_using_missing': 0,
                'legacy_tables_found': set(),
                'new_tables_found': set(),
                'missing_tables_referenced': set()
            },
            'endpoints': {},
            'critical_issues': [],
            'recommendations': []
        }
        
        # Analyze each endpoint
        for endpoint, data in self.endpoints.items():
            has_legacy = len(data['legacy_tables']) > 0
            has_new = len(data['new_tables']) > 0
            has_missing = len(data['missing_tables']) > 0
            
            if has_legacy:
                report['summary']['endpoints_using_legacy'] += 1
                report['summary']['legacy_tables_found'].update(data['legacy_tables'])
            
            if has_new:
                report['summary']['endpoints_using_new'] += 1
                report['summary']['new_tables_found'].update(data['new_tables'])
            
            if has_missing:
                report['summary']['endpoints_using_missing'] += 1
                report['summary']['missing_tables_referenced'].update(data['missing_tables'])
            
            if has_legacy and has_new:
                report['summary']['endpoints_using_both'] += 1
                report['critical_issues'].append(
                    f"🔴 {endpoint} uses BOTH legacy and new tables - high risk of data inconsistency"
                )
            
            # Add endpoint details to report
            report['endpoints'][endpoint] = {
                'file': data['file'],
                'methods': data['methods'],
                'status': self.get_status(has_legacy, has_new, has_missing),
                'tables': {
                    'all': list(data['tables_used']),
                    'legacy': list(data['legacy_tables']),
                    'new': list(data['new_tables']),
                    'missing': list(data['missing_tables'])
                },
                'warnings': data['warnings']
            }
        
        # Add recommendations
        report['recommendations'] = self.generate_recommendations(report)
        
        # Convert sets to lists for JSON serialization
        report['summary']['legacy_tables_found'] = list(report['summary']['legacy_tables_found'])
        report['summary']['new_tables_found'] = list(report['summary']['new_tables_found'])
        report['summary']['missing_tables_referenced'] = list(report['summary']['missing_tables_referenced'])
        
        return report
    
    def get_status(self, has_legacy, has_new, has_missing):
        """Determine endpoint status"""
        if has_missing:
            return "🔴 CRITICAL - Using non-existent tables"
        elif has_legacy and has_new:
            return "🔴 DANGER - Mixed legacy/new tables"
        elif has_legacy:
            return "⚠️ WARNING - Using legacy tables"
        elif has_new:
            return "✅ OK - Using new tables"
        else:
            return "ℹ️ No database usage detected"
    
    def generate_recommendations(self, report):
        """Generate actionable recommendations based on findings"""
        recommendations = []
        
        if report['summary']['missing_tables_referenced']:
            recommendations.append({
                'priority': 'CRITICAL',
                'action': 'Create missing tables immediately',
                'details': f"Tables needed: {', '.join(report['summary']['missing_tables_referenced'])}"
            })
        
        if report['summary']['endpoints_using_both'] > 0:
            recommendations.append({
                'priority': 'HIGH',
                'action': 'Fix endpoints using both legacy and new tables',
                'details': 'These endpoints may cause data inconsistency'
            })
        
        if report['summary']['endpoints_using_legacy'] > 0:
            recommendations.append({
                'priority': 'MEDIUM',
                'action': 'Migrate all legacy table usage to new tables',
                'details': f"Found {report['summary']['endpoints_using_legacy']} endpoints using legacy tables"
            })
        
        return recommendations
    
    def print_report(self, report):
        """Print a formatted report to console"""
        print("\n" + "="*80)
        print("📊 BACKEND ENDPOINT AUDIT REPORT")
        print("="*80)
        print(f"Generated: {report['timestamp']}")
        print("\n📈 SUMMARY:")
        print(f"  Total Endpoints: {report['summary']['total_endpoints']}")
        print(f"  Using Legacy Tables: {report['summary']['endpoints_using_legacy']}")
        print(f"  Using New Tables: {report['summary']['endpoints_using_new']}")
        print(f"  Using Both (DANGER): {report['summary']['endpoints_using_both']}")
        print(f"  Using Missing Tables: {report['summary']['endpoints_using_missing']}")
        
        if report['critical_issues']:
            print("\n🚨 CRITICAL ISSUES:")
            for issue in report['critical_issues']:
                print(f"  {issue}")
        
        print("\n📋 ENDPOINT DETAILS:")
        for endpoint, data in report['endpoints'].items():
            if data['warnings']:  # Only show endpoints with issues
                print(f"\n  {endpoint}")
                print(f"    File: {data['file']}")
                print(f"    Status: {data['status']}")
                if data['tables']['legacy']:
                    print(f"    Legacy tables: {', '.join(data['tables']['legacy'])}")
                if data['tables']['missing']:
                    print(f"    Missing tables: {', '.join(data['tables']['missing'])}")
        
        print("\n💡 RECOMMENDATIONS:")
        for rec in report['recommendations']:
            print(f"  [{rec['priority']}] {rec['action']}")
            print(f"    → {rec['details']}")
        
        print("\n" + "="*80)
    
    def save_report(self, report, filename='endpoint_audit_report.json'):
        """Save the report to a JSON file"""
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)
        print(f"\n💾 Full report saved to: {filename}")

def main():
    """Run the audit"""
    import sys
    
    # Allow custom backend path
    backend_path = sys.argv[1] if len(sys.argv) > 1 else 'backend'
    
    if not Path(backend_path).exists():
        print(f"❌ Backend directory '{backend_path}' not found!")
        print("Usage: python audit_endpoints.py [backend_path]")
        return
    
    print("🚀 Starting Backend Endpoint Audit...")
    print(f"   Scanning: {backend_path}")
    print("-" * 80)
    
    auditor = EndpointAuditor(backend_path)
    auditor.scan_directory()
    report = auditor.generate_report()
    
    # Print to console
    auditor.print_report(report)
    
    # Save to file
    auditor.save_report(report)
    
    # Print action items
    print("\n⚡ IMMEDIATE ACTIONS REQUIRED:")
    print("1. Run this script: python audit_endpoints.py")
    print("2. Review endpoint_audit_report.json for full details")
    print("3. Create missing tables (quest_tasks, quest_task_completions, etc.)")
    print("4. Fix endpoints using both legacy and new tables")
    print("5. Begin migrating legacy endpoints to new tables")

if __name__ == "__main__":
    main()