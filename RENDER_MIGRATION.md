# Render Migration Guide

## Migration from Vercel to Render - Complete Instructions

### Prerequisites
1. GitHub repository connected to Render
2. Render account created
3. Stripe account for webhooks update

### Step 1: Create Backend Service on Render
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "Web Service"
3. Connect your GitHub repository
4. Configure:
   - **Name**: `optio-backend`
   - **Environment**: Python 3
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `gunicorn app:app --bind 0.0.0.0:$PORT`
   - **Plan**: Select at least Starter ($7/month)

### Step 2: Configure Backend Environment Variables
Add these in Render dashboard for backend service:
```
FLASK_ENV=production
FLASK_SECRET_KEY=<generate-secure-key>
SUPABASE_URL=https://vvfgxcykxjybtvpfzwyx.supabase.co
SUPABASE_ANON_KEY=<your-anon-key>
SUPABASE_SERVICE_KEY=<your-service-key>
FRONTEND_URL=https://optio-frontend.onrender.com
OPENAI_API_KEY=<your-key>
GEMINI_API_KEY=<your-key>
STRIPE_SECRET_KEY=<your-key>
STRIPE_WEBHOOK_SECRET=<your-key>
```

### Step 3: Create Frontend Static Site on Render
1. Click "New +" → "Static Site"
2. Connect same GitHub repository
3. Configure:
   - **Name**: `optio-frontend`
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Publish Directory**: `frontend/dist`
   - **Plan**: Free tier

### Step 4: Configure Frontend Environment Variables
Add these in Render dashboard for frontend service:
```
NODE_VERSION=18.17.0
VITE_API_URL=https://optio-backend.onrender.com
VITE_SUPABASE_URL=https://vvfgxcykxjybtvpfzwyx.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### Step 5: Update Stripe Webhook
1. Go to [Stripe Dashboard](https://dashboard.stripe.com/webhooks)
2. Update webhook endpoint to: `https://optio-backend.onrender.com/api/stripe/webhook`
3. Copy new webhook secret to backend env vars

### Step 6: Custom Domain Setup (Optional)
1. In Render dashboard, go to each service
2. Click "Settings" → "Custom Domains"
3. Add your domain (e.g., optioeducation.com)
4. Update DNS records as instructed

### Step 7: Deploy
1. Push to main branch: `git push origin main`
2. Both services will auto-deploy
3. Monitor logs in Render dashboard

### Files Modified for Migration
- `render.yaml` - Render deployment configuration
- `app.py` - Main entry point for Gunicorn
- `backend/config.py` - Added Render URLs to CORS
- `frontend/.env.production` - Updated API URL

### Post-Deployment Checklist
- [ ] Backend service is running
- [ ] Frontend loads correctly
- [ ] API calls work (test login/signup)
- [ ] Stripe payments process correctly
- [ ] Quest submission works
- [ ] Diploma pages load
- [ ] Custom domain configured (if applicable)

### Rollback Plan
If issues occur:
1. Keep Vercel deployment active during migration
2. Test thoroughly on Render URLs first
3. Only switch DNS after confirming everything works
4. Can revert DNS to Vercel if needed

### Cost Comparison
- **Vercel**: Free tier + potential overages
- **Render**: 
  - Backend: $7/month (Starter)
  - Frontend: Free (Static Site)
  - Total: $7/month minimum

### Support
- Render Documentation: https://render.com/docs
- Support: support@render.com
- Status Page: https://status.render.com