#!/bin/bash

##
# Generate OpenAPI Specification for Optio Platform API
#
# This script generates a complete OpenAPI 3.0 specification from all
# registered Flask routes. It can be run locally or on Render.
#
# Usage:
#   ./generate_openapi_spec.sh [output_file]
#
# Arguments:
#   output_file - Optional. Path to save the spec (default: openapi_spec.json)
#
# Environment:
#   Requires all standard Flask environment variables to be set:
#   - FLASK_SECRET_KEY or SECRET_KEY
#   - SUPABASE_URL
#   - SUPABASE_ANON_KEY
#   - SUPABASE_SERVICE_KEY
#   - etc.
#
# Examples:
#   # Generate spec to default location
#   ./generate_openapi_spec.sh
#
#   # Generate spec to custom location
#   ./generate_openapi_spec.sh /tmp/api_spec.json
#
#   # Generate and view
#   ./generate_openapi_spec.sh | jq .
##

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Output file (default or from argument)
OUTPUT_FILE="${1:-openapi_spec.json}"

echo -e "${YELLOW}Optio Platform - OpenAPI Spec Generator${NC}"
echo "=========================================="
echo ""

# Check if we're in the backend directory
if [ ! -f "app.py" ]; then
    echo -e "${RED}Error: Must be run from the backend directory${NC}"
    echo "Current directory: $(pwd)"
    echo "Please cd to the backend directory and try again."
    exit 1
fi

# Check if .env file exists (for local development)
if [ -f ".env" ]; then
    echo -e "${GREEN}✓${NC} Found .env file (local development mode)"
else
    echo -e "${YELLOW}!${NC} No .env file found (using environment variables)"
fi

# Check required environment variables
echo ""
echo "Checking required environment variables..."

check_env_var() {
    local var_name="$1"
    if [ -z "${!var_name}" ]; then
        echo -e "${RED}✗${NC} Missing: $var_name"
        return 1
    else
        echo -e "${GREEN}✓${NC} Found: $var_name"
        return 0
    fi
}

MISSING_VARS=0

# Check critical variables
if ! check_env_var "SECRET_KEY" && ! check_env_var "FLASK_SECRET_KEY"; then
    echo -e "${RED}Error: Either SECRET_KEY or FLASK_SECRET_KEY must be set${NC}"
    MISSING_VARS=1
fi

check_env_var "SUPABASE_URL" || MISSING_VARS=1
check_env_var "SUPABASE_ANON_KEY" || MISSING_VARS=1
check_env_var "SUPABASE_SERVICE_KEY" || MISSING_VARS=1

if [ $MISSING_VARS -eq 1 ]; then
    echo ""
    echo -e "${RED}Error: Missing required environment variables${NC}"
    echo "Please set the missing variables and try again."
    exit 1
fi

# Generate the spec
echo ""
echo "Generating OpenAPI specification..."
echo "Output: $OUTPUT_FILE"
echo ""

if python generate_spec.py > "$OUTPUT_FILE" 2>&1; then
    # Check if file was created and has content
    if [ -f "$OUTPUT_FILE" ] && [ -s "$OUTPUT_FILE" ]; then
        # Get file size
        if command -v wc &> /dev/null; then
            LINE_COUNT=$(wc -l < "$OUTPUT_FILE")
            FILE_SIZE=$(du -h "$OUTPUT_FILE" | cut -f1)

            echo ""
            echo -e "${GREEN}✓ Success!${NC}"
            echo "  File: $OUTPUT_FILE"
            echo "  Size: $FILE_SIZE"
            echo "  Lines: $LINE_COUNT"
        else
            echo ""
            echo -e "${GREEN}✓ Success!${NC}"
            echo "  File: $OUTPUT_FILE"
        fi

        # Try to extract endpoint count from JSON
        if command -v jq &> /dev/null; then
            ENDPOINT_COUNT=$(jq -r '.info."x-route-count" // "unknown"' "$OUTPUT_FILE")
            echo "  Endpoints: $ENDPOINT_COUNT"
        fi

        echo ""
        echo "Next steps:"
        echo "  1. Validate at: https://editor.swagger.io/"
        echo "  2. View interactive docs at: /api/docs"
        echo "  3. Commit to git: git add $OUTPUT_FILE"
        echo ""
        exit 0
    else
        echo -e "${RED}✗ Error: Output file is empty or was not created${NC}"
        exit 1
    fi
else
    echo -e "${RED}✗ Error: Spec generation failed${NC}"
    echo ""
    echo "Check the error output above for details."
    echo "Common issues:"
    echo "  - Missing Python dependencies"
    echo "  - Flask app initialization errors"
    echo "  - Database connection issues"
    echo ""
    exit 1
fi
