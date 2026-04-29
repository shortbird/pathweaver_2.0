# LMS Integration Guide

## Overview

Optio supports integration with Learning Management Systems (LMS) through several patterns:
- **LTI 1.3 Advantage** (Learning Tools Interoperability) — Canvas (Phase 1: launch + Deep Linking + AGS shipped, pending real-world Canvas test). Moodle / Brightspace inherit the same code path but have not been verified against those platforms.
- **JWT-SSO + HMAC webhooks** — Spark LMS only. Hand-rolled, predates LTI implementation. Not LTI-compatible.
- **OneRoster CSV import** — Manual roster ingest via the admin dashboard. Used for Google Classroom and any platform without an OIDC integration.

## Supported Platforms

| Platform | Auth Method | Grade Passback | Deep Linking | Roster Sync | Status |
|----------|-------------|----------------|--------------|-------------|--------|
| Canvas LMS | LTI 1.3 | ✅ AGS Score + submission | ✅ Always-blank quest | ❌ NRPS deferred | **Code complete, needs Canvas test instance to verify end-to-end** |
| Spark LMS | JWT-SSO + HMAC | ✅ via webhook | ❌ | ✅ via webhook | Shipped, in production |
| Google Classroom | OneRoster CSV | ❌ | ❌ | ✅ Manual | Roster only |
| Moodle | LTI 1.3 (untested) | ✅ AGS code path shared with Canvas | ✅ shared | ❌ | **Code likely works, not verified** |
| Schoology | None | ❌ | ❌ | ❌ | Not implemented |

---

## Canvas LMS Integration (LTI 1.3 Advantage)

### Architecture

- **Tool key pair**: RSA 2048, loaded from `CANVAS_LTI_PRIVATE_KEY_PEM` env var. Public JWK published at `/.well-known/jwks.json` and `/lti/jwks`.
- **Tool config**: served at `/lti/config.json` — Canvas admins paste this URL into a Developer Key (LTI Key → Method: Enter URL) to import the full configuration.
- **OIDC auth endpoint**: pointed at `sso.canvaslms.com` per the 2024 Canvas migration.
- **Iframe session**: post-launch we issue a one-time auth code (`lti_auth_codes` table) and the frontend exchanges it via `POST /lti/token` for Bearer access/refresh tokens stored in `tokenStore` (memory-only on web). No third-party cookies required.
- **Quests**: Deep Linking always creates a blank "personalize-your-own" quest (`quest_type='lti_canvas'`). Each student runs the AI personalization wizard inside the iframe to invent their own task list.
- **Grade passback**: Quest completion enqueues an `lms_grade_sync` row. The grade-sync service POSTs an AGS Score with the Canvas-namespaced submission claim — Canvas SpeedGrader shows the linked Optio evidence URL alongside the score.

### Prerequisites

- Canvas administrator access
- Optio superadmin
- An Optio organization for the school (provisioned manually in Optio admin)

### Step 1: Generate the tool key pair

```bash
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

Set on the Optio backend env (Render dashboard for prod):

```bash
CANVAS_LTI_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
CANVAS_LTI_PUBLIC_KID="optio-canvas-2026"   # any stable string; Canvas caches by kid
```

### Step 2: Register Optio in Canvas

1. **Canvas Admin** → **Developer Keys** → **+ Developer Key** → **+ LTI Key**.
2. Method: **Enter URL**, paste `https://api.optioeducation.com/lti/config.json`.
3. Save. Canvas records: `client_id`, `deployment_id` (visible after install).

### Step 3: Register the institution in Optio

In Optio admin (superadmin only): **LTI Registrations** → **+ New**, fill in:

- `issuer` (Canvas's issuer URL — `https://canvas.instructure.com` or institution-specific)
- `client_id` (from Canvas Developer Key)
- `deployment_id` (from Canvas tool install)
- `organization_id` (which Optio org this Canvas install belongs to)
- `auth_login_url` — typically `https://sso.canvaslms.com/api/lti/authorize_redirect`
- `auth_token_url` — typically `https://sso.canvaslms.com/login/oauth2/token`
- `public_jwks_url` — typically `https://sso.canvaslms.com/api/lti/security/jwks`

Or via API:
```bash
POST /api/admin/lti-registrations
```

### Step 4: Deploy to courses

1. In a Canvas course: **Settings** → **Apps** → **+ App** → **By Client ID** → paste the Developer Key client_id.
2. Optio appears in course nav. Teachers can also add Optio assignments via **Modules → + → External Tool → Optio**.

### Testing checklist

- [ ] `/lti/config.json` returns 200 with the right scopes + placements
- [ ] `/.well-known/jwks.json` returns a non-empty `keys` array
- [ ] Click Optio in Canvas course nav → iframe loads stripped Optio layout, student signed in
- [ ] Add Optio assignment via **+ External Tool** → title/description form renders → assignment created in Canvas with `submission_type=external_tool`
- [ ] Student opens the assignment, runs personalization, completes tasks → AGS score with submission URL shows in Canvas SpeedGrader within 5 minutes
- [ ] Replay a captured launch JWT → 401 nonce-already-used

---

## Google Classroom Integration

### Prerequisites

- Google Cloud Console access
- Google Classroom API enabled

### Step 1: Create OAuth 2.0 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Navigate to **APIs & Services** → **Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
5. Select **Web application**
6. Configure:
   - **Name:** `Optio Education`
   - **Authorized redirect URIs:** `https://www.optioeducation.com/oauth/google/callback`

### Step 2: Enable Required APIs

Enable these APIs in your Google Cloud project:
- Google Classroom API
- Google People API

### Step 3: Configure Environment Variables

```bash
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

### Step 4: Roster Sync

Google Classroom requires manual roster sync via CSV export:

1. Export roster from Google Classroom
2. Go to **Optio Admin** → **LMS Integration**
3. Upload CSV file
4. Review sync results

---

## Moodle Integration

### Prerequisites

- Moodle administrator access
- Moodle 3.10+ (for LTI 1.3 support)

### Step 1: Register External Tool

1. Navigate to **Site Administration** → **Plugins** → **External Tool** → **Manage Tools**
2. Click **Configure a tool manually**
3. Configure:
   - **Tool Name:** `Optio Education`
   - **Tool URL:** `https://www.optioeducation.com/lti/launch`
   - **LTI version:** `LTI 1.3`
   - **Public key type:** `Keyset URL`
   - **Public keyset:** `https://www.optioeducation.com/.well-known/jwks.json`
   - **Initiate login URL:** `https://www.optioeducation.com/lti/login`
   - **Redirection URI(s):** `https://www.optioeducation.com/lti/launch`

### Step 2: Configure Services

Enable:
- IMS LTI Assignment and Grade Services
- IMS LTI Names and Role Provisioning Services

### Step 3: Configure Environment Variables

```bash
MOODLE_URL=https://your-moodle-instance.com
MOODLE_CLIENT_ID=your_client_id
```

---

## Roster Synchronization

Optio supports **OneRoster CSV** format for bulk user imports.

### CSV Format

Required columns:
- `sourcedId`: Unique identifier
- `email`: Student email
- `givenName`: First name
- `familyName`: Last name
- `role`: student, teacher, administrator

### Sync Process

1. Export roster from your LMS in OneRoster format
2. Navigate to **Optio Admin** → **LMS Integration**
3. Select your LMS platform
4. Upload CSV file
5. Review sync results:
   - Users created
   - Users updated
   - Errors (if any)

---

## Grade Passback

When grade passback is enabled, Optio automatically sends quest completion grades to the LMS gradebook.

### Configuration

- **Completed quest** → 100%
- **In-progress quest** → No grade sent
- **Abandoned quest** → No grade sent

### Sync Timing

Grades sync within **5 minutes** of quest completion.

### Monitoring

Check grade sync status in **Admin Dashboard** → **LMS Integration** → **Grade Sync Status**

---

## Assignment Import

Convert LMS assignments to Optio quests for seamless integration.

### Process

1. Navigate to **Admin Dashboard** → **LMS Integration**
2. Click **Import Assignments**
3. Select course/class
4. Select assignments to import
5. Review and confirm

### Quest Mapping

LMS assignments are imported as Optio quests with:
- `source`: `lms`
- `lms_course_id`: Course identifier
- `lms_assignment_id`: Assignment identifier
- `lms_platform`: Platform name

---

## Troubleshooting

### Issue: "Invalid LTI Launch"

**Possible Causes:**
- Client ID mismatch between LMS and Optio
- Expired or invalid JWT token
- Incorrect platform URL

**Solution:**
1. Verify `CANVAS_CLIENT_ID` matches Developer Key ID
2. Check that platform URL is correct
3. Regenerate Developer Key if needed

### Issue: "Grade Not Syncing"

**Possible Causes:**
- Assignment not linked to LMS assignment ID
- Grade passback not enabled in LMS
- Network/API errors

**Solution:**
1. Verify quest has `lms_assignment_id` set
2. Check LTI configuration includes AGS scope
3. Review grade sync queue in admin dashboard

### Issue: "User Not Created on LTI Launch"

**Possible Causes:**
- Missing email in LTI claims
- Database permissions error
- Duplicate email conflict

**Solution:**
1. Verify LMS sends email claim
2. Check Supabase logs for errors
3. Manually create user if needed

### Issue: "Roster Sync Fails"

**Possible Causes:**
- Invalid CSV format
- Missing required columns
- Encoding issues

**Solution:**
1. Verify CSV follows OneRoster format
2. Ensure UTF-8 encoding
3. Check for special characters in names/emails

---

## Security Best Practices

### LTI 1.3 Security

- Never expose your JWKS private key
- Validate all incoming JWT tokens
- Implement nonce replay protection
- Use HTTPS for all endpoints

### OAuth 2.0 Security

- Store client secrets securely in environment variables
- Use state parameter for CSRF protection
- Implement token refresh logic
- Revoke tokens when integration is disabled

### Data Privacy

- Only sync necessary user data
- Comply with FERPA, COPPA, GDPR regulations
- Allow students to disconnect LMS integration
- Provide data export/deletion options

---

## API Reference

### LTI Launch Endpoint

```
POST /lti/launch
```

Handles LTI 1.3 launch requests from LMS.

**Parameters:**
- `id_token` (required): JWT token from LMS
- `state` (required): State parameter for security

**Response:**
- Redirects to Optio dashboard with session cookie

### Roster Sync Endpoint

```
POST /api/lms/sync/roster
```

Sync student roster from OneRoster CSV.

**Headers:**
- `Authorization: Bearer <admin_token>`

**Body:**
- `roster_csv`: CSV file (multipart/form-data)
- `lms_platform`: Platform identifier

**Response:**
```json
{
  "users_created": 25,
  "users_updated": 10,
  "errors": []
}
```

### Assignment Sync Endpoint

```
POST /api/lms/sync/assignments
```

Import LMS assignments as Optio quests.

**Headers:**
- `Authorization: Bearer <admin_token>`

**Body:**
```json
{
  "lms_platform": "canvas",
  "assignments": [
    {
      "id": "123",
      "name": "Python Basics",
      "description": "Learn Python fundamentals",
      "course_id": "456"
    }
  ]
}
```

**Response:**
```json
{
  "synced": 1,
  "errors": []
}
```

---

## Support

For LMS integration support:

- **Email:** support@optioeducation.com
- **Documentation:** https://docs.optioeducation.com
- **Status Page:** https://status.optioeducation.com

### Common Support Requests

1. **Setting up new LMS integration** - Allow 1-2 business days
2. **Troubleshooting grade sync issues** - Usually resolved within 24 hours
3. **Custom LMS platform support** - Contact for enterprise pricing

---

## Changelog

### April 2026 — Canvas LTI 1.3 implementation landed

- ✅ Tool key pair + JWKS publishing
- ✅ Tool config JSON for Developer Key import
- ✅ OIDC login init + JWS launch verification (PyJWT 2.x's PyJWKClient against `sso.canvaslms.com`)
- ✅ Replay protection via `lti_nonces`
- ✅ User provisioning with email-merge (mirrors Spark pattern)
- ✅ Deep Linking 2.0 — always-blank "personalize-your-own" quest creation
- ✅ AGS Score posting with the Canvas-namespaced submission claim
- ✅ Auth-code → Bearer token exchange for the iframe (no third-party cookies)
- ⏳ End-to-end verification against Canvas's hosted test instance — pending superadmin setup of a Developer Key
- ⏳ NRPS roster sync (deferred from v1)
- ⏳ Real Platform Storage usage for OIDC state (current implementation signs state as a self-contained JWT — equivalent security posture, no `lti_storage_target` round-trip)

### Earlier (claimed but not actually implemented prior to April 2026)

The pre-April 2026 version of this doc described Canvas / Moodle / Schoology / Google Classroom LTI integrations as shipped. Those claims were aspirational — only the Spark JWT-SSO and OneRoster CSV import were real. The Canvas LTI implementation now backs the Canvas claims; the others remain unimplemented.
