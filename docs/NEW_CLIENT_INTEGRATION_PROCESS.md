# New Client Integration Process

**Version:** 1.0
**Last Updated:** January 2025
**Purpose:** Step-by-step guide for onboarding new client organizations with custom subdomains

---

## Overview

The Optio platform supports multi-tenant organizations with domain-based routing. Each client organization gets:
- Their own subdomain (e.g., `ignite.optioeducation.com`)
- Access to all public Optio quests
- Ability to create organization-specific private quests
- Isolated user management and analytics

**Architecture:** Organization-based multi-tenancy with:
- Domain detection middleware
- Organization-aware quest filtering
- RLS policies for data isolation
- Shared Optio public quest library

---

## Prerequisites

Before starting the integration process, ensure you have:

- [ ] Admin access to Supabase database
- [ ] Admin access to Render deployment dashboard
- [ ] DNS management access (Cloudflare or domain registrar)
- [ ] Client organization details:
  - Organization name
  - Desired subdomain (lowercase, alphanumeric + hyphens only)
  - Primary contact email
  - Initial admin users (optional)

---

## Step 1: Create Organization Record

### 1.1 Connect to Supabase

Use the Supabase dashboard or MCP tool to run SQL queries.

```bash
# Via MCP
mcp__supabase__execute_sql --project_id vvfgxcykxjybtvpfzwyx
```

### 1.2 Insert Organization

```sql
-- Replace values with client-specific details
INSERT INTO organizations (
    name,
    slug,
    domain,
    subdomain,
    full_domain,
    settings,
    is_active
) VALUES (
    'Client Organization Name',        -- Full name
    'client-slug',                      -- URL-safe identifier (lowercase, alphanumeric + hyphens)
    'optioeducation.com',              -- Parent domain
    'clientname',                       -- Subdomain (e.g., 'ignite' for ignite.optioeducation.com)
    'clientname.optioeducation.com',   -- Full domain
    '{"parent_org_id": "00000000-0000-0000-0000-000000000001", "inherit_parent_quests": true}'::jsonb,
    true                                -- Active status
);
```

**Example:**
```sql
INSERT INTO organizations (name, slug, domain, subdomain, full_domain, settings, is_active)
VALUES (
    'Ignite',
    'ignite',
    'optioeducation.com',
    'ignite',
    'ignite.optioeducation.com',
    '{"parent_org_id": "00000000-0000-0000-0000-000000000001", "inherit_parent_quests": true}'::jsonb,
    true
);
```

### 1.3 Verify Organization Created

```sql
SELECT id, name, slug, full_domain, is_active
FROM organizations
WHERE slug = 'clientname';
```

Copy the organization `id` for later steps.

---

## Step 2: Configure DNS and Custom Domain

### 2.1 Add CNAME Record

In your DNS provider (Cloudflare, Route53, etc.):

1. Navigate to DNS settings for `optioeducation.com`
2. Add new CNAME record:
   - **Name:** `clientname` (subdomain only)
   - **Target:** `optio-dev-frontend.onrender.com` (for dev) or `optio-prod-frontend.onrender.com` (for prod)
   - **TTL:** Auto or 300 seconds
   - **Proxy status:** Enabled (if using Cloudflare)

**Example:**
```
Type: CNAME
Name: ignite
Target: optio-prod-frontend.onrender.com
```

### 2.2 Add Custom Domain in Render

1. Go to Render Dashboard → Select frontend service
2. Navigate to "Settings" → "Custom Domains"
3. Click "Add Custom Domain"
4. Enter: `clientname.optioeducation.com`
5. Wait for DNS verification (usually 5-15 minutes)
6. Render will automatically provision SSL certificate

### 2.3 Verify SSL Certificate

Wait for Render to show "Certificate Active" status. This may take 15-30 minutes.

Test the subdomain:
```bash
curl -I https://clientname.optioeducation.com
# Should return 200 OK with valid SSL
```

---

## Step 3: Update Environment Variables

### 3.1 Update ALLOWED_ORIGINS (Backend)

1. Go to Render Dashboard → Backend service → Environment
2. Update `ALLOWED_ORIGINS` to include new subdomain:

```bash
# Development
ALLOWED_ORIGINS=https://www.optioeducation.com,https://optio-dev-frontend.onrender.com,https://clientname.optioeducation.com,http://localhost:5173

# Production
ALLOWED_ORIGINS=https://www.optioeducation.com,https://optioeducation.com,https://clientname.optioeducation.com
```

3. Click "Save Changes"
4. Service will automatically redeploy (takes ~5 minutes)

### 3.2 Verify CORS Configuration

```bash
curl -H "Origin: https://clientname.optioeducation.com" \
     -H "Access-Control-Request-Method: POST" \
     -X OPTIONS \
     https://optio-prod-backend.onrender.com/api/quests

# Should return Access-Control-Allow-Origin header
```

---

## Step 4: Create Initial Admin Users (Optional)

### 4.1 Register Admin User

If the client needs an admin user:

```sql
-- First, have the user register via the UI or API
-- Then update their role and assign to organization

UPDATE users
SET
    role = 'admin',
    organization_id = '<org_id_from_step_1>'
WHERE email = 'admin@clientdomain.com';
```

### 4.2 Verify User Assignment

```sql
SELECT u.id, u.email, u.role, o.name as organization
FROM users u
JOIN organizations o ON u.organization_id = o.id
WHERE u.email = 'admin@clientdomain.com';
```

---

## Step 5: Create Organization-Specific Quests (Optional)

If the client needs private quests visible only to their organization:

### 5.1 Create Quest via API

```bash
curl -X POST https://optio-prod-backend.onrender.com/api/quests/create \
  -H "Authorization: Bearer <admin_jwt_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Client-Specific Quest",
    "description": "This quest is only visible to our organization",
    "is_public": false,
    "organization_id": "<org_id_from_step_1>"
  }'
```

### 5.2 Assign Quest to Organization

```sql
-- If quest was created without organization_id
UPDATE quests
SET organization_id = '<org_id_from_step_1>'
WHERE id = '<quest_id>';
```

---

## Step 6: Testing and Verification

### 6.1 Test Organization Detection

```bash
# Test that middleware detects organization from domain
curl -H "Host: clientname.optioeducation.com" \
     https://optio-prod-backend.onrender.com/api/quests

# Should return quests filtered for this organization
```

### 6.2 Test Quest Visibility

1. **Anonymous user on client subdomain:**
   - Should see: Public Optio quests only
   - Should NOT see: Client-private quests

2. **Client user on client subdomain:**
   - Should see: Public Optio quests + Client-private quests + Client org quests
   - Should NOT see: Other clients' private quests

3. **Client user on main domain:**
   - Should see: Public Optio quests + their own private quests
   - Should see: Client org quests (because user belongs to that org)

### 6.3 Test Data Isolation

```sql
-- Verify RLS policies work correctly
-- Run as client user (using their JWT token)
SELECT id, title, organization_id, is_public
FROM quests
WHERE is_active = true;

-- Should only return:
-- 1. Public quests
-- 2. Quests from user's organization
-- 3. Optio organization quests (00000000-0000-0000-0000-000000000001)
```

### 6.4 Check Organization Stats

```sql
-- Verify organization setup
SELECT
    o.name,
    o.subdomain,
    o.full_domain,
    COUNT(DISTINCT u.id) as user_count,
    COUNT(DISTINCT q.id) as quest_count
FROM organizations o
LEFT JOIN users u ON u.organization_id = o.id
LEFT JOIN quests q ON q.organization_id = o.id
WHERE o.slug = 'clientname'
GROUP BY o.id, o.name, o.subdomain, o.full_domain;
```

---

## Step 7: Client Handoff

### 7.1 Provide Client with Access Details

Send the client:
- **Primary URL:** `https://clientname.optioeducation.com`
- **Admin login:** `admin@clientdomain.com` (if created)
- **Support contact:** [support@optioeducation.com](mailto:support@optioeducation.com)

### 7.2 Document in Internal Wiki

Record in internal documentation:
- Client name
- Organization ID
- Subdomain
- Date created
- Primary contact
- Special requirements

---

## Troubleshooting

### Issue: DNS not resolving

**Symptoms:** `clientname.optioeducation.com` returns DNS error

**Solutions:**
1. Verify CNAME record is correct in DNS provider
2. Check DNS propagation: `nslookup clientname.optioeducation.com`
3. Wait 15-30 minutes for DNS propagation
4. Try flushing local DNS cache: `ipconfig /flushdns` (Windows) or `sudo dscacheutil -flushcache` (Mac)

### Issue: SSL certificate not active

**Symptoms:** Browser shows "Not Secure" warning

**Solutions:**
1. Wait 15-30 minutes for Render to provision certificate
2. Check Render dashboard for certificate status
3. Verify DNS is resolving correctly first
4. If stuck > 1 hour, remove and re-add custom domain in Render

### Issue: CORS errors

**Symptoms:** Browser console shows CORS policy errors

**Solutions:**
1. Verify `ALLOWED_ORIGINS` includes new subdomain
2. Check backend service redeployed after env var change
3. Test with curl command in Step 3.2
4. Clear browser cache and hard refresh (Ctrl+Shift+R)

### Issue: User sees wrong quests

**Symptoms:** Client user doesn't see their org quests or sees other org's quests

**Solutions:**
1. Verify user's `organization_id` is set correctly:
   ```sql
   SELECT email, organization_id FROM users WHERE email = 'user@email.com';
   ```
2. Verify organization detection middleware is running (check logs)
3. Check RLS policies are active:
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'quests';
   ```
4. Test with admin client to bypass RLS and verify data exists

### Issue: Organization not detected

**Symptoms:** Logs show "Could not detect organization, using Optio default"

**Solutions:**
1. Verify organization record has correct `full_domain` and `subdomain`
2. Check middleware is registered in `app.py`
3. Verify Flask `g` context is available
4. Test domain detection:
   ```python
   from middleware.organization import detect_organization_from_domain
   # Add debug logging to see what domain is being detected
   ```

---

## Maintenance and Updates

### Adding More Quests to Organization

```sql
-- Make existing quest visible to organization
UPDATE quests
SET organization_id = '<org_id>'
WHERE id = '<quest_id>';
```

### Moving Users Between Organizations

```sql
-- Transfer user to different organization
UPDATE users
SET organization_id = '<new_org_id>'
WHERE id = '<user_id>';
```

### Deactivating Organization

```sql
-- Soft delete (preserves data)
UPDATE organizations
SET is_active = false
WHERE id = '<org_id>';

-- Users will automatically see only Optio quests
-- Organization-specific quests will be hidden (not deleted)
```

### Reactivating Organization

```sql
UPDATE organizations
SET is_active = true
WHERE id = '<org_id>';
```

---

## Security Considerations

1. **Data Isolation:** RLS policies ensure users can only see quests from:
   - Their own organization
   - Public quests
   - Optio parent organization

2. **Domain Verification:** Middleware validates domain matches organization record

3. **Admin Access:** Only platform admins can:
   - Create new organizations
   - Assign users to organizations
   - View cross-organization data

4. **Audit Logging:** All organization changes should be logged for compliance

---

## Quick Reference: SQL Queries

### Check Organization Exists
```sql
SELECT * FROM organizations WHERE slug = 'clientname';
```

### List All Organizations
```sql
SELECT id, name, slug, full_domain, is_active FROM organizations ORDER BY name;
```

### Count Users per Organization
```sql
SELECT
    o.name,
    COUNT(u.id) as user_count
FROM organizations o
LEFT JOIN users u ON u.organization_id = o.id
GROUP BY o.id, o.name
ORDER BY user_count DESC;
```

### Find Users Without Organization
```sql
SELECT id, email, role FROM users WHERE organization_id IS NULL;
```

### List Quests by Organization
```sql
SELECT
    q.title,
    o.name as organization,
    q.is_public,
    q.is_active
FROM quests q
LEFT JOIN organizations o ON q.organization_id = o.id
WHERE q.is_active = true
ORDER BY o.name, q.title;
```

---

## Rollback Procedure

If something goes wrong and you need to rollback:

### 1. Deactivate Organization
```sql
UPDATE organizations SET is_active = false WHERE slug = 'clientname';
```

### 2. Remove Custom Domain from Render
1. Render Dashboard → Frontend service → Settings → Custom Domains
2. Click "Remove" next to `clientname.optioeducation.com`

### 3. Remove CNAME Record
Delete the DNS CNAME record from your DNS provider

### 4. Restore ALLOWED_ORIGINS
Remove the client subdomain from `ALLOWED_ORIGINS` environment variable

---

## Support and Questions

- **Technical Issues:** Check [GitHub Issues](https://github.com/anthropics/claude-code/issues)
- **Database Questions:** Contact platform admin
- **Client Support:** [support@optioeducation.com](mailto:support@optioeducation.com)

---

## Appendix: Example Integration Timeline

Typical integration timeline for new client:

- **Day 0:** Receive client request, gather requirements
- **Day 1:** Create organization record, configure DNS
- **Day 2:** Wait for DNS propagation and SSL certificate
- **Day 3:** Update environment variables, create admin users
- **Day 4:** Create organization-specific quests (if needed)
- **Day 5:** Testing and verification
- **Day 6:** Client handoff and training
- **Total:** ~1 week for full integration

---

## Change Log

| Date | Version | Changes |
|------|---------|---------|
| 2025-01-04 | 1.0 | Initial document created for Ignite integration |

---

**Document Owner:** Platform Engineering Team
**Last Reviewed:** January 2025
**Next Review:** Quarterly
