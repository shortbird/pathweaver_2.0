#!/usr/bin/env python3
"""
Script to fix API path issues by removing /api from frontend code
"""

import os
import re
import glob

def fix_api_paths():
    """Fix API path patterns in all JSX files"""
    
    # Find all JSX files in frontend/src
    jsx_files = glob.glob("frontend/src/**/*.jsx", recursive=True)
    
    print(f"Found {len(jsx_files)} JSX files to process...")
    
    for file_path in jsx_files:
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            original_content = content
            
            # Pattern 1: Fix apiBase fallback to remove /api
            content = re.sub(
                r"import\.meta\.env\.VITE_API_URL \|\| '/api'",
                "import.meta.env.VITE_API_URL || ''",
                content
            )
            
            # Pattern 2: Remove /api/ from fetch URLs (keep the rest of the path)
            content = re.sub(
                r'\$\{apiBase\}/api/',
                '${apiBase}/',
                content
            )
            
            # Pattern 3: Handle direct /api/ paths in fetch calls
            content = re.sub(
                r'fetch\(`/api/',
                'fetch(`/',
                content
            )
            
            # Pattern 4: Handle template literals with direct api paths
            content = re.sub(
                r'`/api/([^`]*)`',
                r'`/\1`',
                content
            )
            
            # Pattern 5: Handle api service calls (api.get('/api/...') -> api.get('/...'))
            content = re.sub(
                r"api\.(get|post|put|patch|delete)\(['\"]\/api\/([^'\"]*)['\"]",
                r"api.\1('/\2'",
                content
            )
            
            # Pattern 6: Handle template literals with VITE_API_URL + /api/
            content = re.sub(
                r'\$\{import\.meta\.env\.VITE_API_URL\}\/api\/',
                '${import.meta.env.VITE_API_URL}/',
                content
            )
            
            # Only write if content changed
            if content != original_content:
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"Fixed: {file_path}")
                
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
    
    print("API path fixes completed!")

if __name__ == "__main__":
    fix_api_paths()