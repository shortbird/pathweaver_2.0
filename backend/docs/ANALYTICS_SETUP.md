# Google Analytics 4 Setup Guide

## Overview

This guide covers setting up Google Analytics 4 (GA4) for the Optio platform to track user behavior, conversions, and key metrics.

**Status**: Ready for Implementation
**Estimated Time**: 2 hours
**Cost**: Free

---

## Step 1: Create Google Analytics 4 Property

### 1.1 Access Google Analytics

1. Go to https://analytics.google.com/
2. Sign in with your Google account (use Optio business account if available)
3. Click **Admin** (gear icon in bottom left)

### 1.2 Create Account (if needed)

1. Click **Create Account**
2. **Account Name**: "Optio Education"
3. Configure data sharing settings (recommended: all enabled)
4. Click **Next**

### 1.3 Create Property

1. **Property Name**: "Optio Platform"
2. **Reporting Time Zone**: Your timezone (e.g., PST)
3. **Currency**: USD
4. Click **Next**

### 1.4 Configure Business Details

1. **Industry Category**: "Education"
2. **Business Size**: Select appropriate size
3. **How you plan to use Google Analytics**: Check relevant boxes
4. Click **Create**
5. Accept Terms of Service

### 1.5 Set Up Data Stream

1. **Platform**: Select **Web**
2. **Website URL**: `https://www.optioeducation.com`
3. **Stream Name**: "Optio Production"
4. Click **Create Stream**

### 1.6 Copy Measurement ID

1. You'll see **Measurement ID**: `G-XXXXXXXXXX`
2. **SAVE THIS** - you'll need it for frontend integration
3. Keep this page open for configuration

---

## Step 2: Configure Enhanced Measurements

In the data stream settings:

1. Scroll to **Enhanced measurement**
2. Toggle **ON** (should be enabled by default)
3. Ensure these are enabled:
   - ✅ Page views
   - ✅ Scrolls
   - ✅ Outbound clicks
   - ✅ Site search
   - ✅ Form interactions
   - ✅ Video engagement
   - ✅ File downloads

---

## Step 3: Frontend Integration

### 3.1 Install Dependencies

```bash
cd frontend
npm install react-ga4
```

### 3.2 Create Analytics Service

Create `frontend/src/services/analytics.js`:

```javascript
import ReactGA from 'react-ga4';

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

// Initialize GA4
export const initGA = () => {
  if (MEASUREMENT_ID && import.meta.env.PROD) {
    ReactGA.initialize(MEASUREMENT_ID, {
      gaOptions: {
        anonymize_ip: true, // GDPR compliance
      },
    });
    console.log('Google Analytics initialized');
  } else {
    console.log('Google Analytics not initialized (dev mode or missing ID)');
  }
};

// Track page views
export const trackPageView = (path, title) => {
  if (MEASUREMENT_ID && import.meta.env.PROD) {
    ReactGA.send({ hitType: 'pageview', page: path, title });
  }
};

// Track custom events
export const trackEvent = (category, action, label = '', value = 0) => {
  if (MEASUREMENT_ID && import.meta.env.PROD) {
    ReactGA.event({
      category,
      action,
      label,
      value,
    });
  }
};

// User registration
export const trackSignup = (method = 'email') => {
  trackEvent('User', 'Sign Up', method);
};

// Quest events
export const trackQuestStarted = (questId, questTitle) => {
  trackEvent('Quest', 'Started', questTitle);
};

export const trackQuestCompleted = (questId, questTitle, xpEarned) => {
  trackEvent('Quest', 'Completed', questTitle, xpEarned);
};

export const trackTaskCompleted = (taskId, questTitle, xpEarned) => {
  trackEvent('Task', 'Completed', questTitle, xpEarned);
};

// Subscription events
export const trackSubscriptionStarted = (tier) => {
  trackEvent('Subscription', 'Started', tier);
};

export const trackSubscriptionCancelled = (tier) => {
  trackEvent('Subscription', 'Cancelled', tier);
};

// Social features
export const trackFriendRequest = () => {
  trackEvent('Social', 'Friend Request Sent');
};

export const trackCollaboration = (questTitle) => {
  trackEvent('Social', 'Collaboration Started', questTitle);
};

// Evidence submission
export const trackEvidenceSubmitted = (type) => {
  trackEvent('Evidence', 'Submitted', type);
};

// Diploma sharing
export const trackDiplomaViewed = (userId, isOwner) => {
  trackEvent('Diploma', 'Viewed', isOwner ? 'Own' : 'Public');
};

export const trackDiplomaShared = (platform) => {
  trackEvent('Diploma', 'Shared', platform);
};
```

### 3.3 Initialize in App

Update `frontend/src/App.jsx`:

```javascript
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { initGA, trackPageView } from './services/analytics';

function App() {
  const location = useLocation();

  // Initialize GA on mount
  useEffect(() => {
    initGA();
  }, []);

  // Track page views on route change
  useEffect(() => {
    trackPageView(location.pathname + location.search, document.title);
  }, [location]);

  // ... rest of your App component
}
```

### 3.4 Add Tracking to Key Actions

**Registration** (`frontend/src/pages/RegisterPage.jsx`):
```javascript
import { trackSignup } from '../services/analytics';

const handleSubmit = async (e) => {
  // ... existing registration logic

  if (response.ok) {
    trackSignup('email');
    // ... redirect logic
  }
};
```

**Quest Start** (`frontend/src/pages/QuestDetail.jsx`):
```javascript
import { trackQuestStarted } from '../services/analytics';

const handleStartQuest = async () => {
  // ... existing logic

  if (response.ok) {
    trackQuestStarted(quest.id, quest.title);
    // ... update state
  }
};
```

**Task Completion** (`frontend/src/pages/QuestDetail.jsx`):
```javascript
import { trackTaskCompleted, trackQuestCompleted } from '../services/analytics';

const handleTaskComplete = async (taskId) => {
  // ... existing logic

  if (response.ok) {
    trackTaskCompleted(taskId, quest.title, task.xp_value);

    // If quest completed
    if (allTasksComplete) {
      trackQuestCompleted(quest.id, quest.title, totalXP);
    }
  }
};
```

**Subscription** (`frontend/src/pages/SubscriptionPage.jsx`):
```javascript
import { trackSubscriptionStarted } from '../services/analytics';

const handleSubscribe = async (tier) => {
  // ... existing Stripe logic

  trackSubscriptionStarted(tier);
  // ... redirect to Stripe
};
```

**Diploma View** (`frontend/src/pages/DiplomaPage.jsx`):
```javascript
import { trackDiplomaViewed } from '../services/analytics';

useEffect(() => {
  if (portfolioData) {
    const isOwner = user?.id === portfolioData.user_id;
    trackDiplomaViewed(portfolioData.user_id, isOwner);
  }
}, [portfolioData]);
```

### 3.5 Add Environment Variable

Update both dev and prod environments:

**Development** (optio-dev-frontend service):
```
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

**Production** (optio-prod-frontend service):
```
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

---

## Step 4: Configure Conversions in GA4

### 4.1 Mark Events as Conversions

1. In GA4, go to **Admin** → **Events**
2. Wait 24 hours for events to appear (or test immediately)
3. Mark these as conversions:
   - ✅ `Sign Up` (User registration)
   - ✅ `Completed` (Quest completed)
   - ✅ `Started` (Subscription started)

### 4.2 Set Up Custom Conversions

1. Go to **Admin** → **Conversions**
2. Click **New conversion event**
3. Create conversion for first quest:
   - **Event name**: `first_quest_completed`
   - Mark as conversion

---

## Step 5: Set Up Custom Dimensions

Track additional user properties:

1. Go to **Admin** → **Custom definitions**
2. Click **Create custom dimension**

**Custom Dimension 1: User Tier**
- Dimension name: `user_tier`
- Scope: User
- Description: Subscription tier (free/creator/visionary)

**Custom Dimension 2: User Level**
- Dimension name: `user_level`
- Scope: User
- Description: Achievement level (Explorer/Builder/etc)

**Custom Dimension 3: Quest Pillar**
- Dimension name: `quest_pillar`
- Scope: Event
- Description: Quest skill pillar

### Update Analytics Service:

```javascript
// Set user properties
export const setUserProperties = (user) => {
  if (MEASUREMENT_ID && import.meta.env.PROD) {
    ReactGA.set({
      user_tier: user.subscription_tier,
      user_level: user.level,
      user_id: user.id, // For user-level analysis
    });
  }
};

// Call after login
export const trackLogin = (user) => {
  setUserProperties(user);
  trackEvent('User', 'Login', user.subscription_tier);
};
```

---

## Step 6: Create Custom Reports

### 6.1 User Acquisition Report

1. Go to **Reports** → **Life Cycle** → **Acquisition**
2. This shows where users are coming from
3. Monitor:
   - Traffic sources
   - Landing pages
   - Conversion rates by source

### 6.2 Engagement Report

1. Go to **Reports** → **Life Cycle** → **Engagement**
2. Track:
   - Active users
   - Engagement rate
   - Event counts
   - User journey

### 6.3 Conversion Funnel

1. Go to **Explore**
2. Create **Funnel exploration**
3. Steps:
   - Step 1: Page view (home)
   - Step 2: Sign up
   - Step 3: Quest started
   - Step 4: Quest completed
   - Step 5: Subscription started

---

## Step 7: Set Up Alerts

### 7.1 Custom Insights

1. Go to **Admin** → **Custom Insights**
2. Create alert: **Daily Active Users Drop**
   - Condition: DAU decreases by >20%
   - Alert via email

### 7.2 Real-Time Monitoring

1. Go to **Reports** → **Realtime**
2. Monitor current users
3. Check event activity
4. Verify tracking is working

---

## Key Metrics to Monitor

### User Acquisition
- **New Users**: Daily/weekly signups
- **Traffic Sources**: Where users come from
- **Landing Page Performance**: Which pages convert

### User Engagement
- **DAU/MAU**: Daily/Monthly Active Users
- **Session Duration**: Average time on platform
- **Pages per Session**: Engagement depth
- **Return Rate**: User retention

### Quest Metrics
- **Quests Started**: Enrollment rate
- **Quests Completed**: Completion rate
- **Average XP per User**: Engagement level
- **Task Completion Rate**: Success rate

### Conversion Metrics
- **Signup Conversion**: Landing → Registration
- **Quest Activation**: Registration → First Quest
- **Subscription Conversion**: Free → Paid
- **Retention Rate**: Monthly user return

### Diploma Metrics
- **Diploma Views**: Public portfolio views
- **Share Events**: Diploma sharing activity
- **View Sources**: Where traffic comes from

---

## Privacy & GDPR Compliance

### Implemented Privacy Features

1. **IP Anonymization**: Enabled in config
2. **Production Only**: Analytics disabled in development
3. **No PII Tracking**: Never track names, emails, etc.

### Additional Requirements

Add to Privacy Policy:

```markdown
## Analytics & Cookies

Optio uses Google Analytics to understand how users interact with our platform.
We collect:
- Page views and navigation patterns
- Feature usage and engagement
- Anonymous demographic information
- Device and browser information

We do NOT collect:
- Personal information (names, emails)
- Full IP addresses (anonymized)
- Authentication credentials

You can opt-out of Google Analytics by installing the
[Google Analytics Opt-out Browser Add-on](https://tools.google.com/dlpage/gaoptout).
```

### Cookie Consent (Optional for EU)

If targeting EU users, add cookie consent banner:

```javascript
// frontend/src/components/CookieConsent.jsx
import { useState, useEffect } from 'react';

export default function CookieConsent() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookie_consent');
    if (!consent) {
      setShow(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('cookie_consent', 'accepted');
    setShow(false);
    // Initialize GA here if waiting for consent
  };

  if (!show) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-gray-900 text-white p-4 z-50">
      <div className="container mx-auto flex items-center justify-between">
        <p>
          We use cookies to analyze site usage and improve your experience.
          <a href="/privacy" className="underline ml-2">Learn more</a>
        </p>
        <button
          onClick={handleAccept}
          className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] px-6 py-2 rounded"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
```

---

## Testing Analytics

### Local Testing

1. Run frontend locally: `npm run dev`
2. Open browser console
3. Check for "Google Analytics initialized" message
4. In GA4, go to **Reports** → **Realtime**
5. Perform actions (signup, quest start, etc.)
6. Verify events appear in Realtime report

### Production Testing

1. Deploy to production
2. Test in incognito window
3. Perform key user actions
4. Check GA4 Realtime report
5. Wait 24 hours for full data processing

---

## Deployment Checklist

### Frontend Changes

- [ ] Install react-ga4 package
- [ ] Create analytics service
- [ ] Initialize GA in App.jsx
- [ ] Add tracking to registration
- [ ] Add tracking to quest actions
- [ ] Add tracking to subscriptions
- [ ] Add tracking to social features
- [ ] Add tracking to diploma views

### Environment Variables

- [ ] Add VITE_GA_MEASUREMENT_ID to dev environment
- [ ] Add VITE_GA_MEASUREMENT_ID to prod environment
- [ ] Verify production-only tracking

### Google Analytics

- [ ] Create GA4 property
- [ ] Configure enhanced measurements
- [ ] Set up custom dimensions
- [ ] Mark key conversions
- [ ] Create custom reports
- [ ] Set up alerts

### Testing

- [ ] Test locally (dev mode skips tracking)
- [ ] Test in production
- [ ] Verify Realtime events
- [ ] Wait 24 hours for full data
- [ ] Review all tracked events

---

## Expected Results

After 24 hours, you should see:

- User counts (new vs returning)
- Traffic sources
- Page views and navigation
- Custom events (signups, quest completions, etc.)
- Conversion rates
- User engagement metrics

After 7 days, you'll have enough data for:

- Trend analysis
- User retention metrics
- Funnel optimization
- A/B test planning

---

## Next Steps

1. Create GA4 account and property
2. Get Measurement ID
3. Implement frontend tracking (2 hours)
4. Deploy to development for testing
5. Deploy to production
6. Monitor for 24-48 hours
7. Create custom reports based on data

---

**Priority**: HIGH - Critical for understanding users
**Estimated Time**: 2 hours implementation + 24 hours data collection
**Cost**: $0 (Google Analytics is free)

---

**Last Updated**: 2025-09-29
**Status**: Ready for Implementation