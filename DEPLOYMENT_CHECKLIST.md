# Deployment Checklist

## Environment Variables to Update in Production (Railway/Vercel)

### Required for Backend (Railway)
- [x] `FRONTEND_URL` = `https://optioeducation.com` (NOT the Vercel URL)
- [ ] `SMTP_HOST` = `smtp.sendgrid.net`
- [ ] `SMTP_PORT` = `587`
- [ ] `SMTP_USER` = `apikey`
- [ ] `SMTP_PASS` = Your SendGrid API key (keep secure!)
- [ ] `SENDER_EMAIL` = `support@optioeducation.com`
- [ ] `SENDER_NAME` = `Optio`
- [ ] `FLASK_ENV` = `production` (not development)

### Supabase Dashboard Settings
- [x] Update Site URL to `https://optioeducation.com`
- [x] Add redirect URLs whitelist:
  - `https://optioeducation.com/**`
  - `https://www.optioeducation.com/**`
- [x] Enable Custom SMTP with SendGrid credentials
- [x] Update email templates to use correct domain

## Code Changes Made
1. ✅ Fixed registration error handling
2. ✅ Added password requirements UI with real-time feedback
3. ✅ Removed username field from registration (database doesn't have this column)
4. ✅ Set all new users to 'free' subscription tier
5. ✅ Added email service for custom transactional emails
6. ✅ Removed debug print statements for production
7. ✅ Fixed Content-Type validation for logout endpoint
8. ✅ Added proper error message extraction from nested error objects

## Security Notes
- SendGrid API key is sensitive - never commit to git
- All debug logging only runs in development mode
- User data is sanitized before database storage
- Rate limiting is enabled on auth endpoints

## Testing Before Deploy
- [ ] Test registration with a new email
- [ ] Verify email confirmation redirects to optioeducation.com
- [ ] Test login functionality
- [ ] Check password validation works correctly

## Post-Deployment
- [ ] Monitor error logs for any issues
- [ ] Verify SendGrid is sending emails
- [ ] Check that email confirmations work
- [ ] Test full registration flow on production