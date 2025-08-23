# Production Deployment Checklist

## Pre-Deployment
- [ ] All environment variables configured
- [ ] Supabase database schema applied
- [ ] Stripe products and prices created
- [ ] GitHub repositories created

## Backend (Railway/Render)
- [ ] Deployed successfully
- [ ] Environment variables set:
  - [ ] FLASK_APP=app.py
  - [ ] FLASK_ENV=production
  - [ ] SECRET_KEY (generate random string)
  - [ ] SUPABASE_URL
  - [ ] SUPABASE_KEY
  - [ ] SUPABASE_SERVICE_KEY
  - [ ] STRIPE_SECRET_KEY
  - [ ] STRIPE_WEBHOOK_SECRET
  - [ ] FRONTEND_URL (your Vercel URL)
- [ ] API accessible at production URL
- [ ] Test endpoint: GET /api/health

## Frontend (Vercel)
- [ ] Deployed successfully
- [ ] Environment variables set:
  - [ ] VITE_API_URL (your backend URL + /api)
  - [ ] VITE_SUPABASE_URL
  - [ ] VITE_SUPABASE_ANON_KEY
  - [ ] VITE_STRIPE_PUBLIC_KEY
- [ ] Site accessible at production URL
- [ ] React Router working (no 404s)

## Stripe Configuration
- [ ] Products created with correct price IDs
- [ ] Price IDs updated in backend code
- [ ] Webhook endpoint configured
- [ ] Webhook secret added to backend env
- [ ] Test mode disabled (when ready for real payments)

## Supabase Configuration
- [ ] Database schema applied
- [ ] RLS policies active
- [ ] Email authentication enabled
- [ ] Production URLs added to allowed redirects

## Post-Deployment Testing
- [ ] User registration works
- [ ] User login works
- [ ] Quest browsing works
- [ ] Stripe checkout works (test mode)
- [ ] Admin panel accessible (after setting user role)

## Security Checklist
- [ ] All secret keys are unique and secure
- [ ] CORS configured correctly
- [ ] HTTPS enforced on all endpoints
- [ ] Environment variables not exposed in code
- [ ] No debug mode in production

## Monitoring Setup (Optional but Recommended)
- [ ] Error tracking (Sentry)
- [ ] Analytics (Google Analytics/Plausible)
- [ ] Uptime monitoring (UptimeRobot)
- [ ] Log aggregation (Railway/Render logs)

## Creating Admin User
1. Register a normal user account
2. Go to Supabase dashboard → Table Editor → users
3. Find your user and set role = 'admin'
4. Refresh the app - admin panel should appear

## Common Issues & Solutions

### CORS Errors
- Ensure FRONTEND_URL in backend matches exactly
- Check that backend allows your Vercel domain

### Stripe Webhooks Not Working
- Verify webhook secret is correct
- Check Railway/Render logs for webhook errors
- Ensure endpoint URL is exactly correct

### Database Connection Issues
- Verify Supabase keys are correct
- Check if RLS policies are blocking queries
- Review Supabase logs for errors

### Frontend Can't Reach Backend
- Verify VITE_API_URL includes /api path
- Check backend is running and healthy
- Ensure no typos in environment variables

## Support Resources
- Supabase Docs: https://supabase.com/docs
- Stripe Docs: https://stripe.com/docs
- Vercel Docs: https://vercel.com/docs
- Railway Docs: https://docs.railway.app
- Render Docs: https://render.com/docs