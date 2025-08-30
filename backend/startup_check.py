"""
Startup validation to catch deployment issues early
"""
import os
import sys
import requests
from datetime import datetime

def check_deployment_environment():
    """Check if the deployment environment is properly configured"""
    issues = []
    warnings = []
    
    # Check PORT environment variable
    port = os.getenv('PORT')
    if not port:
        warnings.append("PORT environment variable not set - Railway may not route traffic correctly")
    else:
        print(f"✓ PORT is set to: {port}")
    
    # Check if running on Railway
    if 'RAILWAY_ENVIRONMENT' in os.environ:
        print(f"✓ Running on Railway (environment: {os.getenv('RAILWAY_ENVIRONMENT')})")
    else:
        warnings.append("Not running on Railway - some features may not work")
    
    # Check critical environment variables
    required_vars = {
        'SUPABASE_URL': 'Database connection',
        'SUPABASE_KEY': 'Database authentication',
        'SECRET_KEY': 'Session security'
    }
    
    for var, description in required_vars.items():
        if not os.getenv(var):
            issues.append(f"Missing {var} - {description} will fail")
        else:
            print(f"✓ {var} is configured")
    
    # Check CORS configuration
    frontend_url = os.getenv('FRONTEND_URL')
    if frontend_url:
        print(f"✓ FRONTEND_URL is set to: {frontend_url}")
    else:
        warnings.append("FRONTEND_URL not set - using default CORS origins only")
    
    # Report issues
    if issues:
        print("\n❌ CRITICAL ISSUES FOUND:")
        for issue in issues:
            print(f"  - {issue}")
        print("\nDeployment may fail or have limited functionality")
    
    if warnings:
        print("\n⚠️  WARNINGS:")
        for warning in warnings:
            print(f"  - {warning}")
    
    if not issues and not warnings:
        print("\n✅ All deployment checks passed!")
    
    return len(issues) == 0

def test_cors_headers(test_origin='https://www.optioeducation.com'):
    """Test if CORS headers are properly configured"""
    try:
        # Get the app URL
        railway_domain = os.getenv('RAILWAY_STATIC_URL', 'localhost:5001')
        if not railway_domain.startswith('http'):
            railway_domain = f"https://{railway_domain}"
        
        test_url = f"{railway_domain}/api/health"
        
        print(f"\nTesting CORS with origin: {test_origin}")
        print(f"Testing URL: {test_url}")
        
        # Make a request with Origin header
        headers = {'Origin': test_origin}
        response = requests.get(test_url, headers=headers, timeout=5)
        
        # Check for CORS headers
        cors_origin = response.headers.get('Access-Control-Allow-Origin')
        if cors_origin == test_origin:
            print(f"✓ CORS headers present: {cors_origin}")
            return True
        else:
            print(f"❌ CORS headers missing or incorrect: {cors_origin}")
            return False
            
    except Exception as e:
        print(f"❌ Could not test CORS: {str(e)}")
        return False

if __name__ == '__main__':
    print("=" * 60)
    print("DEPLOYMENT STARTUP CHECK")
    print(f"Time: {datetime.utcnow().isoformat()}")
    print("=" * 60)
    
    # Run checks
    environment_ok = check_deployment_environment()
    
    # Only test CORS if we're actually deployed
    if 'RAILWAY_ENVIRONMENT' in os.environ:
        print("\nWaiting for app to start before testing CORS...")
        import time
        time.sleep(5)  # Give the app time to start
        test_cors_headers()
    
    if not environment_ok:
        print("\n⚠️  Starting with configuration issues - check logs above")