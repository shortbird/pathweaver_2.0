# Stripe Payments Implementation Guide

## Overview

This guide documents the Stripe payments integration for the Optio platform, including the migration from legacy tier names (explorer/creator/visionary) to the new tier structure (free/supported/academy).

## Subscription Tiers

| Tier | Price | Features | Stripe Product Required |
|------|-------|----------|------------------------|
| **Free** | $0/month | • 5 basic quests<br>• Public diploma page<br>• Community support | No (handled in-app) |
| **Supported** | $10/month | • Unlimited quests<br>• Priority support<br>• Custom quest submissions<br>• Advanced analytics | Yes - Create in Stripe |
| **Academy** | $25/month | • Everything in Supported<br>• 1-on-1 mentorship<br>• Custom learning paths<br>• Verified certificates | Yes - Create in Stripe |

## Implementation Status ✅

### Backend Changes
- ✅ Updated `config.py` with new tier configuration
- ✅ Enhanced `subscriptions.py` with comprehensive endpoints
- ✅ Added database migration script
- ✅ Implemented webhook handling for all events
- ✅ Added billing portal access
- ✅ Added subscription status endpoint

### Frontend Changes
- ✅ Updated tier mapping utilities
- ✅ Redesigned subscription page with new tiers
- ✅ Created Stripe provider wrapper
- ✅ Added success/cancel pages
- ✅ Integrated billing portal access

### New API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/subscriptions/create-checkout` | POST | Create Stripe checkout session |
| `/api/subscriptions/status` | GET | Get current subscription status |
| `/api/subscriptions/billing-portal` | POST | Access Stripe customer portal |
| `/api/subscriptions/update` | POST | Change subscription tier |
| `/api/subscriptions/cancel` | POST | Cancel subscription |
| `/api/subscriptions/webhook` | POST | Handle Stripe webhooks |

## Setup Instructions

### 1. Database Migration

Run the migration script to add Stripe subscription fields:

```bash
# Connect to your Supabase database and run:
psql -h your-host -U your-user -d your-database -f backend/migrations/add_stripe_subscription_fields.sql
```

### 2. Stripe Dashboard Setup

#### Create Products and Prices

1. Go to [Stripe Dashboard > Products](https://dashboard.stripe.com/products)
2. Click "Add product"

**Supported Tier:**
- Name: "Optio Supported Subscription"
- Description: "Unlimited quests, priority support, and custom submissions"
- Price: $10.00 USD / month
- Billing period: Monthly
- Copy the `price_xxx` ID

**Academy Tier:**
- Name: "Optio Academy Subscription"
- Description: "Premium learning with 1-on-1 mentorship and verified certificates"
- Price: $25.00 USD / month
- Billing period: Monthly
- Copy the `price_xxx` ID

#### Configure Webhook

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Endpoint URL: `https://your-backend.com/api/subscriptions/webhook`
4. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the webhook signing secret

#### Configure Customer Portal

1. Go to [Settings > Billing > Customer portal](https://dashboard.stripe.com/settings/billing/portal)
2. Enable the portal
3. Configure:
   - Allow customers to update payment methods
   - Allow customers to cancel subscriptions
   - Allow customers to view invoices
4. Customize branding with Optio colors (#ef597b and #6d469b)

### 3. Environment Variables

#### Backend (.env)
```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUPPORTED_PRICE_ID=price_...
STRIPE_ACADEMY_PRICE_ID=price_...
```

#### Frontend (.env)
```env
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

### 4. Testing

#### Local Testing with Stripe CLI

```bash
# Install Stripe CLI
# Mac: brew install stripe/stripe-cli/stripe
# Windows: Download from https://stripe.com/docs/stripe-cli

# Login to Stripe
stripe login

# Forward webhooks to local backend
stripe listen --forward-to localhost:5000/api/subscriptions/webhook

# Trigger test events
stripe trigger checkout.session.completed
```

#### Test Cards

- **Success**: 4242 4242 4242 4242
- **Decline**: 4000 0000 0000 0002
- **3D Secure**: 4000 0025 0000 3155

### 5. Production Deployment

#### Pre-deployment Checklist

- [ ] Create live products and prices in Stripe
- [ ] Update environment variables with live keys
- [ ] Configure production webhook endpoint
- [ ] Test with a real card (small amount)
- [ ] Set up monitoring and alerts
- [ ] Configure email notifications

#### Environment Variables (Production)

```env
# Backend
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUPPORTED_PRICE_ID=price_live_...
STRIPE_ACADEMY_PRICE_ID=price_live_...

# Frontend
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_...
```

## User Flows

### New Subscription Flow

1. User visits `/subscription`
2. Selects desired tier (Supported or Academy)
3. Clicks upgrade button
4. Redirected to Stripe Checkout
5. Enters payment details
6. On success: Redirected to `/subscription/success`
7. On cancel: Redirected to `/subscription/cancel`

### Subscription Management Flow

1. User visits `/subscription`
2. Sees current plan status
3. Can access billing portal to:
   - Update payment method
   - Download invoices
   - Cancel subscription

### Cancellation Flow

1. User clicks "Cancel Subscription"
2. Confirmation dialog appears
3. Subscription set to cancel at period end
4. User retains access until end of billing period
5. Automatically downgraded to free tier after

## Monitoring and Maintenance

### Key Metrics to Track

- Conversion rate (free → paid)
- Churn rate
- Failed payment rate
- Average revenue per user (ARPU)
- Lifetime value (LTV)

### Common Issues and Solutions

| Issue | Solution |
|-------|----------|
| Webhook not receiving events | Check webhook secret, ensure HTTPS in production |
| User stuck on wrong tier | Check `subscription_tier` in database, sync with Stripe |
| Payment failed | Check Stripe dashboard for decline reasons |
| Checkout session expired | Sessions expire after 24 hours, create new one |

### Database Queries for Debugging

```sql
-- Check user subscription status
SELECT id, username, subscription_tier, stripe_customer_id, 
       subscription_status, subscription_cancel_at_period_end
FROM users 
WHERE id = 'user-id';

-- View subscription history
SELECT * FROM subscription_history 
WHERE user_id = 'user-id' 
ORDER BY created_at DESC;

-- Count users by tier
SELECT subscription_tier, COUNT(*) 
FROM users 
GROUP BY subscription_tier;
```

## Security Considerations

1. **Always verify webhook signatures** to prevent replay attacks
2. **Never log sensitive data** like full card numbers or CVV
3. **Use HTTPS everywhere** in production
4. **Implement rate limiting** on payment endpoints
5. **Monitor for suspicious activity** (multiple failed payments, unusual patterns)

## Support and Resources

- [Stripe Documentation](https://stripe.com/docs)
- [Stripe Support](https://support.stripe.com)
- [Stripe Status](https://status.stripe.com)
- Internal Support: support@optioed.org

## Migration Notes

### From Legacy Tiers

The system maintains backwards compatibility with legacy tier names:
- `explorer` → `free`
- `creator` → `supported`
- `visionary` → `academy`

The frontend automatically converts legacy tiers using the `convertLegacyTier()` utility function.

### Database Migration

Users with legacy tiers will be automatically migrated when:
1. They log in (tier converted in memory)
2. They interact with subscription features
3. A webhook event is processed for their account

## Future Enhancements

- [ ] Annual billing with discount
- [ ] Team/family plans
- [ ] Student discounts with verification
- [ ] Referral program
- [ ] Usage-based billing for certain features
- [ ] Multiple payment methods support