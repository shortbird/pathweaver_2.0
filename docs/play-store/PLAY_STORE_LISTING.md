# Optio — Play Store Listing Draft

Copy/paste into the Play Console fields. Adjust copy to taste; everything below is a working starting point.

---

## App identity

- **App name**: `Optio`
- **Package name**: `com.optioeducation.optio` (already set in `app.json`)
- **Default language**: English (United States)
- **App or game**: App
- **Free or paid**: Free

## Short description (80 char max)

```
Capture learning moments. Earn XP. Build a portfolio that shows who you really are.
```

(Exactly 80 characters. Trim if your title bumps the byte count.)

## Full description (4000 char max)

```
Optio is a self-directed learning platform that celebrates the journey, not just the destination.

Students capture learning moments as they happen — a photo of a science experiment, a quick reflection after solving a tough problem, a video of a project in progress. Every moment they capture builds a portfolio that shows their growth across five pillars: STEM, Arts & Creativity, Communication, Civics, and Wellness.

WHAT YOU CAN DO ON OPTIO

• Capture moments in seconds — photo, video, audio, or text
• Earn XP across five learning pillars by completing quests and bounties
• Build a private learning journal you can choose to share publicly later
• See your engagement rhythm and progress over time
• Get encouragement from parents, advisors, and observers who support your work
• Browse quests created by educators and challenges posted by parents and observers
• Message your advisor and family about your work

DESIGNED FOR FAMILIES AND SCHOOLS

Parents can monitor their children's learning, capture moments on a child's behalf, and approve when their child is ready to share work publicly. Schools and learning organizations can issue student accounts, manage classes, and connect parents and observers to support student growth.

PRIVACY AND SAFETY FIRST

• Under-13 accounts require parental consent (COPPA compliant)
• Portfolio visibility is private by default — students choose what to share
• Minors require parental approval before their portfolio can be made public
• All user content can be reported; problematic posts and accounts are reviewed by our team
• Account deletion is available in-app with a 30-day grace period

THE PROCESS IS THE GOAL

We don't measure success by grades or test scores. We celebrate curiosity, effort, exploration, and growth. Whether you're working through a school's curriculum or pursuing your own interests, Optio gives you a place to capture what you're learning and a community that cares.

Learn more at optioeducation.com
```

(~1700 chars — well under the 4000 limit. You can add testimonials, school case studies, or feature highlights to fill space.)

## Category and tags

- **Category**: Education
- **Tags** (Google auto-suggests, pick 5): Learning, Portfolio, Self-paced learning, K-12, Parental controls

## Contact details

- **Email**: tanner@optioeducation.com (or a support@ alias)
- **Website**: https://www.optioeducation.com
- **Phone** (optional): leave blank unless you want it public

## Privacy policy

- **URL**: https://www.optioeducation.com/privacy

(Confirm the URL resolves and the policy mentions: data types collected, third-party SDKs, data retention, user rights including deletion, contact info for privacy questions, COPPA notice for under-13, parental consent process.)

---

## Data safety form

This is what Google Play asks. Map directly from your `app.json` privacy manifest.

### Data collection and security

| Question | Answer |
|----------|--------|
| Does your app collect or share any required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** (HTTPS via api.optioeducation.com) |
| Do you provide a way for users to request that their data be deleted? | **Yes** (in-app account deletion, 30-day grace, `POST /api/users/delete-account`) |

### Data types — declare each as Collected, Shared, Required, Optional, and provide the Purpose

For each item, the Purposes you'll choose from: **App functionality**, **Analytics**, **Developer communications**, **Advertising or marketing**, **Fraud prevention, security, and compliance**, **Personalization**, **Account management**.

**Personal info**

| Data type | Collected | Shared | Required | Purposes |
|-----------|-----------|--------|----------|----------|
| Name | Yes | No | Yes | Account management, App functionality |
| Email address | Yes | No | Yes | Account management, App functionality |
| User IDs | Yes | No | Yes | Account management, App functionality |
| Address, phone number, race, ethnicity, political views, sexual orientation, religion | No | — | — | — |
| Other info | Date of birth — Yes (Required, App functionality / COPPA age verification) |

**Photos and videos**

| Data type | Collected | Shared | Required | Purposes |
|-----------|-----------|--------|----------|----------|
| Photos | Yes | No | No (Optional) | App functionality |
| Videos | Yes | No | No (Optional) | App functionality |

**Audio files**

| Data type | Collected | Shared | Required | Purposes |
|-----------|-----------|--------|----------|----------|
| Voice or sound recordings | Yes | No | No (Optional) | App functionality |

**Files and docs**

| Data type | Collected | Shared | Required | Purposes |
|-----------|-----------|--------|----------|----------|
| Files and docs | Yes | No | No (Optional) | App functionality |

**App activity**

| Data type | Collected | Shared | Required | Purposes |
|-----------|-----------|--------|----------|----------|
| App interactions | Yes | No | Yes | App functionality, Analytics |
| In-app search history | No | — | — | — |
| Installed apps | No | — | — | — |
| Other user-generated content | Yes (learning moments, reflections, comments) | No | No (Optional) | App functionality |
| Other actions | No | — | — | — |

**App info and performance**

| Data type | Collected | Shared | Required | Purposes |
|-----------|-----------|--------|----------|----------|
| Crash logs | Yes (Sentry) | No | Yes | Fraud prevention, security, and compliance |
| Diagnostics | Yes (PostHog if you keep it) | No | Yes | Analytics |
| Other app performance data | No | — | — | — |

**Device or other IDs**

| Data type | Collected | Shared | Required | Purposes |
|-----------|-----------|--------|----------|----------|
| Device or other IDs | Yes (Expo push token) | No | Yes | App functionality |

### Anything NOT collected

Location, financial info, health and fitness, messages (encrypted between users? declare Yes if so; messages are stored in your DB so Yes), web browsing history, advertising IDs.

**Special note on Messages**: Optio has in-app messaging. Declare "Messages" → Collected: Yes, Shared: No, Required: No, Purpose: App functionality. Make sure you're transparent about who can read them (your team can if reported).

---

## Content rating questionnaire

Most answers will be "No" for an education app. Likely outcomes:

- **ESRB**: Everyone
- **PEGI**: 3
- **IARC**: Everyone

Key answers:

- Violence: No
- Sexuality: No
- Profanity: No
- Drugs/alcohol/tobacco: No
- Gambling: No
- User interaction: **Yes** (users can interact via comments, messages)
- User-generated content: **Yes** (moments, journal entries)
- Personal info sharing: **Yes** (limited — name visible to linked family/observers)
- Location sharing: No
- Digital purchases: No

The "user interaction" + "UGC" answers will trigger a higher minimum rating in some jurisdictions but won't block listing.

---

## Target audience and content

This is the section that triggers Families Policy compliance. Because Optio has under-13 users:

- **Target age groups**: Select multiple — check **Ages 6-8**, **Ages 9-12**, **Ages 13-15**, **Ages 16-17**, **Ages 18+**
- **Are children the target audience?**: **Yes, children are among the target audience**
- This puts your app in Google Play's Families program

Families program implications you'll have to attest to:

- All ads (if any) must be Families-self-certified ad networks — you have **no ads**, so this is easy
- All SDKs used must be on Google's families-approved SDK list. Audit your dependencies:
  - **Sentry**: families-approved ✓
  - **PostHog**: check their families compliance docs; if not approved, you may need to disable for under-13 users or remove
  - **Expo Push (FCM)**: families-approved ✓
  - **Supabase**: backend service, not a tracking SDK — fine
- COPPA parental consent: your existing flow (parent creates under-13 accounts or approves school creation) satisfies this. Document it clearly in the privacy policy.

---

## Ads disclosure

- **Does your app contain ads?**: **No**

(If you ever add ads, this triggers a separate Families-compliant ad SDK requirement.)

---

## App access (test credentials for Google reviewer)

Google's reviewer needs a working account to test your app. Create a dedicated review account:

- Email: `playreview@optioeducation.com` (or similar)
- Password: a known test password (note it but don't store anywhere users could see)
- Role: regular student account with some sample content so the reviewer sees the journal, capture, feed, etc.

In Play Console → App access → "All or some functionality is restricted" → Add instructions:

```
Login with the credentials below. The app supports student, parent, and observer roles; the reviewer account is a student with sample data.

Username: playreview@optioeducation.com
Password: [your test password]

Notable flows to test:
1. Capture a learning moment from the center tab (camera or photo)
2. Browse quests from the Quests tab
3. View profile and XP across pillars
4. Report a feed post via the overflow menu on any feed card
5. Request account deletion from Profile (cancellable for 30 days)
```

---

## Store listing assets — what you still need to produce

These are the things the Play Console listing won't accept text for. You'll need to actually produce/upload:

### App icon (REQUIRED)
- **Size**: 512 × 512 PNG, 32-bit, < 1024 KB
- **Source**: you have `frontend-v2/assets/images/icon.png` (already 1024x1024). Resize/export at 512x512. Tools: Photoshop, Figma, GIMP, or `npx sharp-cli resize 512 512 icon.png icon-512.png`.

### Feature graphic (REQUIRED)
- **Size**: 1024 × 500 PNG or JPG, < 1 MB
- **Content**: brand banner displayed on the Play Store listing. Should NOT have important text near edges. Suggested content: the Optio logo on a gradient (#6D469B → #EF597B) with the tagline "The process is the goal." or similar.
- **Tool**: design in Figma (free) or Canva. Export as PNG.

### Phone screenshots (REQUIRED, min 2, max 8)
- **Size**: 1080 × 1920 (portrait, 16:9) preferred
- **What to capture**: capture from your actual production build on an Android device or emulator
  1. Dashboard / Home (or Family if you want parent perspective)
  2. Journal showing learning moments
  3. Quest discovery (the gradient hero is great)
  4. Capture sheet open (mid-capture, showing the action options)
  5. Profile showing pillar XP breakdown
  6. Feed
- **Tip**: use a device with no clutter in the status bar (full battery, full signal, time set to a clean number).

### Tablet screenshots (OPTIONAL but recommended)
- 7-inch tablet: 1024 × 600 minimum, 8 screenshots max
- 10-inch tablet: 1280 × 800 minimum, 8 screenshots max

### Promo video (OPTIONAL)
- YouTube URL only — Google embeds it in the listing
- Skip for v1

---

## After upload — Internal Testing setup

1. Play Console → your app → **Testing → Internal testing**
2. Click **Create new release**
3. Upload the `.aab` from EAS (`eas build` output, or use `eas submit` later)
4. Add release notes (e.g., "Initial production release")
5. Save → Review release → Start rollout to Internal testing
6. Go to **Testers** tab, add your email + a few others, copy the opt-in URL
7. Open the opt-in URL on your Android device, opt in, then install from Play Store. Takes 5-10 min for the build to propagate after rollout.

Internal testing has **no review wait** — you can iterate fast. Once stable, promote to Closed Testing for a quick Google review pass, then Open Testing or Production.
