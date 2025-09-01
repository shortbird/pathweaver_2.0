from flask import Blueprint, request, jsonify
import stripe
import os
from datetime import datetime
from database import get_supabase_client, get_supabase_admin_client
from utils.auth.decorators import require_auth
from config import Config

bp = Blueprint('subscriptions', __name__)

# Initialize Stripe with the API key
if Config.STRIPE_SECRET_KEY:
    stripe.api_key = Config.STRIPE_SECRET_KEY
else:
    print("WARNING: Stripe API key not configured")

# Get tier prices from config
SUBSCRIPTION_PRICES = Config.STRIPE_TIER_PRICES

@bp.route('/test-checkout-debug', methods=['POST'])
@require_auth
def test_checkout_debug(user_id):
    """Debug endpoint to test checkout flow step by step"""
    results = {
        'user_id': user_id,
        'steps': []
    }
    
    # Step 1: Get user data
    try:
        supabase = get_supabase_client()
        user_response = supabase.table('users').select('*').eq('id', user_id).execute()
        if not user_response.data or len(user_response.data) == 0:
            print(f"Debug - No user found for id: {user_id}")
            return jsonify({'error': 'User not found'}), 404
        user = user_response.data[0] if user_response.data else None
        results['steps'].append({
            'step': 'get_user_data',
            'status': 'success',
            'has_stripe_customer': bool(user.get('stripe_customer_id')),
            'stripe_customer_id': user.get('stripe_customer_id')
        })
    except Exception as e:
        results['steps'].append({
            'step': 'get_user_data',
            'status': 'error',
            'error': str(e)
        })
        return jsonify(results), 500
    
    # Step 2: Get email if no Stripe customer
    if not user.get('stripe_customer_id'):
        try:
            admin_supabase = get_supabase_admin_client()
            auth_user = admin_supabase.auth.admin.get_user_by_id(user_id)
            email = auth_user.user.email if auth_user and auth_user.user else None
            results['steps'].append({
                'step': 'get_email',
                'status': 'success',
                'email_found': bool(email)
            })
        except Exception as e:
            results['steps'].append({
                'step': 'get_email',
                'status': 'error',
                'error': str(e)
            })
            # Don't fail here, continue with no email
    
    # Step 3: Test Stripe connection
    try:
        import stripe
        stripe.api_key = Config.STRIPE_SECRET_KEY
        account = stripe.Account.retrieve()
        results['steps'].append({
            'step': 'stripe_connection',
            'status': 'success',
            'account_id': account.id
        })
    except Exception as e:
        results['steps'].append({
            'step': 'stripe_connection',
            'status': 'error',
            'error': str(e)
        })
    
    return jsonify(results), 200

@bp.route('/test-user/<user_id>', methods=['GET'])
def test_user_existence(user_id):
    """Test if user exists in both auth and public tables"""
    results = {
        'user_id': user_id,
        'auth_user': None,
        'public_user': None
    }
    
    try:
        # Check public.users table
        supabase = get_supabase_client()
        user_response = supabase.table('users').select('*').eq('id', user_id).execute()
        results['public_user'] = {
            'exists': bool(user_response.data and len(user_response.data) > 0),
            'data': user_response.data[0] if user_response.data else None
        }
    except Exception as e:
        results['public_user'] = {'error': str(e)}
    
    try:
        # Check auth.users table
        admin_supabase = get_supabase_admin_client()
        auth_user = admin_supabase.auth.admin.get_user_by_id(user_id)
        results['auth_user'] = {
            'exists': bool(auth_user and auth_user.user),
            'email': auth_user.user.email if auth_user and auth_user.user else None,
            'created_at': str(auth_user.user.created_at) if auth_user and auth_user.user else None
        }
    except Exception as e:
        if 'not found' in str(e).lower():
            results['auth_user'] = {'exists': False}
        else:
            results['auth_user'] = {'error': str(e)}
    
    # Diagnosis
    if results['auth_user'].get('exists') and not results['public_user'].get('exists'):
        results['diagnosis'] = 'User exists in auth but not in public.users table - profile setup incomplete'
    elif not results['auth_user'].get('exists') and results['public_user'].get('exists'):
        results['diagnosis'] = 'Data inconsistency - user in public table but not in auth'
    elif results['auth_user'].get('exists') and results['public_user'].get('exists'):
        results['diagnosis'] = 'User exists in both tables - should work fine'
    else:
        results['diagnosis'] = 'User does not exist in either table'
    
    return jsonify(results), 200

@bp.route('/test-supabase', methods=['GET'])
def test_supabase_admin():
    """Test Supabase admin access (temporary debug endpoint)"""
    results = {}
    
    try:
        # Test 1: Can we access users table with regular client?
        supabase = get_supabase_client()
        users_response = supabase.table('users').select('id').limit(1).execute()
        results['users_table_access'] = 'OK' if users_response.data is not None else 'FAILED'
    except Exception as e:
        results['users_table_access'] = f'ERROR: {str(e)}'
    
    try:
        # Test 2: Can we use admin auth with admin client?
        admin_supabase = get_supabase_admin_client()
        # Try to get a user (using a dummy ID that probably doesn't exist)
        test_user_id = '00000000-0000-0000-0000-000000000000'
        auth_response = admin_supabase.auth.admin.get_user_by_id(test_user_id)
        results['admin_auth_access'] = 'OK - admin auth works'
    except Exception as e:
        error_msg = str(e)
        if 'not found' in error_msg.lower():
            results['admin_auth_access'] = 'OK - admin auth works (user not found as expected)'
        else:
            results['admin_auth_access'] = f'ERROR: {error_msg}'
    
    # Test 3: Check service key configuration
    results['service_key_configured'] = bool(Config.SUPABASE_SERVICE_ROLE_KEY)
    results['service_key_prefix'] = Config.SUPABASE_SERVICE_ROLE_KEY[:20] + '...' if Config.SUPABASE_SERVICE_ROLE_KEY else None
    
    return jsonify(results), 200

@bp.route('/config', methods=['GET'])
def get_stripe_config():
    """Get Stripe configuration status (for debugging)"""
    config_status = {
        'stripe_configured': bool(Config.STRIPE_SECRET_KEY) and Config.STRIPE_SECRET_KEY not in ['sk_test_your-key', 'your-key'],
        'stripe_key_prefix': Config.STRIPE_SECRET_KEY[:7] if Config.STRIPE_SECRET_KEY else None,
        'price_ids_configured': {},
        'webhook_configured': bool(Config.STRIPE_WEBHOOK_SECRET) and Config.STRIPE_WEBHOOK_SECRET != 'whsec_your-webhook-secret'
    }
    
    # Check which price IDs are configured
    for tier, prices in SUBSCRIPTION_PRICES.items():
        if isinstance(prices, dict):
            config_status['price_ids_configured'][tier] = {
                'monthly': bool(prices.get('monthly')) and not prices.get('monthly', '').endswith('placeholder'),
                'yearly': bool(prices.get('yearly')) and not prices.get('yearly', '').endswith('placeholder')
            }
        else:
            config_status['price_ids_configured'][tier] = {
                'monthly': bool(prices) and not str(prices).endswith('placeholder'),
                'yearly': False
            }
    
    return jsonify(config_status), 200

@bp.route('/create-checkout', methods=['POST'])
@require_auth
def create_checkout_session(user_id):
    """Create a Stripe checkout session for subscription upgrade"""
    data = request.json
    tier = data.get('tier', 'supported')
    billing_period = data.get('billing_period', 'monthly')  # 'monthly' or 'yearly'
    
    # Validate Stripe configuration first
    if not Config.STRIPE_SECRET_KEY or Config.STRIPE_SECRET_KEY in ['sk_test_your-key', 'your-key']:
        print(f"ERROR: Stripe secret key not configured properly. Current value: {Config.STRIPE_SECRET_KEY}")
        return jsonify({
            'error': 'Stripe payments are not configured on the server. Please contact support.',
            'debug': 'STRIPE_SECRET_KEY not set or using placeholder value'
        }), 500
    
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
    
    # Debug logging
    print(f"Debug - Tier: {tier}, Billing: {billing_period}")
    print(f"Debug - Tier prices config: {tier_prices}")
    print(f"Debug - Selected price_id: {price_id}")
    print(f"Debug - All subscription prices: {SUBSCRIPTION_PRICES}")
    print(f"Debug - Stripe key present: {bool(Config.STRIPE_SECRET_KEY)}")
    print(f"Debug - Stripe key prefix: {Config.STRIPE_SECRET_KEY[:7] if Config.STRIPE_SECRET_KEY else 'None'}...")
    
    if not price_id:
        error_msg = f'Stripe price ID not configured for {tier} tier ({billing_period}). Please contact support.'
        print(f"Error: {error_msg}")
        print(f"Available prices: {SUBSCRIPTION_PRICES}")
        return jsonify({
            'error': error_msg,
            'debug': f'Missing environment variable: STRIPE_{tier.upper()}_{billing_period.upper()}_PRICE_ID'
        }), 500
    
    # Use regular client for user data, admin client for auth operations
    try:
        supabase = get_supabase_client()
    except Exception as e:
        print(f"Error getting regular Supabase client: {e}")
        return jsonify({
            'error': 'Database connection error',
            'debug': f'Failed to get Supabase client: {str(e)}'
        }), 500
    
    try:
        admin_supabase = get_supabase_admin_client()
    except Exception as e:
        print(f"Error getting admin Supabase client: {e}")
        print(f"SUPABASE_SERVICE_KEY configured: {bool(Config.SUPABASE_SERVICE_ROLE_KEY)}")
        return jsonify({
            'error': 'Database admin connection error',
            'debug': f'Failed to get admin Supabase client: {str(e)}'
        }), 500
    
    try:
        # Get user data
        print(f"Debug - Getting user data for user_id: {user_id}")
        user_response = supabase.table('users').select('*').eq('id', user_id).execute()
        print(f"Debug - User query raw response: data={user_response.data}, count={len(user_response.data) if user_response.data else 0}")
        
        if not user_response.data or len(user_response.data) == 0:
            print(f"Debug - No user found for id: {user_id}")
            print(f"Debug - This might be a new user who hasn't been added to users table yet")
            return jsonify({'error': 'User profile not found. Please complete your profile setup first.'}), 404
        user = user_response.data[0]
        print(f"Debug - User data retrieved: {user}")
        print(f"Debug - User data type: {type(user)}")
        print(f"Debug - User keys: {user.keys() if hasattr(user, 'keys') else 'Not a dict'}")
        
        # Create or retrieve Stripe customer
        if not user.get('stripe_customer_id'):
            # Use email from user data if available
            email = user.get('email')
            
            if not email:
                # Get email from auth.users table using admin client as fallback
                print(f"Debug - No email in user data, getting from auth.users for user_id: {user_id}")
                try:
                    auth_user_response = admin_supabase.auth.admin.get_user_by_id(user_id)
                    print(f"Debug - Auth user response type: {type(auth_user_response)}")
                    print(f"Debug - Auth user response: {auth_user_response}")
                    
                    # Handle different response structures
                    if hasattr(auth_user_response, 'user') and auth_user_response.user:
                        email = auth_user_response.user.email
                    elif hasattr(auth_user_response, 'email'):
                        email = auth_user_response.email
                    elif isinstance(auth_user_response, dict) and 'email' in auth_user_response:
                        email = auth_user_response['email']
                    elif isinstance(auth_user_response, dict) and 'user' in auth_user_response:
                        email = auth_user_response['user'].get('email')
                    else:
                        print(f"Debug - Unexpected auth response structure: {auth_user_response}")
                        email = None
                        
                    print(f"Debug - Email retrieved: {email}")
                except Exception as auth_error:
                    print(f"Debug - Error getting auth user: {auth_error}")
                    import traceback
                    print(f"Debug - Traceback: {traceback.format_exc()}")
                    email = None
            
            print(f"Debug - Creating Stripe customer with email: {email}")
            try:
                customer_name = f"{user.get('first_name', '')} {user.get('last_name', '')}".strip()
                if not customer_name:
                    customer_name = user.get('username', 'User')
                
                # Ensure Stripe is properly initialized
                if not stripe.api_key:
                    print("ERROR: Stripe API key is not set")
                    return jsonify({'error': 'Payment system not configured'}), 500
                
                customer = stripe.Customer.create(
                    email=email or user.get('email'),  # Use user email as fallback
                    metadata={'user_id': user_id},
                    name=customer_name or 'Customer'
                )
                print(f"Debug - Stripe customer created: {customer.id}")
            except AttributeError as ae:
                print(f"Debug - Stripe initialization error: {ae}")
                # Try re-initializing Stripe
                stripe.api_key = Config.STRIPE_SECRET_KEY
                try:
                    customer = stripe.Customer.create(
                        email=email or user.get('email'),
                        metadata={'user_id': user_id},
                        name=customer_name or 'Customer'
                    )
                    print(f"Debug - Stripe customer created after re-init: {customer.id}")
                except Exception as retry_error:
                    print(f"Debug - Retry failed: {retry_error}")
                    raise
            except Exception as stripe_error:
                print(f"Debug - Error creating Stripe customer: {stripe_error}")
                raise
            
            # Update user with Stripe customer ID
            try:
                update_result = supabase.table('users').update({
                    'stripe_customer_id': customer.id
                }).eq('id', user_id).execute()
                print(f"Debug - Update result: {update_result}")
            except Exception as update_error:
                print(f"Debug - Error updating user with Stripe customer ID: {update_error}")
                # Continue anyway - we have the customer ID
                pass
            
            stripe_customer_id = customer.id
        else:
            stripe_customer_id = user.get('stripe_customer_id')
        
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
                }
                # Removed proration_behavior - only valid for existing subscriptions
            },
            allow_promotion_codes=True  # Allow coupon codes
        )
        
        return jsonify({'checkout_url': checkout_session.url}), 200
        
    except Exception as e:
        import traceback
        print(f"Error creating checkout session: {str(e)}")
        print(f"Error type: {type(e).__name__}")
        print(f"Full traceback:\n{traceback.format_exc()}")
        
        # Provide more specific error messages based on the exception type
        if 'stripe' in str(e).lower():
            if 'invalid api key' in str(e).lower() or 'no such price' in str(e).lower():
                return jsonify({
                    'error': 'Stripe configuration error. Please ensure Stripe is configured properly.',
                    'debug': f'Stripe API error: {str(e)}'
                }), 500
            else:
                return jsonify({
                    'error': 'Payment processing error. Please try again.',
                    'debug': f'Stripe error: {str(e)}'
                }), 500
        else:
            return jsonify({
                'error': 'Failed to create checkout session. Please try again.',
                'debug': str(e)
            }), 500

@bp.route('/verify-session', methods=['POST'])
@require_auth
def verify_checkout_session(user_id):
    """Verify a checkout session and update user subscription status"""
    print(f"Verifying session for user: {user_id}")
    try:
        data = request.json
        session_id = data.get('session_id')
        print(f"Session ID: {session_id}")
        
        if not session_id:
            return jsonify({'error': 'Session ID is required'}), 400
        
        # Retrieve the session from Stripe
        try:
            session = stripe.checkout.Session.retrieve(session_id)
        except stripe.error.StripeError as e:
            print(f"Error retrieving session: {e}")
            return jsonify({'error': f'Failed to retrieve session: {str(e)}'}), 400
        
        if session.payment_status != 'paid':
            return jsonify({'error': 'Payment not completed'}), 400
        
        if not session.subscription:
            return jsonify({'error': 'No subscription found in session'}), 400
        
        # Get subscription details
        try:
            subscription = stripe.Subscription.retrieve(session.subscription)
            print(f"Subscription retrieved: {subscription.id}")
            print(f"Subscription metadata: {subscription.metadata}")
        except stripe.error.StripeError as e:
            print(f"Error retrieving subscription: {e}")
            return jsonify({'error': f'Failed to retrieve subscription: {str(e)}'}), 400
        
        # Extract tier from multiple sources
        tier = None
        
        # First try subscription metadata
        if subscription.metadata and 'tier' in subscription.metadata:
            tier = subscription.metadata.get('tier')
            print(f"Tier from subscription metadata: {tier}")
        
        # Then try session metadata
        if not tier and session.metadata and 'tier' in session.metadata:
            tier = session.metadata.get('tier')
            print(f"Tier from session metadata: {tier}")
        
        # Finally, map from price ID if no metadata
        if not tier:
            price_id = subscription.items.data[0].price.id if subscription.items.data else None
            print(f"Price ID: {price_id}")
            
            # Map price IDs to tiers
            price_to_tier = {
                'price_1S0Q8lGvmfT5TPrJCgvCew2Q': 'supported',  # Monthly supported
                'price_1S2QfmGvmfT5TPrJ57QkOpji': 'supported',  # Yearly supported
                'price_1S2QgAGvmfT5TPrJKZCHLh5C': 'academy',    # Monthly academy
                'price_1S0QDFGvmfT5TPrJnuzLSTFd': 'academy',    # Yearly academy
            }
            
            tier = price_to_tier.get(price_id, 'supported')
            print(f"Tier from price mapping: {tier}")
        
        # Update user subscription in database - only update tier for now
        supabase = get_supabase_client()
        try:
            # Start with just the tier which we know exists
            update_data = {
                'subscription_tier': tier
            }
            
            # Try to update subscription_status if column exists
            try:
                update_data['subscription_status'] = subscription.status
            except:
                pass
            
            result = supabase.table('users').update(update_data).eq('id', user_id).execute()
            print(f"User subscription tier updated to: {tier}")
        except Exception as update_error:
            print(f"Error updating user subscription: {update_error}")
            # Continue anyway - subscription was created successfully
        
        return jsonify({
            'success': True,
            'tier': tier,
            'status': subscription.status,
            'period_end': subscription.current_period_end
        }), 200
        
    except Exception as e:
        print(f"Error verifying session: {e}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': str(e)}), 500

@bp.route('/status', methods=['GET'])
@require_auth
def get_subscription_status(user_id):
    """Get current subscription status for a user"""
    supabase = get_supabase_client()
    
    try:
        # Get user data
        print(f"Debug - Getting subscription status for user_id: {user_id}")
        user_response = supabase.table('users').select('*').eq('id', user_id).execute()
        print(f"Debug - User query response: {user_response.data}")
        
        if not user_response.data or len(user_response.data) == 0:
            print(f"Debug - No user found for id: {user_id}, returning default free tier")
            # Return default free tier status if user not in database yet
            return jsonify({
                'tier': 'free',
                'status': 'inactive',
                'stripe_customer': False
            }), 200
        user = user_response.data[0]
        
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
            
            # Get price ID from subscription
            price_id = subscription['items']['data'][0]['price']['id'] if subscription['items']['data'] else None
            
            # Map price IDs to tiers (same mapping as verify-session)
            price_to_tier = {
                'price_1S0Q8lGvmfT5TPrJCgvCew2Q': 'supported',  # Monthly supported
                'price_1S2QfmGvmfT5TPrJ57QkOpji': 'supported',  # Yearly supported
                'price_1S2QgAGvmfT5TPrJKZCHLh5C': 'academy',    # Monthly academy
                'price_1S0QDFGvmfT5TPrJnuzLSTFd': 'academy',    # Yearly academy
            }
            
            # Get tier from price mapping or metadata
            current_tier = price_to_tier.get(price_id, 'free')
            
            # Also check subscription metadata as fallback
            if subscription.get('metadata') and subscription['metadata'].get('tier'):
                current_tier = subscription['metadata']['tier']
            
            # Update user's tier in database if different
            if user.get('subscription_tier') != current_tier:
                try:
                    supabase.table('users').update({
                        'subscription_tier': current_tier
                    }).eq('id', user_id).execute()
                    print(f"Updated user {user_id} tier to {current_tier}")
                except Exception as e:
                    print(f"Error updating user tier: {e}")
            
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
        user_response = supabase.table('users').select('stripe_customer_id').eq('id', user_id).execute()
        if not user_response.data or len(user_response.data) == 0:
            return jsonify({'error': 'User not found'}), 404
        user = user_response.data[0]
        
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
        user_response = supabase.table('users').select('*').eq('id', user_id).execute()
        if not user_response.data or len(user_response.data) == 0:
            print(f"Debug - No user found for id: {user_id}")
            return jsonify({'error': 'User not found'}), 404
        user = user_response.data[0] if user_response.data else None
        
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
        user_response = supabase.table('users').select('*').eq('id', user_id).execute()
        if not user_response.data or len(user_response.data) == 0:
            print(f"Debug - No user found for id: {user_id}")
            return jsonify({'error': 'User not found'}), 404
        user = user_response.data[0] if user_response.data else None
        
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
            user_response = supabase.table('users').select('*').eq('stripe_customer_id', customer_id).execute()
            
            if user_response.data and len(user_response.data) > 0:
                user = user_response.data[0]
                
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
            user_response = supabase.table('users').select('*').eq('stripe_customer_id', customer_id).execute()
            
            if user_response.data and len(user_response.data) > 0:
                user = user_response.data[0]
                
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
            user_response = supabase.table('users').select('*').eq('stripe_customer_id', customer_id).execute()
            
            if user_response.data and len(user_response.data) > 0:
                user = user_response.data[0]
                
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
            user_response = supabase.table('users').select('*').eq('stripe_customer_id', customer_id).execute()
            
            if user_response.data and len(user_response.data) > 0:
                user = user_response.data[0]
                
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