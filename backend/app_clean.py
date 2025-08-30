"""
Clean, minimal Flask app for Railway-Supabase connection
This version focuses on reliability over features
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
import os
from supabase import create_client, Client

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Simple, explicit CORS configuration
CORS(app, 
     origins=[
         "https://www.optioeducation.com",
         "https://optioeducation.com",
         "https://www.optioed.org",
         "https://optioed.org",
         "http://localhost:3000",
         "http://localhost:5173"
     ],
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     supports_credentials=True)

# Supabase configuration with clear error handling
SUPABASE_URL = os.getenv('SUPABASE_URL')
SUPABASE_KEY = os.getenv('SUPABASE_KEY') or os.getenv('SUPABASE_ANON_KEY')
SUPABASE_SERVICE_KEY = os.getenv('SUPABASE_SERVICE_KEY') or os.getenv('SUPABASE_SERVICE_ROLE_KEY')

print("=" * 60)
print("CLEAN APP STARTUP")
print("=" * 60)
print(f"Supabase URL: {SUPABASE_URL[:30]}..." if SUPABASE_URL else "Supabase URL: NOT SET")
print(f"Supabase Key: {'SET' if SUPABASE_KEY else 'NOT SET'}")
print(f"Service Key: {'SET' if SUPABASE_SERVICE_KEY else 'NOT SET'}")
print(f"Port: {os.getenv('PORT', '5001')}")
print("=" * 60)

# Initialize Supabase client
supabase_client = None
if SUPABASE_URL and SUPABASE_SERVICE_KEY:
    # Use service key to bypass RLS issues temporarily
    supabase_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)
    print("Using SERVICE KEY for Supabase (bypasses RLS)")
elif SUPABASE_URL and SUPABASE_KEY:
    supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("Using ANON KEY for Supabase (RLS enabled)")
else:
    print("ERROR: Cannot initialize Supabase client - missing configuration")

@app.route('/')
def root():
    """Basic root endpoint"""
    return jsonify({
        'status': 'running',
        'app': 'Optio Quest Platform (Clean)',
        'supabase_configured': supabase_client is not None
    })

@app.route('/api/health')
def health():
    """Health check with Supabase connection test"""
    return jsonify({
        'status': 'healthy'
    })

@app.route('/api/test-connection')
def test_connection():
    """Detailed connection test"""
    tests = []
    
    # Test 1: Environment variables
    tests.append({
        'test': 'environment_variables',
        'supabase_url': bool(SUPABASE_URL),
        'supabase_key': bool(SUPABASE_KEY),
        'service_key': bool(SUPABASE_SERVICE_KEY)
    })
    
    # Test 2: Supabase client initialization
    tests.append({
        'test': 'client_initialized',
        'result': supabase_client is not None
    })
    
    # Test 3: Database queries
    if supabase_client:
        # Test with service key (bypasses RLS)
        try:
            result = supabase_client.table('users').select('id').limit(1).execute()
            tests.append({
                'test': 'users_table_query',
                'result': 'success',
                'row_count': len(result.data) if result.data else 0
            })
        except Exception as e:
            tests.append({
                'test': 'users_table_query',
                'result': 'failed',
                'error': str(e)[:100]
            })
        
        # Test site_settings (usually public)
        try:
            result = supabase_client.table('site_settings').select('*').limit(1).execute()
            tests.append({
                'test': 'site_settings_query',
                'result': 'success',
                'data': result.data[0] if result.data else None
            })
        except Exception as e:
            tests.append({
                'test': 'site_settings_query',
                'result': 'failed',
                'error': str(e)[:100]
            })
    
    return jsonify({
        'status': 'test_complete',
        'tests': tests,
        'recommendation': get_recommendation(tests)
    })

def get_recommendation(tests):
    """Provide recommendation based on test results"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return "Set SUPABASE_URL and SUPABASE_KEY environment variables in Railway"
    
    if not supabase_client:
        return "Failed to initialize Supabase client - check your keys"
    
    for test in tests:
        if test.get('test') == 'users_table_query' and test.get('result') == 'failed':
            if 'infinite recursion' in test.get('error', ''):
                return "RLS infinite recursion detected - apply the migration fix in Supabase"
            return f"Database connection issue: {test.get('error', 'unknown')}"
    
    return "Connection appears to be working correctly"

@app.route('/api/echo', methods=['POST'])
def echo():
    """Simple echo endpoint to test POST requests"""
    data = request.get_json()
    return jsonify({
        'received': data,
        'headers': dict(request.headers)
    })

if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    app.run(host='0.0.0.0', port=port)