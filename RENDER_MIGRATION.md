# Frontend Migration Guide: Vercel to Render

## Quick Migration Steps (Frontend Only)

### Prerequisites
- Render account created
- GitHub repository already connected
- Backend already running on Render at `https://optio-8ibe.onrender.com`

### Step 1: Create Frontend Static Site on Render
1. Click "New +" → "Static Site"
2. Connect same GitHub repository
3. Configure:
   - **Name**: `optio-frontend`
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Publish Directory**: `frontend/dist`
   - **Plan**: Free tier

### Step 2: Configure Frontend Environment Variables
Add these in Render dashboard for frontend service:
```
NODE_VERSION=18.17.0
VITE_API_URL=https://optio-8ibe.onrender.com
VITE_SUPABASE_URL=https://vvfgxcykxjybtvpfzwyx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ2Zmd4Y3lreGp5YnR2cGZ6d3l4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTU5ODQ2NTAsImV4cCI6MjA3MTU2MDY1MH0.Bh00lJuio6mYbAaJDd7BXsdRkm8azGw2A8djCq7cmO0
```

### Step 3: Custom Domain Setup (Optional)
1. In Render dashboard, go to each service
2. Click "Settings" → "Custom Domains"
3. Add your domain (e.g., optioeducation.com)
4. Update DNS records as instructed

### Step 4: Deploy
1. Push to main branch: `git push origin main`
2. Frontend will auto-deploy
3. Monitor build logs in Render dashboard

### Step 5: Update DNS (When Ready)
1. In Vercel: Remove custom domain
2. In Render: Add custom domain 
3. Update DNS A/CNAME records to point to Render

## Files Modified for Migration
- `render.yaml` - Frontend service configuration
- `frontend/.env.production` - API URL points to existing backend
- `frontend/public/_redirects` - Already configured for SPA routing

## Post-Deployment Checklist
- [ ] Frontend builds successfully on Render
- [ ] Homepage loads at `https://optio-frontend.onrender.com`
- [ ] API calls work (test login/signup)
- [ ] Quest hub loads properly
- [ ] Diploma pages render correctly
- [ ] All routing works (no 404s on refresh)
- [ ] Assets load (images, fonts)

## Testing Before DNS Switch
1. Test everything at: `https://optio-frontend.onrender.com`
2. Keep Vercel live during testing
3. Only switch DNS after full verification

## Rollback Plan
- Keep Vercel deployment active until Render is verified
- DNS can be reverted to Vercel within minutes if needed
- No data loss risk (backend unchanged)

## Cost Comparison
- **Vercel**: Free tier with potential overages
- **Render Frontend**: Free (Static Site)
- **Savings**: Eliminates Vercel overage risks

## Important Notes
- Backend remains at: `https://optio-8ibe.onrender.com`  
- No backend changes needed
- Frontend auto-deploys on git push to main
- Build time: ~2-3 minutes typically