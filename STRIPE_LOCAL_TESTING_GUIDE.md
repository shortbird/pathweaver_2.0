# Stripe Local Testing Guide

## Quick Start

I've created PowerShell scripts to help you test Stripe webhooks locally on Windows.

## Step 1: Install Stripe CLI

Open PowerShell as Administrator and run:

```powershell
# Navigate to project directory
cd C:\Users\tanne\Desktop\pw_v2

# Install Stripe CLI
.\setup-stripe-cli.ps1
```

This will install Stripe CLI using Scoop package manager.

## Step 2: Start Your Backend

Make sure your Flask backend is running:

```bash
cd backend
python app.py
```

Your backend should be running on `http://localhost:5000`

## Step 3: Start Webhook Forwarding

Open a new PowerShell window and run:

```powershell
cd C:\Users\tanne\Desktop\pw_v2
.\test-stripe-webhooks.ps1
```

This will:
1. Log you into Stripe (first time only)
2. Start forwarding webhooks to your local backend
3. Display a temporary webhook signing secret

**IMPORTANT**: Copy the webhook signing secret that appears (starts with `whsec_`) and add it to your `backend/.env`:

```env
STRIPE_WEBHOOK_SECRET=whsec_test_xxxxxxxxxxxxx
```

Keep this PowerShell window open while testing!

## Step 4: Trigger Test Events

Open another PowerShell window and run:

```powershell
cd C:\Users\tanne\Desktop\pw_v2
.\trigger-stripe-events.ps1
```

This interactive script lets you:
- Trigger individual webhook events
- Run all tests in sequence
- Verify your webhook handling

## Step 5: Verify Webhook Processing

Check your backend console for webhook processing logs. You should see:
- "Webhook received" messages
- Event type logging
- Database update confirmations

## Manual Testing Commands

If you prefer manual commands, here are the individual steps:

### Install Stripe CLI (Manual)

```powershell
# Install Scoop if not installed
Set-ExecutionPolicy RemoteSigned -Scope CurrentUser -Force
irm get.scoop.sh | iex

# Install Stripe CLI
scoop install stripe
```

### Start Webhook Forwarding (Manual)

```powershell
# Login to Stripe
stripe login

# Forward webhooks to local backend
stripe listen --forward-to localhost:5000/api/subscriptions/webhook
```

### Trigger Test Events (Manual)

```powershell
# Test successful checkout
stripe trigger checkout.session.completed

# Test subscription update
stripe trigger customer.subscription.updated

# Test payment success
stripe trigger invoice.payment_succeeded

# Test payment failure
stripe trigger invoice.payment_failed

# Test subscription cancellation
stripe trigger customer.subscription.deleted
```

## Testing Checklist

- [ ] Backend is running on localhost:5000
- [ ] Stripe CLI is installed
- [ ] Webhook forwarding is active
- [ ] Webhook secret is in backend/.env
- [ ] Test events trigger successfully
- [ ] Backend logs show webhook processing
- [ ] Database updates correctly

## Common Issues

### Issue: "stripe: command not found"
**Solution**: Run `.\setup-stripe-cli.ps1` to install Stripe CLI

### Issue: "Failed to login to Stripe"
**Solution**: Make sure you have a Stripe account and are connected to internet

### Issue: "Connection refused" when triggering events
**Solution**: 
1. Make sure your backend is running
2. Check that webhook forwarding is active
3. Verify the port number (default is 5000)

### Issue: "Invalid signature" in backend logs
**Solution**: 
1. Copy the webhook secret from the forwarding window
2. Update STRIPE_WEBHOOK_SECRET in backend/.env
3. Restart your backend

### Issue: PowerShell scripts won't run
**Solution**: Enable script execution:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

## Test Scenarios

### 1. New Subscription Test
1. Trigger `checkout.session.completed`
2. Verify user's subscription_tier updates in database
3. Check activity_log for subscription_started event

### 2. Upgrade Test (Supported → Academy)
1. Trigger `customer.subscription.updated`
2. Verify tier change in database
3. Check for proration handling

### 3. Payment Failure Test
1. Trigger `invoice.payment_failed`
2. Verify subscription_status changes to 'past_due'
3. Check activity_log for payment_failed event

### 4. Cancellation Test
1. Trigger `customer.subscription.deleted`
2. Verify user downgrades to 'free' tier
3. Check activity_log for subscription_ended event

## Next Steps

Once local testing is complete:
1. Deploy your backend with the production webhook URL
2. Create production webhook endpoint in Stripe Dashboard
3. Use production webhook secret in deployed environment
4. Test with real test cards in production

## Resources

- [Stripe CLI Documentation](https://stripe.com/docs/stripe-cli)
- [Webhook Testing Guide](https://stripe.com/docs/webhooks/test)
- [Test Card Numbers](https://stripe.com/docs/testing)
- [Webhook Events Reference](https://stripe.com/docs/api/events/types)