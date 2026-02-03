# Backend Scripts

This directory contains utility scripts for the Optio Platform backend.

## API Documentation Scripts

### generate_openapi_spec.sh

Generates a complete OpenAPI 3.0 specification from all registered Flask routes.

**Usage:**
```bash
cd backend
./scripts/generate_openapi_spec.sh [output_file]
```

**Arguments:**
- `output_file` - Optional. Path to save the spec (default: `openapi_spec.json`)

**Requirements:**
- Python 3.9+
- All environment variables configured (see `.env`)
- Flask app dependencies installed

**Examples:**
```bash
# Generate to default location (backend/openapi_spec.json)
./scripts/generate_openapi_spec.sh

# Generate to custom location
./scripts/generate_openapi_spec.sh /tmp/api_spec.json

# Generate and pipe to jq for formatting
./scripts/generate_openapi_spec.sh /tmp/spec.json && jq . /tmp/spec.json
```

**On Render:**
```bash
# Access Render shell via dashboard, then:
cd /opt/render/project/src/backend
./scripts/generate_openapi_spec.sh
cat openapi_spec.json
```

**Validation:**
```bash
# Upload to Swagger Editor
open https://editor.swagger.io/

# Or use CLI validator
npm install -g swagger-cli
swagger-cli validate openapi_spec.json
```

**Output:**
- Complete OpenAPI 3.0 specification
- 200+ documented endpoints
- Request/response schemas
- Authentication requirements
- Rate limit information

See [../docs/API_DOCUMENTATION.md](../docs/API_DOCUMENTATION.md) for full documentation.

## Database Scripts

### apply_performance_indexes.py

Applies database performance indexes to improve query performance.

**Usage:**
```bash
python scripts/apply_performance_indexes.py
```

Indexes include:
- User queries (role, organization)
- Quest queries (pillar, difficulty, type)
- Task queries (user_id, quest_id, status)
- Badge queries (pillar, rarity)
- Evidence queries (user_id, task_id)
- Friendship queries (user IDs, status)

## Analytics Scripts

### anonymize_activity_data.py

Anonymizes user activity data for COPPA/GDPR compliance.

**Usage:**
```bash
python scripts/anonymize_activity_data.py
```

**Schedule:**
Run daily via cron job:
```bash
# Render Cron Job
0 2 * * * cd /opt/render/project/src/backend && python scripts/anonymize_activity_data.py
```

**Privacy Policy:**
- 90-day detailed retention
- PII removal after 90 days
- Hard deletion after 2 years

See [ANONYMIZATION_README.md](ANONYMIZATION_README.md) for details.

## Maintenance Scripts

Scripts for regular maintenance tasks:

- **anonymize_activity_data.py** - Daily GDPR/COPPA compliance
- **apply_performance_indexes.py** - One-time or as-needed
- **generate_openapi_spec.sh** - As-needed for API updates

## Adding New Scripts

When adding a new script:

1. **Create the script**
   - Add to `backend/scripts/`
   - Use clear, descriptive name
   - Include shebang line (`#!/bin/bash` or `#!/usr/bin/env python`)

2. **Make executable** (for shell scripts)
   ```bash
   chmod +x scripts/your_script.sh
   ```

3. **Document it**
   - Add usage examples
   - Describe requirements
   - Explain when to run
   - Update this README

4. **Test it**
   - Test locally (if allowed)
   - Test on dev environment
   - Verify error handling
   - Check output

5. **Version control**
   ```bash
   git add scripts/your_script.sh
   git commit -m "Add script for X"
   ```

## Best Practices

**Shell Scripts (.sh):**
- Use `set -e` to exit on errors
- Add color coding for output
- Validate environment variables
- Provide helpful error messages
- Include usage documentation in comments

**Python Scripts (.py):**
- Use argparse for CLI arguments
- Add logging with proper levels
- Handle errors gracefully
- Include docstrings
- Follow PEP 8 style guide

**Both:**
- Test in both dev and prod environments
- Consider idempotency (safe to run multiple times)
- Add dry-run mode for destructive operations
- Log all actions for audit trails
- Document scheduling if recurring

## Support

For issues with scripts:
- GitHub Issues: https://github.com/anthropics/claude-code/issues
- Email: support@optioeducation.com
