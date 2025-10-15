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


@bp.route('/config', methods=['GET'])
@require_auth
def get_stripe_config(user_id):
    """Get Stripe configuration status (admin only)"""
    # Check if user is admin
    supabase = get_supabase_client()
    try:
        user_response = supabase.table('users').select('role').eq('id', user_id).single().execute()
        if not user_response.data or user_response.data.get('role') != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
    except Exception as e:
        return jsonify({'error': 'Failed to verify admin status'}), 500
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

@bp.route('/refresh-subscription', methods=['POST'])
@require_auth
def refresh_subscription_status(user_id):
    """Force refresh subscription status from Stripe and update database"""
    supabase = get_supabase_client()

    try:
        # Get user's Stripe customer ID
        user_response = supabase.table('users').select('stripe_customer_id').eq('id', user_id).execute()
        if not user_response.data or len(user_response.data) == 0:
            return jsonify({'error': 'User not found'}), 404

        user = user_response.data[0]
        stripe_customer_id = user.get('stripe_customer_id')

        if not stripe_customer_id:
            # User has no Stripe customer - they're on Explore tier
            return jsonify({
                'tier': 'Explore',
                'status': 'inactive',
                'refreshed': True
            }), 200

        # Get latest subscription from Stripe
        subscriptions = stripe.Subscription.list(
            customer=stripe_customer_id,
            status='all',
            limit=1
        )

        if not subscriptions.data:
            # No subscriptions found - downgrade to Explore
            supabase.table('users').update({
                'subscription_tier': 'Explore',
                'subscription_status': 'inactive'
            }).eq('id', user_id).execute()

            return jsonify({
                'tier': 'Explore',
                'status': 'inactive',
                'refreshed': True
            }), 200

        subscription = subscriptions.data[0]

        # Determine tier from price ID
        price_id = subscription['items']['data'][0]['price']['id'] if subscription['items']['data'] else None

        # Map price IDs to tiers using dynamic config
        price_to_tier = {}
        for tier_name, tier_prices in SUBSCRIPTION_PRICES.items():
            if isinstance(tier_prices, dict):
                if tier_prices.get('monthly'):
                    price_to_tier[tier_prices['monthly']] = tier_name
                if tier_prices.get('yearly'):
                    price_to_tier[tier_prices['yearly']] = tier_name
            elif tier_prices:
                price_to_tier[tier_prices] = tier_name

        current_tier = price_to_tier.get(price_id, 'Explore')

        # Update database with latest info
        update_data = {
            'subscription_tier': current_tier,
            'subscription_status': subscription['status']
        }

        result = supabase.table('users').update(update_data).eq('id', user_id).execute()

        if not result.data:
            return jsonify({'error': 'Failed to update subscription status'}), 500

        return jsonify({
            'tier': current_tier,
            'status': subscription['status'],
            'current_period_end': subscription['current_period_end'],
            'cancel_at_period_end': subscription['cancel_at_period_end'],
            'refreshed': True
        }), 200

    except Exception as e:
        print(f"Error refreshing subscription status: {str(e)}")
        return jsonify({'error': 'Failed to refresh subscription status'}), 500

def update_subscription_tier(user_id, new_tier, billing_period='monthly'):
    """Helper function to update an existing subscription to a new tier/billing period"""
    supabase = get_supabase_client()

    try:
        # Get user data
        user_response = supabase.table('users').select('*').eq('id', user_id).execute()
        if not user_response.data:
            return jsonify({'error': 'User not found'}), 404
        user = user_response.data[0]

        if not user.get('stripe_customer_id'):
            return jsonify({'error': 'No Stripe customer found'}), 400

        # Get active subscription
        subscriptions = stripe.Subscription.list(
            customer=user['stripe_customer_id'],
            status='active',
            limit=1
        )

        if not subscriptions.data:
            return jsonify({'error': 'No active subscription found'}), 400

        subscription = subscriptions.data[0]

        # Handle downgrade to Explore
        if new_tier == 'Explore':
            stripe.Subscription.modify(
                subscription.id,
                cancel_at_period_end=True
            )
            supabase.table('users').update({
                'subscription_status': 'canceling'
            }).eq('id', user_id).execute()
            return jsonify({'message': 'Subscription will be cancelled at the end of the billing period'}), 200

        # Get the new price ID
        tier_prices = SUBSCRIPTION_PRICES.get(new_tier)
        if isinstance(tier_prices, dict):
            new_price_id = tier_prices.get(billing_period)
        else:
            new_price_id = tier_prices if billing_period == 'monthly' else None

        if not new_price_id:
            return jsonify({'error': f'Price not configured for {new_tier} tier ({billing_period})'}), 500

        print(f"Debug - Updating subscription to {new_tier} ({billing_period}) with price ID: {new_price_id}")

        # Update subscription with new price
        try:
            updated_subscription = stripe.Subscription.modify(
                subscription.id,
                items=[{
                    'id': subscription['items']['data'][0]['id'],
                    'price': new_price_id
                }],
                proration_behavior='create_prorations'
            )
            print(f"Debug - Stripe subscription updated successfully: {updated_subscription.id}")
        except Exception as stripe_error:
            print(f"Error updating Stripe subscription: {stripe_error}")
            return jsonify({'error': f'Failed to update subscription in Stripe: {str(stripe_error)}'}), 500

        # Update database
        try:
            result = supabase.table('users').update({
                'subscription_tier': new_tier,
                'subscription_status': 'active'
            }).eq('id', user_id).execute()
            print(f"Debug - Database updated for user {user_id} to tier {new_tier}")
        except Exception as db_error:
            print(f"Error updating database: {db_error}")
            return jsonify({'error': f'Failed to update user tier in database: {str(db_error)}'}), 500

        return jsonify({
            'success': True,
            'message': f'Subscription updated to {new_tier} tier',
            'tier': new_tier,
            'billing_period': billing_period
        }), 200

    except Exception as e:
        print(f"Error in update_subscription_tier: {str(e)}")
        import traceback
        print(f"Traceback: {traceback.format_exc()}")
        return jsonify({'error': f'Failed to update subscription: {str(e)}'}), 500


@bp.route('/create-checkout', methods=['POST'])
@require_auth
def create_checkout_session(user_id):
    """Create a Stripe checkout session for subscription upgrade"""
    data = request.json
    tier = data.get('tier', 'Accelerate')
    billing_period = data.get('billing_period', 'monthly')  # 'monthly' or 'yearly'

    # Validate Stripe configuration first
    if not Config.STRIPE_SECRET_KEY or Config.STRIPE_SECRET_KEY in ['sk_test_your-key', 'your-key']:
        print(f"ERROR: Stripe secret key not configured properly. Current value: {Config.STRIPE_SECRET_KEY}")
        return jsonify({
            'error': 'Stripe payments are not configured on the server. Please contact support.',
            'debug': 'STRIPE_SECRET_KEY not set or using placeholder value'
        }), 500

    # Validate tier
    if tier not in ['Accelerate', 'Achieve', 'Excel']:
        return jsonify({'error': 'Invalid subscription tier. Choose "Accelerate", "Achieve", or "Excel".'}), 400
    
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

        # Check if user has an existing active subscription
        if user.get('stripe_customer_id'):
            try:
                print(f"Debug - Checking for existing subscriptions for customer: {user['stripe_customer_id']}")
                existing_subs = stripe.Subscription.list(
                    customer=user['stripe_customer_id'],
                    status='active',
                    limit=1
                )
                if existing_subs.data:
                    # User has an active subscription - use the update endpoint instead
                    print(f"Debug - User has active subscription, redirecting to update flow")
                    # Instead of creating new checkout, modify existing subscription
                    return update_subscription_tier(user_id, tier, billing_period)
            except stripe.error.InvalidRequestError as stripe_check_error:
                # Customer doesn't exist in Stripe - clear invalid customer ID
                if 'No such customer' in str(stripe_check_error):
                    print(f"Warning: Invalid Stripe customer ID {user['stripe_customer_id']} for user {user_id}. Clearing from database.")
                    supabase.table('users').update({
                        'stripe_customer_id': None
                    }).eq('id', user_id).execute()
                    # Clear the customer ID so we create a new one below
                    user['stripe_customer_id'] = None
                else:
                    print(f"Debug - Error checking existing subscriptions: {stripe_check_error}")
                    # Continue with checkout creation if check fails
            except Exception as stripe_check_error:
                print(f"Debug - Error checking existing subscriptions: {stripe_check_error}")
                # Continue with checkout creation if check fails

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

            # Map price IDs to tiers using dynamic config
            price_to_tier = {}
            for tier_name, tier_prices in SUBSCRIPTION_PRICES.items():
                if isinstance(tier_prices, dict):
                    # New format with monthly/yearly
                    if tier_prices.get('monthly'):
                        price_to_tier[tier_prices['monthly']] = tier_name
                    if tier_prices.get('yearly'):
                        price_to_tier[tier_prices['yearly']] = tier_name
                elif tier_prices:
                    # Legacy format (single price)
                    price_to_tier[tier_prices] = tier_name

            tier = price_to_tier.get(price_id, 'Accelerate')
            print(f"Tier from price mapping: {tier}")
            print(f"Available price mappings: {price_to_tier}")
        
        # Update user subscription in database with improved error handling
        supabase = get_supabase_client()

        # Prepare update data
        update_data = {
            'subscription_tier': tier,
            'subscription_status': subscription.status
        }

        # Also update stripe_customer_id if missing
        if session.customer:
            update_data['stripe_customer_id'] = session.customer

        # Perform the database update
        try:
            result = supabase.table('users').update(update_data).eq('id', user_id).execute()

            # Check if update was successful
            if not result.data:
                print(f"WARNING: Database update returned no data for user {user_id}")
                return jsonify({'error': 'Failed to update user subscription in database'}), 500

            print(f"Successfully updated user {user_id} to tier: {tier}")

            # Force a fresh read to confirm the update took effect
            verification_read = supabase.table('users').select('subscription_tier, stripe_customer_id').eq('id', user_id).single().execute()

            if verification_read.data:
                actual_tier = verification_read.data.get('subscription_tier')
                if actual_tier != tier:
                    print(f"ERROR: Tier verification failed! Expected: {tier}, Actual: {actual_tier}")
                    return jsonify({'error': 'Database update verification failed'}), 500
                else:
                    print(f"Tier update verified successfully: {actual_tier}")

        except Exception as update_error:
            print(f"CRITICAL ERROR updating user subscription: {update_error}")
            import traceback
            print(f"Update error traceback: {traceback.format_exc()}")
            return jsonify({'error': f'Failed to update subscription: {str(update_error)}'}), 500
        
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
                'tier': 'Explore',
                'status': 'inactive',
                'stripe_customer': False
            }), 200
        user = user_response.data[0]
        
        # Basic response for users without Stripe customer
        if not user.get('stripe_customer_id'):
            return jsonify({
                'tier': user.get('subscription_tier', 'Explore'),
                'status': 'inactive',
                'stripe_customer': False
            }), 200
        
        # Get active subscriptions from Stripe
        try:
            subscriptions = stripe.Subscription.list(
                customer=user['stripe_customer_id'],
                status='all',
                limit=1
            )
        except stripe.error.InvalidRequestError as e:
            # Customer doesn't exist in Stripe - clear invalid customer ID
            if 'No such customer' in str(e):
                print(f"Warning: Invalid Stripe customer ID {user['stripe_customer_id']} for user {user_id}. Clearing from database.")
                supabase.table('users').update({
                    'stripe_customer_id': None,
                    'subscription_tier': 'Explore',
                    'subscription_status': 'inactive'
                }).eq('id', user_id).execute()

                return jsonify({
                    'tier': 'Explore',
                    'status': 'inactive',
                    'stripe_customer': False
                }), 200
            raise
        
        if subscriptions.data:
            subscription = subscriptions.data[0]
            
            # Get price ID from subscription
            price_id = subscription['items']['data'][0]['price']['id'] if subscription['items']['data'] else None
            
            # Map price IDs to tiers using dynamic config (same as verify-session)
            price_to_tier = {}
            for tier_name, tier_prices in SUBSCRIPTION_PRICES.items():
                if isinstance(tier_prices, dict):
                    # New format with monthly/yearly
                    if tier_prices.get('monthly'):
                        price_to_tier[tier_prices['monthly']] = tier_name
                    if tier_prices.get('yearly'):
                        price_to_tier[tier_prices['yearly']] = tier_name
                elif tier_prices:
                    # Legacy format (single price)
                    price_to_tier[tier_prices] = tier_name
            
            # Get tier from price mapping or metadata
            current_tier = price_to_tier.get(price_id, 'Explore')
            
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
                'tier': user.get('subscription_tier', 'Explore'),
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
    
    if new_tier not in ['Explore', 'Accelerate', 'Achieve', 'Excel']:
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
            if new_tier != 'Explore':
                return create_checkout_session(user_id)
            else:
                return jsonify({'message': 'Already on Explore tier'}), 200
        
        # Get active subscription
        subscriptions = stripe.Subscription.list(
            customer=user['stripe_customer_id'],
            status='active',
            limit=1
        )
        
        if not subscriptions.data:
            # No active subscription, create new one if not free
            if new_tier != 'Explore':
                return create_checkout_session(user_id)
            else:
                return jsonify({'message': 'Already on Explore tier'}), 200
        
        subscription = subscriptions.data[0]
        
        # Handle downgrade to Explore
        if new_tier == 'Explore':
            # Cancel subscription at period end
            stripe.Subscription.modify(
                subscription.id,
                cancel_at_period_end=True
            )
            
            # Update database using existing columns
            supabase.table('users').update({
                'subscription_status': 'canceling'
            }).eq('id', user_id).execute()
            
            return jsonify({'message': 'Subscription will be cancelled at the end of the billing period'}), 200
        
        # Handle tier change - get the correct price ID format
        tier_prices = SUBSCRIPTION_PRICES.get(new_tier)
        if isinstance(tier_prices, dict):
            # Use monthly price for downgrades by default
            new_price_id = tier_prices.get('monthly')
        else:
            new_price_id = tier_prices

        if not new_price_id:
            return jsonify({'error': f'Price not configured for {new_tier} tier'}), 500

        print(f"Debug - Changing subscription to tier {new_tier} with price ID: {new_price_id}")
        
        # Update subscription with new price
        try:
            updated_subscription = stripe.Subscription.modify(
                subscription.id,
                items=[{
                    'id': subscription['items']['data'][0]['id'],
                    'price': new_price_id
                }],
                proration_behavior='create_prorations'  # Pro-rate the change
            )
            print(f"Debug - Stripe subscription updated successfully: {updated_subscription.id}")
        except Exception as stripe_error:
            print(f"Error updating Stripe subscription: {stripe_error}")
            return jsonify({'error': f'Failed to update subscription in Stripe: {str(stripe_error)}'}), 500

        # Update database
        try:
            result = supabase.table('users').update({
                'subscription_tier': new_tier,
                'subscription_status': 'active'  # Reset status to active when changing tiers
            }).eq('id', user_id).execute()

            if not result.data:
                print(f"Warning: Database update returned no data for user {user_id}")

            print(f"Debug - Database updated for user {user_id} to tier {new_tier}")
        except Exception as db_error:
            print(f"Error updating database: {db_error}")
            return jsonify({'error': f'Failed to update user tier in database: {str(db_error)}'}), 500
        
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
            try:
                updated_subscription = stripe.Subscription.modify(
                    subscription.id,
                    cancel_at_period_end=True
                )
                print(f"Debug - Stripe subscription {subscription.id} marked for cancellation at period end")
            except Exception as stripe_error:
                print(f"Error cancelling Stripe subscription {subscription.id}: {stripe_error}")
                return jsonify({'error': f'Failed to cancel subscription in Stripe: {str(stripe_error)}'}), 500

        # Update database to reflect cancellation status using existing columns
        try:
            # Get the subscription end date from Stripe for the database
            subscription_end_date = None
            if subscriptions.data:
                # Convert timestamp to ISO format for database
                end_timestamp = subscriptions.data[0]['current_period_end']
                from datetime import datetime
                subscription_end_date = datetime.fromtimestamp(end_timestamp).isoformat()

            result = supabase.table('users').update({
                'subscription_status': 'canceling',  # Use existing subscription_status column
                'subscription_end_date': subscription_end_date  # Set when subscription will end
            }).eq('id', user_id).execute()

            if not result.data:
                print(f"Warning: Database update for cancellation returned no data for user {user_id}")

            print(f"Debug - Database updated for user {user_id} - subscription marked for cancellation (status: canceling, ends: {subscription_end_date})")
        except Exception as db_error:
            print(f"Error updating database for cancellation: {db_error}")
            return jsonify({'error': f'Failed to update cancellation status: {str(db_error)}'}), 500
        
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
                # Update user subscription - only update fields that exist
                update_data = {'subscription_tier': tier}
                try:
                    result = supabase.table('users').update(update_data).eq('id', user_id).execute()
                    print(f"Webhook: Updated user {user_id} to tier {tier}")
                except Exception as e:
                    print(f"Webhook: Error updating user subscription: {e}")
                
                # Log activity
                supabase.table('activity_log').insert({
                    'user_id': user_id,
                    'event_type': 'subscription_started',
                    'event_details': {'tier': tier, 'subscription_id': subscription_id}
                }).execute()
                
                # Log to subscription history if table exists
                try:
                    supabase.table('subscription_history').insert({
                        'user_id': user_id,
                        'stripe_subscription_id': subscription_id,
                        'tier': tier,
                        'status': 'active',
                        'stripe_event_id': event['id'],
                        'event_type': event['type']
                    }).execute()
                except:
                    pass  # Table might not exist
        
        elif event['type'] == 'customer.subscription.updated':
            # Handle subscription updates
            subscription = event['data']['object']
            customer_id = subscription['customer']
            
            # Get user by Stripe customer ID - note: field might be stripe_customer_id
            user_response = supabase.table('users').select('*').eq('stripe_customer_id', customer_id).execute()
            
            if user_response.data and len(user_response.data) > 0:
                user = user_response.data[0]
                
                # Determine tier from price ID using dynamic mapping
                price_id = subscription['items']['data'][0]['price']['id']

                # Build price to tier mapping
                price_to_tier = {}
                for tier_name, tier_prices in SUBSCRIPTION_PRICES.items():
                    if isinstance(tier_prices, dict):
                        # New format with monthly/yearly
                        if tier_prices.get('monthly'):
                            price_to_tier[tier_prices['monthly']] = tier_name
                        if tier_prices.get('yearly'):
                            price_to_tier[tier_prices['yearly']] = tier_name
                    elif tier_prices:
                        # Legacy format (single price)
                        price_to_tier[tier_prices] = tier_name

                new_tier = price_to_tier.get(price_id, 'Explore')
                print(f"Webhook: Price ID {price_id} mapped to tier {new_tier}")
                
                # Update user subscription info - only update fields that exist
                update_data = {'subscription_tier': new_tier}
                try:
                    supabase.table('users').update(update_data).eq('id', user['id']).execute()
                    print(f"Webhook: Updated user {user['id']} to tier {new_tier} via subscription update")
                except Exception as e:
                    print(f"Webhook: Error updating user subscription: {e}")
                
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
            
            # Get user by Stripe customer ID - note: field might be stripe_customer_id
            user_response = supabase.table('users').select('*').eq('stripe_customer_id', customer_id).execute()
            
            if user_response.data and len(user_response.data) > 0:
                user = user_response.data[0]
                
                # Downgrade to Explore tier
                try:
                    supabase.table('users').update({
                        'subscription_tier': 'Explore'
                    }).eq('id', user['id']).execute()
                    print(f"Webhook: Downgraded user {user['id']} to Explore tier")
                except Exception as e:
                    print(f"Webhook: Error downgrading user: {e}")
                
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
                    'tier': 'Explore',
                    'status': 'cancelled',
                    'ended_at': datetime.now().isoformat(),
                    'stripe_event_id': event['id'],
                    'event_type': event['type']
                }).execute()
        
        elif event['type'] == 'invoice.payment_failed':
            # Handle failed payment
            invoice = event['data']['object']
            customer_id = invoice['customer']
            
            # Get user by Stripe customer ID - note: field might be stripe_customer_id
            user_response = supabase.table('users').select('*').eq('stripe_customer_id', customer_id).execute()
            
            if user_response.data and len(user_response.data) > 0:
                user = user_response.data[0]
                
                # Log payment failure (subscription_status field may not exist)
                print(f"Webhook: Payment failed for user {user['id']}")
                
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
            
            # Get user by Stripe customer ID - note: field might be stripe_customer_id
            user_response = supabase.table('users').select('*').eq('stripe_customer_id', customer_id).execute()
            
            if user_response.data and len(user_response.data) > 0:
                user = user_response.data[0]
                
                # Log payment success
                print(f"Webhook: Payment succeeded for user {user['id']}")
                
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