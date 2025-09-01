# Stripe Configuration Setup

## Issue Identified
The Stripe payment integration is failing with a 500 error because:

1. **Missing Stripe Secret Key**: Currently using placeholder `sk_test_your-key`
2. **Missing Stripe Price IDs**: No actual Stripe price objects configured
3. **Missing Webhook Secret**: Using placeholder value

## Required Stripe Configuration

### 1. Environment Variables for Backend (Production)

Set these in your production environment (Render/Railway):

```bash
# Core Stripe Configuration
STRIPE_SECRET_KEY=sk_live_your_actual_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_actual_webhook_secret

# Monthly Subscription Price IDs
STRIPE_SUPPORTED_MONTHLY_PRICE_ID=price_1234567890_supported_monthly
STRIPE_ACADEMY_MONTHLY_PRICE_ID=price_1234567890_academy_monthly

# Yearly Subscription Price IDs (with discount)
STRIPE_SUPPORTED_YEARLY_PRICE_ID=price_1234567890_supported_yearly
STRIPE_ACADEMY_YEARLY_PRICE_ID=price_1234567890_academy_yearly

# Legacy compatibility (point to monthly)
STRIPE_SUPPORTED_PRICE_ID=price_1234567890_supported_monthly
STRIPE_ACADEMY_PRICE_ID=price_1234567890_academy_monthly
```

### 2. Environment Variables for Frontend

Update `.env.production`:

```bash
VITE_STRIPE_PUBLIC_KEY=pk_live_your_actual_stripe_publishable_key
```

### 3. Stripe Dashboard Setup Required

In your Stripe Dashboard:

1. **Create Products**:
   - Supported Plan: $39.99/month, $399.99/year
   - Academy Plan: $499.99/month, $4999.99/year

2. **Create Prices**: 
   - Each product needs monthly and yearly price objects
   - Copy the price IDs (start with `price_`) to environment variables

3. **Configure Webhook**:
   - Endpoint: `https://your-backend-domain.com/api/subscriptions/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`, `invoice.payment_succeeded`

### 4. Testing the Configuration

1. **Check configuration endpoint**:
   ```bash
   curl https://your-backend-domain.com/api/subscriptions/config
   ```

2. **Expected response when properly configured**:
   ```json
   {
     "stripe_configured": true,
     "stripe_key_prefix": "sk_live",
     "price_ids_configured": {
       "supported": {
         "monthly": true,
         "yearly": true
       },
       "academy": {
         "monthly": true,
         "yearly": true
       }
     },
     "webhook_configured": true
   }
   ```

## Current Error Fix Applied

1. **Enhanced error handling**: Better error messages for missing configuration
2. **Configuration validation**: Checks for placeholder values
3. **Debug endpoint**: `/api/subscriptions/config` to verify setup
4. **Improved logging**: More detailed error information

## Next Steps

1. **Set up Stripe account** and create the required products/prices
2. **Add environment variables** to production deployment
3. **Test the configuration** using the debug endpoint
4. **Configure webhooks** for subscription management

## Security Notes

- Never commit real Stripe keys to version control
- Use test keys (`sk_test_`) for development
- Use live keys (`sk_live_`) for production only
- Webhook secrets are critical for security