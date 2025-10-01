# Badge System Setup Instructions

## Current Status

The badge system infrastructure is fully implemented:
- ✅ Database tables created
- ✅ Backend services and routes working
- ✅ Frontend pages and components built
- ✅ Navigation links added
- ❌ **No badges in database yet** (this is why the pages appear empty)

## Quick Setup (Recommended)

### Option 1: Use Admin API Endpoint

1. **Deploy the latest code** (already pushed to develop branch)
2. **Log in as admin** at https://optio-dev-frontend.onrender.com
3. **Call the seed endpoint** using browser console or API client:

```javascript
// In browser console while logged in as admin:
fetch('https://optio-dev-backend.onrender.com/api/admin/seed/initial-badges', {
  method: 'POST',
  credentials: 'include' // Important for cookies
})
.then(res => res.json())
.then(data => console.log(data));
```

OR use curl:
```bash
# You'll need to include your auth cookie
curl -X POST https://optio-dev-backend.onrender.com/api/admin/seed/initial-badges \
  -H "Cookie: your-session-cookie" \
  -H "Content-Type: application/json"
```

This will create 13 foundational badges across all 5 pillars.

### Option 2: Run SQL Directly in Supabase

1. **Go to Supabase Dashboard** → SQL Editor
2. **Run the SQL file**: `backend/database_migration/seed_initial_badges.sql`
3. **Verify**: Check the `badges` table to see 13 new badges

## What Gets Created

The seed script creates 13 badges:

### STEM & Logic (3 badges)
- **Systems Thinker** - 5 quests, 1500 XP
- **Scientific Investigator** - 6 quests, 1800 XP
- **Mathematical Reasoner** - 8 quests, 2500 XP

### Life & Wellness (2 badges)
- **Mindful Practitioner** - 4 quests, 1200 XP
- **Physical Wellness Explorer** - 5 quests, 1500 XP

### Language & Communication (2 badges)
- **Creative Storyteller** - 7 quests, 2000 XP
- **Compelling Communicator** - 6 quests, 1800 XP

### Society & Culture (3 badges)
- **Community Builder** - 5 quests, 1500 XP
- **Cultural Explorer** - 6 quests, 1800 XP
- **Historical Investigator** - 7 quests, 2000 XP

### Arts & Creativity (3 badges)
- **Visual Artist** - 6 quests, 1800 XP
- **Creative Problem Solver** - 5 quests, 1500 XP
- **Design Thinker** - 6 quests, 1800 XP

## After Seeding

Once badges are created, you should immediately see:

1. **Badge Explorer** (`/badges`) - Grid of all 13 badges with filtering
2. **Badge Detail** (`/badges/:id`) - Individual badge pages with details
3. **Dashboard Recommendations** - AI-powered badge suggestions (if you have completed quests)

## Next Steps: Link Badges to Quests

Currently, badges exist but have no associated quests. To make them functional:

### Option A: Manual Quest Linking (Recommended for Testing)

Use the admin badge management endpoint:

```javascript
// Link a quest to a badge
fetch('https://optio-dev-backend.onrender.com/api/badges/admin/<badge_id>/quests', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    quest_id: '<quest_id>',
    is_required: true,
    order_index: 0
  })
})
.then(res => res.json())
.then(data => console.log(data));
```

### Option B: AI-Powered Quest Generation (Future)

Once badges exist, you can use the AI generation endpoint to create quests:

```javascript
// Generate quests for a badge
fetch('https://optio-dev-backend.onrender.com/api/v3/ai-generation/badges/<badge_id>/generate-quests', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    count: 12  // Number of quests to generate
  })
})
.then(res => res.json())
.then(data => console.log(data));
```

## Troubleshooting

### "No badges appear on /badges page"
- Check if badges were successfully created in database
- Check browser console for API errors
- Verify backend is deployed and running

### "Badge recommendations don't show on dashboard"
- This is normal if:
  - No badges exist in database (seed them first)
  - User has no completed quests yet (needed for AI recommendations)
  - User is not logged in (recommendations require auth)

### "Can't call admin endpoint"
- Ensure you're logged in as admin user
- Check that cookies are being sent (`credentials: 'include'`)
- Verify you're hitting the correct backend URL

## Testing the Badge System

Once badges are seeded, test the complete flow:

1. ✅ **Browse badges**: Go to `/badges` and see all 13 badges
2. ✅ **Filter badges**: Try filtering by pillar
3. ✅ **View badge detail**: Click on any badge
4. ✅ **Select a badge**: Click "Start This Badge" button
5. ✅ **Check dashboard**: See active badge progress
6. ⚠️ **Complete quests**: Link existing quests to badges first (see above)
7. ✅ **Badge progress**: Progress updates as quests are completed
8. ✅ **Badge completion**: Badge awarded when requirements met

## Development vs Production

### Development (current)
- URL: https://optio-dev-frontend.onrender.com
- Backend: https://optio-dev-backend.onrender.com
- Branch: `develop`
- Safe to experiment

### Production (when ready)
- URL: https://www.optioeducation.com
- Backend: https://optio-prod-backend.onrender.com
- Branch: `main`
- Merge from develop after thorough testing

## Support

If you encounter issues:
1. Check backend logs on Render dashboard
2. Check browser console for frontend errors
3. Verify database tables exist in Supabase
4. Check that all routes are registered in `app.py`
