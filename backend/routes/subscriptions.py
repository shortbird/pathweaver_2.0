from flask import Blueprint, request, jsonify
import stripe
import os
from datetime import datetime
from database import get_supabase_client
from utils.auth.decorators import require_auth
from config import Config

bp = Blueprint('subscriptions', __name__)
stripe.api_key = Config.STRIPE_SECRET_KEY

# Get tier prices from config
SUBSCRIPTION_PRICES = Config.STRIPE_TIER_PRICES

@bp.route('/create-checkout', methods=['POST'])
@require_auth
def create_checkout_session(user_id):
    """Create a Stripe checkout session for subscription upgrade"""
    data = request.json
    tier = data.get('tier', 'supported')
    billing_period = data.get('billing_period', 'monthly')  # 'monthly' or 'yearly'
    
    # Validate tier
    if tier not in ['supported', 'academy']:
        return jsonify({'error': 'Invalid subscription tier. Choose "supported" or "academy".'}), 400
    
    # Validate billing period
    if billing_period not in ['monthly', 'yearly']:
        return jsonify({'error': 'Invalid billing period. Choose "monthly" or "yearly".'}), 400
    
    # Get price ID from config based on tier and billing period
    tier_prices = SUBSCRIPTION_PRICES.get(tier)
    if isinstance(tier_prices, dict):
        price_id = tier_prices.get(billing_period)
    else:
        # Backwards compatibility for old config format
        price_id = tier_prices if billing_period == 'monthly' else None
    
    if not price_id:
        return jsonify({
            'error': f'Stripe price ID not configured for {tier} tier ({billing_period}). Please contact support.'
        }), 500
    
    supabase = get_supabase_client()
    
    try:
        # Get user data
        user_response = supabase.table('users').select('*').eq('id', user_id).single().execute()
        user = user_response.data
        
        # Create or retrieve Stripe customer
        if not user.get('stripe_customer_id'):
            # Get email from auth.users table
            auth_user = supabase.auth.admin.get_user_by_id(user_id)
            email = auth_user.user.email if auth_user else None
            
            customer = stripe.Customer.create(
                email=email,
                metadata={'user_id': user_id},
                name=f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
            )
            
            # Update user with Stripe customer ID
            supabase.table('users').update({
                'stripe_customer_id': customer.id
            }).eq('id', user_id).execute()
            
            stripe_customer_id = customer.id
        else:
            stripe_customer_id = user['stripe_customer_id']
        
        # Create checkout session with proration for upgrades
        checkout_session = stripe.checkout.Session.create(
            customer=stripe_customer_id,
            payment_method_types=['card'],
            line_items=[{
                'price': price_id,
                'quantity': 1
            }],
            mode='subscription',
            success_url=f"{Config.FRONTEND_URL}/subscription/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{Config.FRONTEND_URL}/subscription/cancel",
            metadata={
                'user_id': user_id,
                'tier': tier,
                'billing_period': billing_period
            },
            subscription_data={
                'metadata': {
                    'user_id': user_id,
                    'tier': tier,
                    'billing_period': billing_period
                },
                'proration_behavior': 'create_prorations'  # Automatically prorate when upgrading
            },
            allow_promotion_codes=True  # Allow coupon codes
        )
        
        return jsonify({'checkout_url': checkout_session.url}), 200
        
    except Exception as e:
        print(f"Error creating checkout session: {str(e)}")
        return jsonify({'error': 'Failed to create checkout session'}), 500

@bp.route('/status', methods=['GET'])
@require_auth
def get_subscription_status(user_id):
    """Get current subscription status for a user"""
    supabase = get_supabase_client()
    
    try:
        # Get user data
        user_response = supabase.table('users').select('*').eq('id', user_id).single().execute()
        user = user_response.data
        
        # Basic response for users without Stripe customer
        if not user.get('stripe_customer_id'):
            return jsonify({
                'tier': user.get('subscription_tier', 'free'),
                'status': 'inactive',
                'stripe_customer': False
            }), 200
        
        # Get active subscriptions from Stripe
        subscriptions = stripe.Subscription.list(
            customer=user['stripe_customer_id'],
            status='all',
            limit=1
        )
        
        if subscriptions.data:
            subscription = subscriptions.data[0]
            
            # Map subscription to tier based on price ID
            current_tier = 'free'
            for tier, price_id in SUBSCRIPTION_PRICES.items():
                if price_id and subscription['items']['data'][0]['price']['id'] == price_id:
                    current_tier = tier
                    break
            
            return jsonify({
                'tier': current_tier,
                'status': subscription['status'],
                'stripe_customer': True,
                'current_period_end': subscription['current_period_end'],
                'cancel_at_period_end': subscription['cancel_at_period_end'],
                'subscription_id': subscription['id']
            }), 200
        else:
            return jsonify({
                'tier': user.get('subscription_tier', 'free'),
                'status': 'inactive',
                'stripe_customer': True
            }), 200
            
    except Exception as e:
        print(f"Error getting subscription status: {str(e)}")
        return jsonify({'error': 'Failed to get subscription status'}), 500

@bp.route('/billing-portal', methods=['POST'])
@require_auth
def create_billing_portal_session(user_id):
    """Create a Stripe billing portal session for subscription management"""
    supabase = get_supabase_client()
    
    try:
        # Get user's Stripe customer ID
        user_response = supabase.table('users').select('stripe_customer_id').eq('id', user_id).single().execute()
        user = user_response.data
        
        if not user.get('stripe_customer_id'):
            return jsonify({'error': 'No billing history found'}), 404
        
        # Create billing portal session
        session = stripe.billing_portal.Session.create(
            customer=user['stripe_customer_id'],
            return_url=f"{Config.FRONTEND_URL}/subscription"
        )
        
        return jsonify({'portal_url': session.url}), 200
        
    except Exception as e:
        print(f"Error creating billing portal session: {str(e)}")
        return jsonify({'error': 'Failed to create billing portal session'}), 500

@bp.route('/update', methods=['POST'])
@require_auth
def update_subscription(user_id):
    """Update subscription to a different tier"""
    data = request.json
    new_tier = data.get('tier')
    
    if new_tier not in ['free', 'supported', 'academy']:
        return jsonify({'error': 'Invalid subscription tier'}), 400
    
    supabase = get_supabase_client()
    
    try:
        # Get user data
        user_response = supabase.table('users').select('*').eq('id', user_id).single().execute()
        user = user_response.data
        
        if not user.get('stripe_customer_id'):
            # If upgrading from free, create checkout session
            if new_tier != 'free':
                return create_checkout_session(user_id)
            else:
                return jsonify({'message': 'Already on free tier'}), 200
        
        # Get active subscription
        subscriptions = stripe.Subscription.list(
            customer=user['stripe_customer_id'],
            status='active',
            limit=1
        )
        
        if not subscriptions.data:
            # No active subscription, create new one if not free
            if new_tier != 'free':
                return create_checkout_session(user_id)
            else:
                return jsonify({'message': 'Already on free tier'}), 200
        
        subscription = subscriptions.data[0]
        
        # Handle downgrade to free
        if new_tier == 'free':
            # Cancel subscription at period end
            stripe.Subscription.modify(
                subscription.id,
                cancel_at_period_end=True
            )
            
            # Update database
            supabase.table('users').update({
                'subscription_cancel_at_period_end': True
            }).eq('id', user_id).execute()
            
            return jsonify({'message': 'Subscription will be cancelled at the end of the billing period'}), 200
        
        # Handle tier change
        new_price_id = SUBSCRIPTION_PRICES[new_tier]
        if not new_price_id:
            return jsonify({'error': f'Price not configured for {new_tier} tier'}), 500
        
        # Update subscription with new price
        stripe.Subscription.modify(
            subscription.id,
            items=[{
                'id': subscription['items']['data'][0]['id'],
                'price': new_price_id
            }],
            proration_behavior='create_prorations'  # Pro-rate the change
        )
        
        # Update database
        supabase.table('users').update({
            'subscription_tier': new_tier,
            'subscription_cancel_at_period_end': False
        }).eq('id', user_id).execute()
        
        # Log activity
        supabase.table('activity_log').insert({
            'user_id': user_id,
            'event_type': 'subscription_updated',
            'event_details': {'new_tier': new_tier, 'old_tier': user['subscription_tier']}
        }).execute()
        
        return jsonify({'message': f'Subscription updated to {new_tier} tier'}), 200
        
    except Exception as e:
        print(f"Error updating subscription: {str(e)}")
        return jsonify({'error': 'Failed to update subscription'}), 500

@bp.route('/cancel', methods=['POST'])
@require_auth
def cancel_subscription(user_id):
    """Cancel subscription at the end of the billing period"""
    supabase = get_supabase_client()
    
    try:
        # Get user data
        user_response = supabase.table('users').select('*').eq('id', user_id).single().execute()
        user = user_response.data
        
        if not user.get('stripe_customer_id'):
            return jsonify({'error': 'No active subscription'}), 400
        
        # Get active subscriptions
        subscriptions = stripe.Subscription.list(
            customer=user['stripe_customer_id'],
            status='active'
        )
        
        if not subscriptions.data:
            return jsonify({'error': 'No active subscription'}), 400
        
        # Cancel all active subscriptions at period end
        for subscription in subscriptions.data:
            stripe.Subscription.modify(
                subscription.id,
                cancel_at_period_end=True
            )
            
            # Update database
            supabase.table('users').update({
                'subscription_cancel_at_period_end': True
            }).eq('id', user_id).execute()
        
        # Log activity
        supabase.table('activity_log').insert({
            'user_id': user_id,
            'event_type': 'subscription_cancelled',
            'event_details': {'tier': user['subscription_tier']}
        }).execute()
        
        return jsonify({'message': 'Subscription will be cancelled at the end of the billing period'}), 200
        
    except Exception as e:
        print(f"Error cancelling subscription: {str(e)}")
        return jsonify({'error': 'Failed to cancel subscription'}), 500

@bp.route('/webhook', methods=['POST'])
def stripe_webhook():
    """Handle Stripe webhook events"""
    payload = request.get_data(as_text=True)
    sig_header = request.headers.get('Stripe-Signature')
    
    # Verify webhook signature
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, Config.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        print("Invalid webhook payload")
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError:
        print("Invalid webhook signature")
        return jsonify({'error': 'Invalid signature'}), 400
    
    supabase = get_supabase_client()
    
    # Handle different event types
    try:
        if event['type'] == 'checkout.session.completed':
            # Handle successful checkout
            session = event['data']['object']
            user_id = session['metadata'].get('user_id')
            tier = session['metadata'].get('tier')
            subscription_id = session.get('subscription')
            
            if user_id and tier:
                # Update user subscription
                supabase.table('users').update({
                    'subscription_tier': tier,
                    'stripe_subscription_id': subscription_id,
                    'subscription_status': 'active',
                    'subscription_cancel_at_period_end': False
                }).eq('id', user_id).execute()
                
                # Log activity
                supabase.table('activity_log').insert({
                    'user_id': user_id,
                    'event_type': 'subscription_started',
                    'event_details': {'tier': tier, 'subscription_id': subscription_id}
                }).execute()
                
                # Log to subscription history
                supabase.table('subscription_history').insert({
                    'user_id': user_id,
                    'stripe_subscription_id': subscription_id,
                    'tier': tier,
                    'status': 'active',
                    'stripe_event_id': event['id'],
                    'event_type': event['type']
                }).execute()
        
        elif event['type'] == 'customer.subscription.updated':
            # Handle subscription updates
            subscription = event['data']['object']
            customer_id = subscription['customer']
            
            # Get user by Stripe customer ID
            user_response = supabase.table('users').select('*').eq('stripe_customer_id', customer_id).single().execute()
            
            if user_response.data:
                user = user_response.data
                
                # Determine tier from price ID
                price_id = subscription['items']['data'][0]['price']['id']
                new_tier = 'free'
                for tier, configured_price_id in SUBSCRIPTION_PRICES.items():
                    if configured_price_id == price_id:
                        new_tier = tier
                        break
                
                # Update user subscription info
                supabase.table('users').update({
                    'subscription_tier': new_tier,
                    'stripe_subscription_id': subscription['id'],
                    'subscription_status': subscription['status'],
                    'subscription_current_period_end': datetime.fromtimestamp(subscription['current_period_end']).isoformat(),
                    'subscription_cancel_at_period_end': subscription['cancel_at_period_end']
                }).eq('id', user['id']).execute()
                
                # Log to subscription history
                supabase.table('subscription_history').insert({
                    'user_id': user['id'],
                    'stripe_subscription_id': subscription['id'],
                    'tier': new_tier,
                    'status': subscription['status'],
                    'stripe_event_id': event['id'],
                    'event_type': event['type']
                }).execute()
        
        elif event['type'] == 'customer.subscription.deleted':
            # Handle subscription cancellation
            subscription = event['data']['object']
            customer_id = subscription['customer']
            
            # Get user by Stripe customer ID
            user_response = supabase.table('users').select('*').eq('stripe_customer_id', customer_id).single().execute()
            
            if user_response.data:
                user = user_response.data
                
                # Downgrade to free tier
                supabase.table('users').update({
                    'subscription_tier': 'free',
                    'subscription_status': 'cancelled',
                    'stripe_subscription_id': None,
                    'subscription_cancel_at_period_end': False
                }).eq('id', user['id']).execute()
                
                # Log activity
                supabase.table('activity_log').insert({
                    'user_id': user['id'],
                    'event_type': 'subscription_ended',
                    'event_details': {'previous_tier': user['subscription_tier']}
                }).execute()
                
                # Update subscription history
                supabase.table('subscription_history').insert({
                    'user_id': user['id'],
                    'stripe_subscription_id': subscription['id'],
                    'tier': 'free',
                    'status': 'cancelled',
                    'ended_at': datetime.now().isoformat(),
                    'stripe_event_id': event['id'],
                    'event_type': event['type']
                }).execute()
        
        elif event['type'] == 'invoice.payment_failed':
            # Handle failed payment
            invoice = event['data']['object']
            customer_id = invoice['customer']
            
            # Get user by Stripe customer ID
            user_response = supabase.table('users').select('*').eq('stripe_customer_id', customer_id).single().execute()
            
            if user_response.data:
                user = user_response.data
                
                # Update subscription status
                supabase.table('users').update({
                    'subscription_status': 'past_due'
                }).eq('id', user['id']).execute()
                
                # Log activity
                supabase.table('activity_log').insert({
                    'user_id': user['id'],
                    'event_type': 'payment_failed',
                    'event_details': {'invoice_id': invoice['id']}
                }).execute()
        
        elif event['type'] == 'invoice.payment_succeeded':
            # Handle successful payment
            invoice = event['data']['object']
            customer_id = invoice['customer']
            
            # Get user by Stripe customer ID
            user_response = supabase.table('users').select('*').eq('stripe_customer_id', customer_id).single().execute()
            
            if user_response.data:
                user = user_response.data
                
                # Update subscription status if it was past due
                if user.get('subscription_status') == 'past_due':
                    supabase.table('users').update({
                        'subscription_status': 'active'
                    }).eq('id', user['id']).execute()
                
                # Log activity
                supabase.table('activity_log').insert({
                    'user_id': user['id'],
                    'event_type': 'payment_succeeded',
                    'event_details': {'invoice_id': invoice['id'], 'amount': invoice['amount_paid']}
                }).execute()
        
        return jsonify({'received': True}), 200
        
    except Exception as e:
        print(f"Error processing webhook: {str(e)}")
        # Return 200 to acknowledge receipt even if processing failed
        # This prevents Stripe from retrying
        return jsonify({'received': True, 'error': str(e)}), 200