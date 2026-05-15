# Optio Canvas LTI 1.3 — Williamsburg Learning Setup

**Purpose**: instructions for Williamsburg Learning's Canvas administrator to install Optio as an LTI 1.3 tool in their Canvas Cloud instance, plus the post-receipt registration steps Optio runs on its side.

**Status**: development-phase rollout for Tanner Bowman's tech courses (2026–27 school year). No student usage during this phase.

**Canvas instance**: `https://williamsburglearning.instructure.com/` (Canvas Cloud)

---

## Part 1 — Admin instructions (send to Williamsburg Canvas admin)

### What this enables

Optio installs into Canvas as an LTI 1.3 Advantage tool. Once configured, Tanner Bowman will be able to:

- Create Optio personalized learning quests from inside his Canvas courses, using Canvas's standard "+ External Tool" flow.
- Have quest completion grades sync back to Canvas Gradebook automatically; SpeedGrader shows each student's Optio evidence link next to their score.

This is a development-phase setup — the integration will be used in Tanner's tech courses he's currently developing for next school year.

### Prerequisites

- Canvas account administrator access at Williamsburg Learning (root-account-level Developer Key permissions).
- 5–10 minutes.

This guide assumes **Canvas Cloud** (Instructure-hosted), confirmed by your `williamsburglearning.instructure.com` domain.

You do **not** need to host anything, generate keys, or paste any JSON manually — Optio publishes a tool configuration URL and Canvas pulls everything from it.

### Step 1 — Create the Optio LTI Developer Key

1. As an admin, navigate to **Admin → Developer Keys**.
2. Click **+ Developer Key** → **+ LTI Key**.
3. In the **Key Settings** panel (older Canvas versions label this "Configure"):
   - **Key Name:** `Optio`
   - **Owner Email:** your admin email
   - **Method:** select **Enter URL**
   - **JSON URL:** `https://api.optioeducation.com/lti/config.json`
   - Leave other fields blank — they auto-populate from our config.
4. Click **Save**.
5. Back on the Developer Keys list, find the "Optio" key and toggle its **State** from `OFF` to `ON`.
6. Copy the value under the **Details** column — this is the **Client ID** (a 15–18 digit number). Save it for Step 3.

### Step 2 — Install Optio at the account level

We recommend installing once at the root account level. This generates a single Deployment ID (simpler bookkeeping) and lets Tanner control visibility in his specific tech courses without needing further admin involvement.

1. Navigate to **Admin → Settings → Apps** tab.
2. Click **View App Configurations** → **+ App**.
3. **Configuration Type:** select **By Client ID**.
4. Paste the **Client ID** from Step 1.
5. Click **Submit** → **Install**.

> By default, Optio will appear in the course navigation of every Williamsburg course. Tanner will hide it in non-relevant courses (and Tanner will be the only one actively using it during this dev phase, so other teachers can ignore the unused nav item if they notice it). If you'd prefer it hidden by default until courses opt-in, edit the installed Optio app and set the Course Navigation placement default to "disabled" — Tanner will then enable it in his specific tech courses (listed in the email accompanying this guide) via Course Settings → Navigation.

### Step 3 — Find the Deployment ID and send us your two values

1. On the **View App Configurations** page, find the installed Optio app.
2. Click the **gear icon** next to it → **Deployment Id**.
3. Copy the value shown (looks like `1:abc123def456`).

Reply to this email with these two values:

| Field | Where it comes from | Example |
|---|---|---|
| **Client ID** | Step 1.6 (Details column) | `170000000000123` |
| **Deployment ID** | Step 3 above | `1:abc123def456` |

We already have your Canvas issuer (`https://canvas.instructure.com` — the unified Canvas Cloud issuer used by all Instructure-hosted Canvas instances) and your Williamsburg Learning organization in Optio, so just the two values above are needed.

We'll register them on Optio's side (a few minutes), then email back to confirm. Tanner will verify end-to-end from his Williamsburg Canvas account once registration is complete.

### What Optio requests

| Capability | Used? | Notes |
|---|---|---|
| LTI 1.3 launch (name, email, role of the launching user) | Yes — required | Privacy level: `public` |
| Deep Linking 2.0 (create assignments from inside Canvas) | Yes — required | How quests are added to courses |
| Assignment & Grade Services (AGS) — read line items, post scores | Yes — required | For grade passback to Canvas Gradebook |
| Names & Role Provisioning (NRPS) — bulk roster sync | No | Not used |
| Third-party cookies | No | Optio uses memory-only Bearer tokens; works in Safari and strict-tracking browsers |

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Tanner sees "Tool not registered for this platform" on launch | Step 3 (registering with Optio) not completed yet | Optio needs your Client ID + Deployment ID; once registered, this resolves |
| Optio missing from course nav | Developer Key is `OFF`, or install wasn't at account level | Check Developer Key State = `ON`; confirm install was at root account |
| Tanner needs to hide/show Optio in a specific course | Course-level control | Tanner does this himself in each course's **Settings → Navigation** |

### Support

- **Email:** support@optioeducation.com
- Please include your Canvas root URL (`https://williamsburglearning.instructure.com/`) and a screenshot if there's an error.

---

## Part 2 — Optio internal: post-receipt registration

When Williamsburg replies with their Client ID + Deployment ID, run this from the prod DevTools console (`https://www.optioeducation.com`, logged in as superadmin):

```javascript
const csrfResp = await fetch('https://api.optioeducation.com/api/auth/csrf-token', {
  credentials: 'include'
});
const { csrf_token } = await csrfResp.json();

const r = await fetch('https://api.optioeducation.com/api/admin/lti-registrations', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrf_token
  },
  body: JSON.stringify({
    issuer: 'https://canvas.instructure.com',
    client_id: '<from their email>',
    deployment_id: '<from their email>',
    organization_id: 'a2d48965-1354-4e75-b423-61b6da200769',  // Williamsburg Learning
    auth_login_url: 'https://sso.canvaslms.com/api/lti/authorize_redirect',
    auth_token_url: 'https://sso.canvaslms.com/login/oauth2/token',
    public_jwks_url: 'https://sso.canvaslms.com/api/lti/security/jwks',
    notes: 'Williamsburg Learning — production Canvas Cloud, registered <date>'
  })
});
console.log('HTTP', r.status, await r.json());
```

Expected response: `HTTP 201` with the new registration row.

### Verification (Tanner, from a Williamsburg Canvas teacher account)

After registration:

1. Open a Williamsburg Canvas course where Optio is enabled in the nav.
2. Click **Optio** in the left nav — confirm it loads inside the Canvas frame with your Optio account.
3. Create a test quest via **Modules → + → External Tool → Optio**, fill in title/XP threshold, submit.
4. Open the resulting assignment as a student (test student account or masquerade), run the personalization wizard, complete enough tasks to hit the XP threshold, click **Submit for grading**.
5. Within ~5 minutes, confirm the score appears in Canvas Gradebook and the Optio evidence link shows in SpeedGrader.

### Verified endpoint values (May 2026)

These are the Canvas Cloud LTI 1.3 endpoints used in the registration above. Source: [Instructure Product Blog — Minor LTI 1.3 Changes (sso.canvaslms.com migration)](https://community.instructure.com/t5/The-Product-Blog/Minor-LTI-1-3-Changes-New-OIDC-Auth-Endpoint-Support-for/ba-p/551677). The legacy `canvas.instructure.com` host still works but `sso.canvaslms.com` is the migrated endpoint.

| Field | Value |
|---|---|
| `issuer` (Canvas Cloud unified issuer) | `https://canvas.instructure.com` |
| `auth_login_url` | `https://sso.canvaslms.com/api/lti/authorize_redirect` |
| `auth_token_url` | `https://sso.canvaslms.com/login/oauth2/token` |
| `public_jwks_url` | `https://sso.canvaslms.com/api/lti/security/jwks` |

For Canvas Beta: substitute `sso.beta.canvaslms.com`. For Canvas Test: `sso.test.canvaslms.com`. Williamsburg is on production (`williamsburglearning.instructure.com`), so the URLs above apply.
