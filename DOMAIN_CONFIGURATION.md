# Domain Configuration

## Approved Production Domains

The following domains are approved for production use with the Optio Quest Platform API:

### Primary Domains
- **optioed.org** - Main educational platform domain
  - https://optioed.org
  - https://www.optioed.org
  - http://optioed.org (for transition)
  - http://www.optioed.org (for transition)

- **optioeducation.com** - Commercial education domain
  - https://optioeducation.com
  - https://www.optioeducation.com
  - http://optioeducation.com (for transition)
  - http://www.optioeducation.com (for transition)

- **optioed.com** - Alternative domain
  - https://optioed.com
  - https://www.optioed.com
  - http://optioed.com (for transition)
  - http://www.optioed.com (for transition)

### Legacy/Development Domains
- https://pathweaver-2-0.vercel.app (Vercel deployment)
- https://pathweaver20-production.up.railway.app (Railway deployment)

## CORS Configuration

All these domains are configured in `backend/cors_config.py` to allow cross-origin requests to the API.

### Production Configuration
In production, only the domains listed above are allowed to make API requests.

### Development Configuration
In development mode (`FLASK_ENV=development`), additional localhost origins are allowed:
- http://localhost:3000
- http://localhost:5173
- http://127.0.0.1:3000
- http://127.0.0.1:5173

## Environment Variables

You can also configure allowed origins using the `ALLOWED_ORIGINS` environment variable:
```bash
ALLOWED_ORIGINS=https://example.com,https://another-domain.com
```

## Security Notes

1. **HTTPS Preferred**: While HTTP versions are included for transition purposes, HTTPS should be used in production for security.

2. **Credentials Support**: The CORS configuration supports credentials (cookies, authorization headers) for authenticated requests.

3. **Allowed Headers**: The following headers are allowed in CORS requests:
   - Content-Type
   - Authorization
   - X-Requested-With

4. **Allowed Methods**: All standard HTTP methods are allowed:
   - GET, POST, PUT, DELETE, OPTIONS, PATCH

## Adding New Domains

To add new approved domains:

1. Edit `backend/cors_config.py`
2. Add the domain to the `production_domains` list
3. Include both HTTP and HTTPS versions if needed
4. Test the configuration locally
5. Deploy to production

## Testing CORS

To test if a domain is properly configured:

```javascript
// From the browser console on your domain
fetch('https://your-api-url.com/api/health', {
  method: 'GET',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => console.log('CORS test successful:', data))
.catch(error => console.error('CORS test failed:', error));
```

## Troubleshooting

If you encounter CORS errors:

1. Check that your domain is listed in `cors_config.py`
2. Ensure you're using the correct protocol (HTTP vs HTTPS)
3. Verify the environment (development vs production)
4. Check browser console for specific CORS error messages
5. Ensure the API server has restarted after configuration changes

Last Updated: 2025-08-26