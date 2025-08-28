from flask import Blueprint, request, jsonify
import stripe
import os
from database import get_supabase_client
from utils.auth.decorators import require_auth
from config import Config

bp = Blueprint('subscriptions', __name__)
stripe.api_key = Config.STRIPE_SECRET_KEY

# Load Stripe price IDs from environment variables
# These should be set in your .env file with actual Stripe price IDs
SUBSCRIPTION_PRICES = {
    'free': None,  # Free tier - default for all new users
    'explorer': None,  # Legacy free tier name (for backwards compatibility)
    'creator': os.getenv('STRIPE_CREATOR_PRICE_ID'),  # Set in .env
    'visionary': os.getenv('STRIPE_VISIONARY_PRICE_ID')  # Set in .env
}

@bp.route('/create-checkout', methods=['POST'])
@require_auth
def create_checkout_session(user_id):
    data = request.json
    tier = data.get('tier', 'creator')
    
    if tier not in ['creator', 'visionary']:
        return jsonify({'error': 'Invalid subscription tier'}), 400
    
    # Validate that we have a price ID configured for this tier
    if not SUBSCRIPTION_PRICES.get(tier):
        return jsonify({
            'error': f'Stripe price ID not configured for {tier} tier. Please contact support.'
        }), 500
    
    supabase = get_supabase_client()
    
    try:
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()
        
        if not user.data.get('stripe_customer_id'):
            customer = stripe.Customer.create(
                email=user.data.get('email'),
                metadata={'user_id': user_id}
            )
            
            supabase.table('users').update({
                'stripe_customer_id': customer.id
            }).eq('id', user_id).execute()
            
            stripe_customer_id = customer.id
        else:
            stripe_customer_id = user.data['stripe_customer_id']
        
        checkout_session = stripe.checkout.Session.create(
            customer=stripe_customer_id,
            payment_method_types=['card'],
            line_items=[{
                'price': SUBSCRIPTION_PRICES[tier],
                'quantity': 1
            }],
            mode='subscription',
            success_url=f"{Config.FRONTEND_URL}/subscription/success?session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{Config.FRONTEND_URL}/subscription/cancel",
            metadata={'user_id': user_id, 'tier': tier}
        )
        
        return jsonify({'checkout_url': checkout_session.url}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/cancel', methods=['POST'])
@require_auth
def cancel_subscription(user_id):
    supabase = get_supabase_client()
    
    try:
        user = supabase.table('users').select('*').eq('id', user_id).single().execute()
        
        if not user.data.get('stripe_customer_id'):
            return jsonify({'error': 'No active subscription'}), 400
        
        subscriptions = stripe.Subscription.list(
            customer=user.data['stripe_customer_id'],
            status='active'
        )
        
        for subscription in subscriptions.data:
            stripe.Subscription.modify(
                subscription.id,
                cancel_at_period_end=True
            )
        
        supabase.table('activity_log').insert({
            'user_id': user_id,
            'event_type': 'subscription_cancelled',
            'event_details': {'tier': user.data['subscription_tier']}
        }).execute()
        
        return jsonify({'message': 'Subscription will be cancelled at the end of the billing period'}), 200
        
    except Exception as e:
        return jsonify({'error': str(e)}), 400

@bp.route('/webhook', methods=['POST'])
def stripe_webhook():
    payload = request.get_data(as_text=True)
    sig_header = request.headers.get('Stripe-Signature')
    
    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, Config.STRIPE_WEBHOOK_SECRET
        )
    except ValueError:
        return jsonify({'error': 'Invalid payload'}), 400
    except stripe.error.SignatureVerificationError:
        return jsonify({'error': 'Invalid signature'}), 400
    
    supabase = get_supabase_client()
    
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        user_id = session['metadata']['user_id']
        tier = session['metadata']['tier']
        
        supabase.table('users').update({
            'subscription_tier': tier
        }).eq('id', user_id).execute()
        
        supabase.table('activity_log').insert({
            'user_id': user_id,
            'event_type': 'subscription_started',
            'event_details': {'tier': tier}
        }).execute()
    
    elif event['type'] == 'customer.subscription.deleted':
        subscription = event['data']['object']
        customer_id = subscription['customer']
        
        user = supabase.table('users').select('*').eq('stripe_customer_id', customer_id).single().execute()
        
        if user.data:
            supabase.table('users').update({
                'subscription_tier': 'explorer'
            }).eq('id', user.data['id']).execute()
    
    return jsonify({'received': True}), 200