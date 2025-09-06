# Stripe Setup Instructions for Optio Platform

## Issue Resolution Summary

✅ **FIXED**: Frontend bug with missing `loading` state variable in SubscriptionPage.jsx
✅ **CONFIGURED**: Placeholder environment variables on both dev and prod backends
🔄 **REQUIRED**: Stripe Dashboard setup and environment variable updates

## Current Status

The subscription page frontend bug has been fixed and deployed to the develop branch. The backend is now configured with placeholder environment variables that need to be replaced with actual Stripe price IDs and webhook secrets.

## Required Stripe Dashboard Setup

### 1. Create Products and Prices

You need to create these products in your Stripe Dashboard:

#### Supported Tier Product
- **Product Name**: "Optio Supported Subscription"
- **Description**: "Access to Optio's supported learning features"
- **Monthly Price**: $39.99/month recurring
- **Yearly Price**: $449.99/year recurring (~6% discount)

#### Academy Tier Product  
- **Product Name**: "Optio Academy Subscription"
- **Description**: "Full academy experience with 1-on-1 support"
- **Monthly Price**: $499.99/month recurring
- **Yearly Price**: $5,499.99/year recurring (~8% discount)

### 2. Environment Variables to Update

Once you create the products, you'll get price IDs that look like `price_1234567890abcdef`. Replace the placeholder values with the actual price IDs:

#### Development Environment (`srv-d2tnvlvfte5s73ae8npg`)
```bash
# Replace these placeholders with actual test price IDs
STRIPE_SUPPORTED_MONTHLY_PRICE_ID=price_test_your_supported_monthly_id
STRIPE_ACADEMY_MONTHLY_PRICE_ID=price_test_your_academy_monthly_id
STRIPE_SUPPORTED_YEARLY_PRICE_ID=price_test_your_supported_yearly_id
STRIPE_ACADEMY_YEARLY_PRICE_ID=price_test_your_academy_yearly_id
STRIPE_WEBHOOK_SECRET=whsec_your_dev_webhook_secret
```

#### Production Environment (`srv-d2to00vfte5s73ae9310`)
```bash
# Replace these placeholders with actual live price IDs
STRIPE_SUPPORTED_MONTHLY_PRICE_ID=price_your_supported_monthly_id
STRIPE_ACADEMY_MONTHLY_PRICE_ID=price_your_academy_monthly_id
STRIPE_SUPPORTED_YEARLY_PRICE_ID=price_your_supported_yearly_id
STRIPE_ACADEMY_YEARLY_PRICE_ID=price_your_academy_yearly_id
STRIPE_WEBHOOK_SECRET=whsec_your_prod_webhook_secret

# CRITICAL: Switch to live keys for production
STRIPE_SECRET_KEY=sk_live_your_live_secret_key  # Currently using test keys!
```

### 3. Webhook Configuration

Set up webhook endpoints in your Stripe Dashboard:

#### Development Webhook
- **URL**: `https://optio-dev-backend.onrender.com/api/subscriptions/webhook`
- **Events**: 
  - `checkout.session.completed`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `invoice.payment_failed`
  - `invoice.payment_succeeded`

#### Production Webhook  
- **URL**: `https://optio-prod-backend.onrender.com/api/subscriptions/webhook`
- **Events**: Same as above

### 4. Security Concerns

🚨 **CRITICAL SECURITY ISSUE**: Production environment is currently using test Stripe keys (`sk_test_`). This must be changed to live keys (`sk_live_`) before accepting real payments.

## Step-by-Step Instructions

### Step 1: Access Stripe Dashboard
1. Log into your Stripe Dashboard
2. Switch to test mode for development setup
3. Switch to live mode for production setup

### Step 2: Create Products
1. Go to Products → Add Product
2. Create "Optio Supported Subscription" with monthly ($39.99) and yearly ($399.99) prices
3. Create "Optio Academy Subscription" with monthly ($499.99) and yearly ($4,999.99) prices
4. Note down all price IDs

### Step 3: Update Environment Variables
Use the MCP Render integration to update environment variables:

```bash
# Development Backend (srv-d2tnvlvfte5s73ae8npg)
mcp__render__update_environment_variables(
  serviceId="srv-d2tnvlvfte5s73ae8npg",
  envVars=[
    {"key": "STRIPE_SUPPORTED_MONTHLY_PRICE_ID", "value": "price_test_actual_id"},
    {"key": "STRIPE_ACADEMY_MONTHLY_PRICE_ID", "value": "price_test_actual_id"},
    {"key": "STRIPE_SUPPORTED_YEARLY_PRICE_ID", "value": "price_test_actual_id"},
    {"key": "STRIPE_ACADEMY_YEARLY_PRICE_ID", "value": "price_test_actual_id"},
    {"key": "STRIPE_WEBHOOK_SECRET", "value": "whsec_actual_dev_secret"}
  ]
)

# Production Backend (srv-d2to00vfte5s73ae9310)
mcp__render__update_environment_variables(
  serviceId="srv-d2to00vfte5s73ae9310",
  envVars=[
    {"key": "STRIPE_SECRET_KEY", "value": "sk_live_actual_live_key"},
    {"key": "STRIPE_SUPPORTED_MONTHLY_PRICE_ID", "value": "price_actual_id"},
    {"key": "STRIPE_ACADEMY_MONTHLY_PRICE_ID", "value": "price_actual_id"},
    {"key": "STRIPE_SUPPORTED_YEARLY_PRICE_ID", "value": "price_actual_id"},
    {"key": "STRIPE_ACADEMY_YEARLY_PRICE_ID", "value": "price_actual_id"},
    {"key": "STRIPE_WEBHOOK_SECRET", "value": "whsec_actual_prod_secret"}
  ]
)
```

### Step 4: Configure Webhooks
1. Go to Developers → Webhooks in Stripe Dashboard
2. Add endpoint for dev environment
3. Add endpoint for production environment
4. Copy webhook signing secrets and update environment variables

### Step 5: Test the Flow
1. Test in development environment first:
   - Visit: https://optio-dev-frontend.onrender.com/subscription
   - Try upgrading to Supported tier
   - Verify checkout session creation
   - Complete test payment
   - Check webhook events in Stripe Dashboard

2. Once dev testing passes, test production environment:
   - Visit: https://www.optioeducation.com/subscription
   - Complete same testing flow with live payments

## Debugging Endpoints

The backend includes several debugging endpoints to help troubleshoot:

- `GET /api/subscriptions/config` - Check Stripe configuration status
- `POST /api/subscriptions/test-checkout-debug` - Debug checkout flow
- `GET /api/subscriptions/test-user/:userId` - Check user database status

## Expected Results

After completing setup:
- ✅ Users can upgrade to Supported ($39.99/month) and Academy ($499.99/month) tiers
- ✅ Billing portal access works for subscription management
- ✅ Webhook events properly update user subscription tiers in database
- ✅ All subscription lifecycle events are handled (upgrades, downgrades, cancellations)

## Current Deployment Status

- **Frontend Fix**: Deployed to develop branch (https://optio-dev-frontend.onrender.com)
- **Backend Config**: Placeholder variables deployed to both environments
- **Next Steps**: Replace placeholders with actual Stripe price IDs

Once the Stripe Dashboard setup is complete and environment variables are updated, the subscription system will be fully functional.


STRIPE_ACADEMY_MONTHLY_PRICE_ID=price_[academy_monthly_id]
STRIPE_ACADEMY_YEARLY_PRICE_ID=price_[academy_yearly_id]
STRIPE_SECRET_KEY=sk_test_[your_test_secret_key]
STRIPE_SUPPORTED_MONTHLY_PRICE_ID=price_[supported_monthly_id]
STRIPE_SUPPORTED_YEARLY_PRICE_ID=price_[supported_yearly_id]
STRIPE_WEBHOOK_SECRET=whsec_[your_webhook_secret]
