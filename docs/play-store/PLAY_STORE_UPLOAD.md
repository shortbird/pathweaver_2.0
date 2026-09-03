# Uploading the AAB to Play Console

Once the EAS production build completes you'll have two ways to get it into Play Console.

## Option A — Manual upload (recommended first time)

1. **Download the AAB** from EAS:
   - Open https://expo.dev/accounts/optio-ed/projects/optio/builds/871d8d65-8491-4b9a-9e8f-a0d7f2044e7d
   - Click the **Download** button (gets the `.aab` file, ~50-80 MB)
   - Or via CLI: `eas build:download --platform android --latest`

2. **Open Play Console** at https://play.google.com/console.

3. **Create the app** (one-time, only if not already created):
   - Top right: **Create app**
   - App name: `Optio`
   - Default language: English (United States)
   - App or game: App
   - Free or paid: Free
   - Acknowledge the declarations checkboxes
   - Click **Create app**

4. **Set up internal testing**:
   - Left nav → **Testing → Internal testing**
   - Click **Create new release**
   - Drag the `.aab` into the upload area (or click and pick it)
   - Release name: `1.0.0 (2)` — defaults to your version code
   - Release notes:
     ```
     Initial production release.
     • Capture learning moments — photo, video, audio, or text
     • Browse quests and bounties; earn XP across five learning pillars
     • Build a private portfolio you choose when to share
     • Parent + observer flows with FERPA-compliant approvals
     ```
   - Click **Next**, then **Save**

5. **Add yourself as a tester**:
   - **Testers** tab → Create email list → add your email + a few teammates
   - Save → check the list → **Review release** → **Start rollout to Internal testing**

6. **Install on your device**:
   - Within ~10 min the build appears for testers
   - Open the **opt-in URL** shown on the Testers tab on your Android phone
   - Tap "Become a tester" → install via Play Store

## Option B — Automated upload via `eas submit`

Slightly more setup, but afterwards every release is one command.

### One-time: create a Google service account

1. Go to https://console.cloud.google.com/iam-admin/serviceaccounts (select your Optio project, or create one)
2. **Create Service Account** → name: `eas-submit` → role: leave blank → **Done**
3. Click the new service account → **Keys** tab → **Add Key → Create new key → JSON**
4. Save the JSON file. Don't commit it. Suggested path: `frontend-v2/google-play-service-account.json` and add to `.gitignore`
5. Go to https://play.google.com/console → **Setup → API access** → link your Google Cloud project → grant the service account the **Release manager** role for the Optio app

### Wire up eas.json

Edit [frontend-v2/eas.json](frontend-v2/eas.json):

```json
"submit": {
  "production": {
    "android": {
      "track": "internal",
      "serviceAccountKeyPath": "./google-play-service-account.json",
      "releaseStatus": "draft"
    }
  }
}
```

(`releaseStatus: "draft"` means EAS uploads the AAB but doesn't auto-publish — you still click "Review release → Start rollout" in Play Console.)

### Then to submit any future build

```bash
cd frontend-v2
eas submit --platform android --latest
```

Or to submit a specific build by ID:

```bash
eas submit --platform android --id 871d8d65-8491-4b9a-9e8f-a0d7f2044e7d
```

## After the AAB is up

Play Console will guide you through filling missing app content forms. Use [PLAY_STORE_LISTING.md](PLAY_STORE_LISTING.md) as the reference for what to paste/select.

The fields to complete before you can promote to Production (Internal testing has no review and runs in parallel):

- **App access**: provide reviewer test credentials
- **Ads**: declare No
- **Content rating**: complete questionnaire (~10 min)
- **Target audience**: include ages 6-18, declare children among target audience (triggers Families Policy)
- **Data safety**: declare what's collected (see listing draft)
- **News app**: No
- **COVID-19, finance, gambling, health**: No
- **Government apps**: No
- **Store listing**: description + assets (icon, feature graphic, screenshots)
- **Privacy policy URL**: https://www.optioeducation.com/privacy

Each is its own form in the **Policy → App content** section of the Play Console. You can complete them in any order while Internal testing is rolling.
