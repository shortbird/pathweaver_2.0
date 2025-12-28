"""
Script to generate OpenAPI spec with required environment variables set.
"""

import os
import sys
import json

print("Step 1: Setting environment variables...", file=sys.stderr)

# Set required environment variables
os.environ['FLASK_SECRET_KEY'] = 'temp-secret-key-for-openapi-generation-only-do-not-use-in-production-12345678'
os.environ['FLASK_ENV'] = 'development'

# Set minimal Supabase config (not used for spec generation but might be checked)
os.environ.setdefault('SUPABASE_URL', 'https://example.supabase.co')
os.environ.setdefault('SUPABASE_ANON_KEY', 'temp-key-for-spec-generation')
os.environ.setdefault('SUPABASE_SERVICE_KEY', 'temp-key-for-spec-generation')

print("Step 2: Loading .env file...", file=sys.stderr)
from dotenv import load_dotenv
load_dotenv()

# Now import and run the spec generator
try:
    print("Step 3: Importing Flask app...", file=sys.stderr)
    from app import app

    print("Step 4: Importing spec generator...", file=sys.stderr)
    from api_spec_generator import generate_openapi_spec

    print("Step 5: Generating OpenAPI specification...", file=sys.stderr)
    spec = generate_openapi_spec(app)

    print("Step 6: Writing JSON output...", file=sys.stderr)
    # Print to stdout for redirection to file
    print(json.dumps(spec, indent=2))

    # Print stats to stderr
    print(f"\nSUCCESS: Generated OpenAPI spec with {spec['info']['x-route-count']} endpoints", file=sys.stderr)
    print(f"Validate at: https://editor.swagger.io/", file=sys.stderr)

except Exception as e:
    print(f"ERROR at current step: {e}", file=sys.stderr)
    import traceback
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)
