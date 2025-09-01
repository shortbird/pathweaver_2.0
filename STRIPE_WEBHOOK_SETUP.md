# Stripe Webhook Setup Guide

## How to Find Your Stripe Webhook Signing Secret

### Step 1: Create a Webhook Endpoint

1. **Log into your Stripe Dashboard**
   - Go to https://dashboard.stripe.com
   - Make sure you're in the correct mode (Test or Live)

2. **Navigate to Webhooks**
   - Click on **"Developers"** in the left sidebar
   - Click on **"Webhooks"**

3. **Add a New Endpoint**
   - Click **"Add endpoint"** button
   - Enter your endpoint URL:
     - For production: `https://your-backend-domain.com/api/subscriptions/webhook`
     - For local testing: Use Stripe CLI (see below)

4. **Select Events to Listen For**
   - Click **"Select events"** or **"+ Select events"**
   - Under **"Checkout"**, select:
     - `checkout.session.completed`
   - Under **"Customer"**, select:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
   - Under **"Invoice"**, select:
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
   - Click **"Add events"**

5. **Create the Endpoint**
   - Click **"Add endpoint"**

### Step 2: Get Your Webhook Signing Secret

1. **After creating the endpoint**, you'll be taken to the webhook details page
2. **Find the "Signing secret"** section
3. Click **"Reveal"** or the eye icon
4. **Copy the secret** - it starts with `whsec_`
5. **Add it to your `.env` file**:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_your_secret_here
   ```

## Local Testing with Stripe CLI

For local development, you can use the Stripe CLI to forward webhooks to your local server:

### Install Stripe CLI

**macOS (using Homebrew):**
```bash
brew install stripe/stripe-cli/stripe
```

**Windows:**
Download from https://github.com/stripe/stripe-cli/releases
Or use Scoop:
```bash
scoop install stripe
```

**Linux:**
```bash
# Download the latest linux tar.gz file from https://github.com/stripe/stripe-cli/releases
tar -xvf stripe_X.X.X_linux_x86_64.tar.gz
sudo mv stripe /usr/local/bin
```

### Use Stripe CLI for Local Testing

1. **Login to Stripe:**
   ```bash
   stripe login
   ```

2. **Forward webhooks to your local server:**
   ```bash
   stripe listen --forward-to localhost:5000/api/subscriptions/webhook
   ```

3. **The CLI will display a webhook signing secret** for local testing:
   ```
   > Ready! Your webhook signing secret is whsec_test_xxxxx (^C to quit)
   ```

4. **Copy this temporary secret** and add it to your backend `.env`:
   ```env
   STRIPE_WEBHOOK_SECRET=whsec_test_xxxxx
   ```

5. **Keep the CLI running** while testing locally

### Test Webhook Events

While the CLI is running, you can trigger test events:

```bash
# Test a successful checkout
stripe trigger checkout.session.completed

# Test a subscription update
stripe trigger customer.subscription.updated

# Test a failed payment
stripe trigger invoice.payment_failed
```

## Verifying Webhook Configuration

### Check if webhooks are working:

1. **In Stripe Dashboard:**
   - Go to Developers > Webhooks
   - Click on your webhook endpoint
   - Check the "Webhook attempts" section
   - Look for successful (200) responses

2. **Common Issues:**

| Issue | Solution |
|-------|----------|
| 400 Bad Request | Check webhook secret is correct |
| 401 Unauthorized | Verify STRIPE_WEBHOOK_SECRET in .env |
| 404 Not Found | Check endpoint URL is correct |
| 500 Server Error | Check server logs for errors |

### Debug Webhook Payload

Add this temporary debug code to your webhook handler:

```python
@bp.route('/webhook', methods=['POST'])
def stripe_webhook():
    payload = request.get_data(as_text=True)
    sig_header = request.headers.get('Stripe-Signature')
    
    # Debug logging
    print(f"Webhook received")
    print(f"Signature present: {bool(sig_header)}")
    print(f"Webhook secret configured: {bool(Config.STRIPE_WEBHOOK_SECRET)}")
    
    # ... rest of your code
```

## Environment Variables Checklist

Make sure these are all set in your backend `.env` file:

```env
# Required for Stripe
STRIPE_SECRET_KEY=sk_test_...  # or sk_live_... for production

# Required for webhooks
STRIPE_WEBHOOK_SECRET=whsec_...  # From webhook endpoint settings

# Required for yearly pricing (create these products in Stripe)
STRIPE_SUPPORTED_MONTHLY_PRICE_ID=price_...  # $39.99/month
STRIPE_SUPPORTED_YEARLY_PRICE_ID=price_...   # $399.99/year
STRIPE_ACADEMY_MONTHLY_PRICE_ID=price_...    # $499.99/month
STRIPE_ACADEMY_YEARLY_PRICE_ID=price_...     # $4999.99/year
```

## Creating Products with Yearly Pricing

### In Stripe Dashboard:

1. **Go to Products** (https://dashboard.stripe.com/products)

2. **Create Supported Tier Products:**
   - Click "Add product"
   - Name: "Optio Supported - Monthly"
   - Price: $39.99, Recurring, Monthly
   - Save and copy the `price_xxx` ID
   
   - Click "Add another price" on the same product
   - Name: "Optio Supported - Yearly"
   - Price: $399.99, Recurring, Yearly
   - Save and copy the `price_xxx` ID

3. **Create Academy Tier Products:**
   - Click "Add product"
   - Name: "Optio Academy - Monthly"
   - Price: $499.99, Recurring, Monthly
   - Save and copy the `price_xxx` ID
   
   - Click "Add another price" on the same product
   - Name: "Optio Academy - Yearly"
   - Price: $4999.99, Recurring, Yearly
   - Save and copy the `price_xxx` ID

## Proration Behavior

Stripe automatically handles proration when customers upgrade or change billing periods:

- **Monthly to Yearly:** Customer is charged the prorated amount for the rest of the year
- **Supported to Academy:** Customer is credited for unused time on Supported, charged for Academy
- **Yearly to Monthly:** Credit is applied to future invoices

The system is configured with `proration_behavior: 'create_prorations'` to handle this automatically.

## Testing Checklist

- [x] Webhook endpoint created in Stripe Dashboard
- [x] Webhook signing secret added to .env
- [x] Monthly price IDs created and added to .env
- [x] Yearly price IDs created and added to .env
- [] Test webhook with Stripe CLI locally
- [] Test upgrade from Supported to Academy
- [] Test switching from monthly to yearly billing
- [] Verify proration is working correctly