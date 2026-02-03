# Optio Platform API Documentation

This document explains how to generate and use the OpenAPI specification for the Optio Platform API.

## Overview

The Optio Platform provides a comprehensive RESTful API with OpenAPI 3.0 documentation. The API supports:

- **Authentication**: httpOnly cookies with CSRF protection
- **Quests & Tasks**: Learning journey management
- **Badges & Achievements**: Gamification system
- **Parent/Observer Dashboards**: Family engagement
- **Admin Tools**: Platform management
- **AI Tutor**: Personalized learning assistance
- **LMS Integration**: LTI and course imports

## Interactive API Documentation

### Accessing Swagger UI

The platform includes built-in Swagger UI for interactive API exploration:

**Development Environment:**
```
https://optio-dev-backend.onrender.com/api/docs
```

**Production Environment:**
```
https://optio-prod-backend.onrender.com/api/docs
```

### Features

- Browse all API endpoints organized by tag
- View request/response schemas
- Test endpoints directly in the browser
- See authentication requirements
- View rate limit information

## Generating OpenAPI Specification

### Prerequisites

The API spec generator requires:
- Python 3.9+
- Flask application fully initialized
- All environment variables configured (see `.env` file)
- Access to the backend codebase

### Method 1: Using the Generator Script (Recommended)

Use the wrapper script that handles environment setup:

```bash
cd backend
python generate_spec.py > openapi_spec.json
```

This will:
1. Set required environment variables
2. Initialize the Flask application
3. Scan all registered routes
4. Generate a complete OpenAPI 3.0 spec
5. Output JSON to stdout (redirect to file)

**Output:**
- `openapi_spec.json` - Complete OpenAPI 3.0 specification

### Method 2: Direct Generator

For advanced use cases, you can use the generator directly:

```python
from app import app
from api_spec_generator import generate_openapi_spec

spec = generate_openapi_spec(app)

# Save to file
import json
with open('openapi_spec.json', 'w') as f:
    json.dump(spec, indent=2, fp=f)
```

### Method 3: On Render (Deployed Environment)

To generate the spec in the deployed environment:

1. SSH into the Render service:
   ```bash
   # Use Render dashboard to access shell
   ```

2. Run the generator:
   ```bash
   python generate_spec.py > /tmp/openapi_spec.json
   cat /tmp/openapi_spec.json
   ```

3. Copy the output and save locally

## Specification Details

### Generated Content

The OpenAPI spec includes:

**Info Section:**
- Title: "Optio Platform API"
- Version: "3.0.0"
- Description: Comprehensive API overview
- Contact information
- License details

**Servers:**
- Development: `https://optio-dev-backend.onrender.com`
- Production: `https://optio-prod-backend.onrender.com`

**Security Schemes:**
- `cookieAuth`: httpOnly cookies (access_token, refresh_token)
- `csrfToken`: X-CSRF-Token header for POST/PUT/DELETE
- `bearerAuth`: Authorization header (Safari/iOS fallback)

**Tags (22 categories):**
- Authentication
- Users
- Quests
- Tasks
- Badges
- Evidence
- Portfolio
- Connections
- Parent Dashboard
- Observer
- Advisor
- Admin - Users
- Admin - Quests
- Admin - Badges
- Admin - Analytics
- Admin - Organizations
- Admin - CRM
- AI Tutor
- LMS Integration
- Calendar
- Settings
- Services
- Promo
- Credits
- Other

**For Each Endpoint:**
- HTTP method(s)
- Path with parameters
- Summary and description
- Request parameters (path, query, header)
- Request body schema (for POST/PUT)
- Response codes and schemas
- Security requirements
- Tags for organization

### Route Coverage

The spec generator automatically discovers and documents ALL registered Flask routes, including:

- Core API routes (`/api/*`)
- Versioned routes (`/api/v1/*`)
- Admin routes (`/api/admin/*`)
- LMS integration (`/lti/*`, `/spark/*`)
- Public endpoints (portfolio, settings, promo)

**Total Routes:** 200+ endpoints across all modules

## Validation

### Online Validation

Validate the generated spec at:

**Swagger Editor:**
```
https://editor.swagger.io/
```

Steps:
1. Copy the contents of `openapi_spec.json`
2. Paste into Swagger Editor
3. Editor will show validation errors (if any)
4. Fix any issues and regenerate

**Swagger Inspector:**
```
https://inspector.swagger.io/builder
```

### Command Line Validation

Using `swagger-cli`:

```bash
npm install -g swagger-cli
swagger-cli validate openapi_spec.json
```

Using `openapi-spec-validator`:

```bash
pip install openapi-spec-validator
openapi-spec-validator openapi_spec.json
```

## Using the Specification

### Client Code Generation

Generate API clients in various languages using OpenAPI Generator:

**JavaScript/TypeScript:**
```bash
openapi-generator-cli generate \
  -i openapi_spec.json \
  -g typescript-axios \
  -o ./generated/api-client
```

**Python:**
```bash
openapi-generator-cli generate \
  -i openapi_spec.json \
  -g python \
  -o ./generated/python-client
```

**Other Languages:**
Supports 40+ languages including Java, Go, Ruby, PHP, Swift, Kotlin

### API Testing

Use the spec for automated testing:

**Postman:**
1. Import `openapi_spec.json` into Postman
2. Generates full collection of requests
3. Pre-configured with auth and parameters

**Insomnia:**
1. Import OpenAPI spec
2. Auto-generates request workspace
3. Supports environment variables

**Bruno:**
1. Import OpenAPI spec
2. Git-friendly API client
3. Offline-first approach

### Documentation Publishing

Generate static documentation sites:

**Redoc:**
```bash
npx redoc-cli bundle openapi_spec.json -o api-docs.html
```

**Swagger UI (Static):**
```bash
npx swagger-ui-cli bundle openapi_spec.json -o api-docs/
```

**RapiDoc:**
```html
<!DOCTYPE html>
<html>
<head>
  <script type="module" src="https://unpkg.com/rapidoc/dist/rapidoc-min.js"></script>
</head>
<body>
  <rapi-doc spec-url="openapi_spec.json"></rapi-doc>
</body>
</html>
```

## Maintenance

### When to Regenerate

Regenerate the OpenAPI spec when:

1. **New routes are added**
   - New blueprints registered
   - New endpoints created

2. **Route changes occur**
   - Path parameters modified
   - HTTP methods changed
   - Authentication requirements updated

3. **Documentation updates needed**
   - Better descriptions required
   - Examples need updating
   - New response codes added

4. **Before major releases**
   - Ensure spec is up-to-date
   - Validate against current codebase
   - Update version number

### Updating the Generator

The spec generator is maintained in:
- `backend/api_spec_generator.py` - Main generator logic
- `backend/swagger_config.py` - Swagger UI configuration
- `backend/swagger_models.py` - Schema definitions
- `backend/generate_spec.py` - Wrapper script

**To add a new blueprint:**

1. Edit `api_spec_generator.py`
2. Add to `tag_mapping` dictionary:
   ```python
   'my_blueprint_name': 'My Tag Category',
   ```

3. Regenerate the spec

**To update endpoint descriptions:**

1. Edit `generate_summary()` function
2. Add custom summary for your endpoint:
   ```python
   summaries = {
       '/api/my/endpoint': 'My custom summary',
       # ...
   }
   ```

3. Edit `generate_description()` function for detailed descriptions

**To add response schemas:**

1. Edit `swagger_models.py`
2. Add new model definition:
   ```python
   MY_MODEL = {
       "type": "object",
       "properties": {
           "field": {"type": "string", "example": "value"}
       }
   }
   ```

3. Add to `DEFINITIONS` export

## Troubleshooting

### Common Issues

**1. Generator hangs or fails**

Likely causes:
- Missing environment variables
- Database connection issues
- Import errors in route modules

Solution:
- Check `.env` file has all required vars
- Use `generate_spec.py` wrapper which sets minimal config
- Check Flask app initializes without errors

**2. Routes missing from spec**

Likely causes:
- Blueprint not registered in `app.py`
- Blueprint name not in `tag_mapping`
- Route decorator syntax issues

Solution:
- Verify blueprint is registered: `app.register_blueprint(bp)`
- Add blueprint name to `tag_mapping`
- Check route uses `@bp.route()` decorator

**3. Validation errors**

Likely causes:
- Invalid OpenAPI syntax
- Incorrect schema references
- Missing required fields

Solution:
- Use Swagger Editor to identify exact error
- Check OpenAPI 3.0 specification
- Fix generator code and regenerate

**4. Security schemes not working**

Likely causes:
- Cookie settings incorrect
- CSRF token not included
- CORS issues

Solution:
- Check `/csrf-token` endpoint works
- Verify cookies are httpOnly and Secure
- Test authentication flow manually

## Best Practices

1. **Keep spec updated**
   - Regenerate monthly or after major changes
   - Include in CI/CD pipeline

2. **Version the spec**
   - Commit to git: `backend/openapi_spec.json`
   - Track changes in version control
   - Tag releases with spec version

3. **Validate regularly**
   - Run validation before commits
   - Check for breaking changes
   - Test generated clients

4. **Document thoroughly**
   - Add detailed descriptions
   - Include examples
   - Explain authentication flow

5. **Monitor usage**
   - Track API adoption
   - Gather client feedback
   - Update based on usage patterns

## Support

For issues with API documentation:

- GitHub Issues: https://github.com/anthropics/claude-code/issues
- Email: support@optioeducation.com
- Slack: #api-support (internal)

## References

- OpenAPI Specification: https://spec.openapis.org/oas/v3.0.0
- Swagger UI: https://swagger.io/tools/swagger-ui/
- OpenAPI Generator: https://openapi-generator.tech/
- Flask API documentation: https://flask.palletsprojects.com/
