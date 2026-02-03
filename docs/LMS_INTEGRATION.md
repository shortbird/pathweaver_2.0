# LMS Integration Guide

## Overview

Optio supports integration with Learning Management Systems (LMS) through industry-standard protocols:
- **LTI 1.3** (Learning Tools Interoperability) for Canvas, Moodle
- **OAuth 2.0** API integration for Google Classroom, Schoology

## Supported Platforms

| Platform | Auth Method | Grade Passback | Deep Linking | Roster Sync |
|----------|-------------|----------------|--------------|-------------|
| Canvas LMS | LTI 1.3 | ✅ | ✅ | ✅ |
| Google Classroom | OAuth 2.0 | ❌ | ❌ | ✅ |
| Schoology | OAuth 2.0 | ✅ | ❌ | ✅ |
| Moodle | LTI 1.3 | ✅ | ✅ | ✅ |

---

## Canvas LMS Integration

### Prerequisites

- Canvas administrator access
- Optio admin account

### Step 1: Register Optio as External App

1. Navigate to **Canvas Admin** → **Developer Keys**
2. Click **+ Developer Key** → **+ LTI Key**
3. Configure with these settings:

#### Basic Configuration
- **Key Name:** `Optio Education`
- **Owner Email:** Your admin email
- **Redirect URIs:** `https://www.optioeducation.com/lti/launch`
- **Method:** Manual Entry

#### LTI Configuration
- **Title:** `Optio Education`
- **Description:** `Self-validated learning platform`
- **Target Link URI:** `https://www.optioeducation.com/lti/launch`
- **OpenID Connect Initiation Url:** `https://www.optioeducation.com/lti/login`
- **JWK Method:** Public JWK URL
- **JWK URL:** `https://www.optioeducation.com/.well-known/jwks.json`

#### LTI Advantage Services
Enable these scopes:
- ✅ Can retrieve user data associated with the context the tool is installed in
- ✅ Can create and view assignment data in the gradebook associated with the tool
- ✅ Can view submission data for assignments associated with the tool
- ✅ Can view course content

### Step 2: Configure Environment Variables

Add to your Render environment (Backend service):

```bash
CANVAS_CLIENT_ID=your_developer_key_id
CANVAS_PLATFORM_URL=https://your-institution.instructure.com
```

### Step 3: Deploy to Courses

1. In each Canvas course, go to **Settings** → **Apps**
2. Click **+ App**
3. Select **By Client ID**
4. Enter your Developer Key ID
5. Click **Submit**
6. Configure placement as **Course Navigation**

### Testing

1. Click the Optio app link in your Canvas course navigation
2. You should be automatically signed in to Optio
3. Your Canvas user info should be synced to Optio

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

### Version 1.0 (January 2025)

- ✅ Canvas LMS integration (LTI 1.3)
- ✅ Google Classroom integration (OAuth 2.0)
- ✅ Schoology integration (OAuth 2.0)
- ✅ Moodle integration (LTI 1.3)
- ✅ OneRoster CSV roster sync
- ✅ Grade passback via LTI AGS
- ✅ Assignment import

### Planned Features

- 🔄 Brightspace D2L integration (Q2 2025)
- 🔄 Blackboard Learn integration (Q2 2025)
- 🔄 Real-time grade sync (Q3 2025)
- 🔄 Two-way assignment sync (Q3 2025)
