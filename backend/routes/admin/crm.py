"""
REPOSITORY MIGRATION: NO MIGRATION NEEDED
- Already uses CRMRepository, CRMService, EmailTemplateService (lines 14-17)
- Uses CampaignAutomationService for automation workflows
- Exemplar of proper architecture: Route -> Service -> Repository
- Lazy initialization pattern for service instances (lines 25-30)
- Service layer essential for complex CRM campaign logic

CRM Admin Routes - Email campaign management API

Provides endpoints for:
- Campaign CRUD operations
- User segmentation and preview
- Email template management
- Automation sequences
- Campaign analytics
"""

from flask import Blueprint, request, jsonify
from utils.auth.decorators import require_admin
from repositories.crm_repository import CRMRepository
from services.crm_service import CRMService
from services.email_template_service import EmailTemplateService
from services.campaign_automation_service import CampaignAutomationService
import logging

logger = logging.getLogger(__name__)

crm_bp = Blueprint('crm', __name__, url_prefix='/api/admin/crm')

# Lazy initialization - services will be created on first use within app context
def get_crm_repo():
    """Get CRM repository instance (lazy initialization)"""
    return CRMRepository()

def get_crm_service():
    """Get CRM service instance (lazy initialization)"""
    return CRMService()

def get_template_service():
    """Get template service instance (lazy initialization)"""
    return EmailTemplateService()

def get_automation_service():
    """Get automation service instance (lazy initialization)"""
    return CampaignAutomationService()


# ==================== CAMPAIGNS ====================

@crm_bp.route('/campaigns', methods=['GET'])
@require_admin
def get_campaigns(user_id):
    """
    Get all campaigns with optional filtering.

    Query params:
    - status: Filter by status (draft/scheduled/sent/active/paused)
    - campaign_type: Filter by type (manual/scheduled/triggered)
    - limit: Max results (default 100)
    - offset: Pagination offset (default 0)
    """
    try:
        status = request.args.get('status')
        campaign_type = request.args.get('campaign_type')
        limit = int(request.args.get('limit', 100))
        offset = int(request.args.get('offset', 0))

        campaigns = get_crm_repo().get_campaigns(
            status=status,
            campaign_type=campaign_type,
            limit=limit,
            offset=offset
        )

        return jsonify({
            'campaigns': campaigns,
            'count': len(campaigns)
        }), 200

    except Exception as e:
        logger.error(f"Error getting campaigns: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/campaigns/<campaign_id>', methods=['GET'])
@require_admin
def get_campaign(user_id, campaign_id):
    """Get campaign by ID"""
    try:
        campaign = get_crm_repo().get_campaign_by_id(campaign_id)

        if not campaign:
            return jsonify({'error': 'Campaign not found'}), 404

        return jsonify({'campaign': campaign}), 200

    except Exception as e:
        logger.error(f"Error getting campaign {campaign_id}: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/campaigns', methods=['POST'])
@require_admin
def create_campaign(user_id):
    """
    Create new campaign.

    Request body:
    {
        "name": "Campaign name",
        "template_key": "welcome",
        "subject": "Email subject",
        "campaign_type": "manual|scheduled|triggered",
        "recipient_segment": {"role": "student", ...},
        "scheduled_for": "2025-01-15T10:00:00Z" (optional),
        "trigger_event": "registration_success" (for triggered),
        "trigger_config": {"min_quest_count": 0} (optional)
    }
    """
    try:
        data = request.get_json()

        # Validate required fields
        required = ['name', 'template_key', 'subject', 'campaign_type']
        if not all(field in data for field in required):
            return jsonify({'error': f'Missing required fields: {required}'}), 400

        # Get current user from JWT
        from flask import g
        created_by = g.get('current_user_id')

        campaign_data = {
            'name': data['name'],
            'template_key': data['template_key'],
            'subject': data['subject'],
            'campaign_type': data['campaign_type'],
            'status': data.get('status', 'draft'),  # Default to draft
            'recipient_segment': data.get('recipient_segment', {}),
            'scheduled_for': data.get('scheduled_for'),
            'trigger_event': data.get('trigger_event'),
            'trigger_config': data.get('trigger_config'),
            'created_by': created_by
        }

        campaign = get_crm_repo().create_campaign(campaign_data)

        return jsonify({
            'message': 'Campaign created successfully',
            'campaign': campaign
        }), 201

    except Exception as e:
        logger.error(f"Error creating campaign: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/campaigns/<campaign_id>', methods=['PUT'])
@require_admin
def update_campaign(user_id, campaign_id):
    """Update campaign by ID"""
    try:
        data = request.get_json()

        campaign = get_crm_repo().update_campaign(campaign_id, data)

        return jsonify({
            'message': 'Campaign updated successfully',
            'campaign': campaign
        }), 200

    except Exception as e:
        logger.error(f"Error updating campaign {campaign_id}: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/campaigns/<campaign_id>', methods=['DELETE'])
@require_admin
def delete_campaign(user_id, campaign_id):
    """Delete campaign by ID"""
    try:
        get_crm_repo().delete_campaign(campaign_id)

        return jsonify({'message': 'Campaign deleted successfully'}), 200

    except Exception as e:
        logger.error(f"Error deleting campaign {campaign_id}: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/campaigns/<campaign_id>/send', methods=['POST'])
@require_admin
def send_campaign(user_id, campaign_id):
    """
    Send campaign immediately.

    Query params:
    - dry_run: If 'true', validate but don't send (default false)
    """
    try:
        dry_run = request.args.get('dry_run', 'false').lower() == 'true'

        results = get_crm_service().send_campaign(
            campaign_id=campaign_id,
            dry_run=dry_run
        )

        return jsonify({
            'message': 'Campaign sent successfully' if not dry_run else 'Dry run complete',
            'results': results
        }), 200

    except Exception as e:
        logger.error(f"Error sending campaign {campaign_id}: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/campaigns/<campaign_id>/preview', methods=['POST'])
@require_admin
def preview_campaign(user_id, campaign_id):
    """Preview campaign recipients without sending"""
    try:
        preview = get_crm_service().preview_campaign_recipients(campaign_id=campaign_id)

        return jsonify({
            'preview': preview
        }), 200

    except Exception as e:
        logger.error(f"Error previewing campaign {campaign_id}: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/campaigns/<campaign_id>/history', methods=['GET'])
@require_admin
def get_campaign_history(user_id, campaign_id):
    """Get send history for a campaign"""
    try:
        limit = int(request.args.get('limit', 100))

        sends = get_crm_repo().get_campaign_sends(campaign_id=campaign_id, limit=limit)
        stats = get_crm_repo().get_campaign_stats(campaign_id)

        return jsonify({
            'sends': sends,
            'stats': stats
        }), 200

    except Exception as e:
        logger.error(f"Error getting campaign history: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== SEGMENTS ====================

@crm_bp.route('/segments', methods=['GET'])
@require_admin
def get_segments(user_id):
    """Get all saved segments"""
    try:
        from flask import g
        created_by = request.args.get('created_by') or g.get('current_user_id')

        segments = get_crm_repo().get_segments(created_by=created_by)

        return jsonify({
            'segments': segments,
            'count': len(segments)
        }), 200

    except Exception as e:
        logger.error(f"Error getting segments: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/segments', methods=['POST'])
@require_admin
def create_segment(user_id):
    """
    Create new saved segment.

    Request body:
    {
        "name": "Segment name",
        "description": "Optional description",
        "filter_rules": {"role": "student", "last_active_days": 30, ...}
    }
    """
    try:
        data = request.get_json()

        if not data.get('name') or not data.get('filter_rules'):
            return jsonify({'error': 'Missing required fields: name, filter_rules'}), 400

        from flask import g
        created_by = g.get('current_user_id')

        segment_data = {
            'name': data['name'],
            'description': data.get('description', ''),
            'filter_rules': data['filter_rules'],
            'created_by': created_by
        }

        segment = get_crm_repo().create_segment(segment_data)

        return jsonify({
            'message': 'Segment created successfully',
            'segment': segment
        }), 201

    except Exception as e:
        logger.error(f"Error creating segment: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/segments/<segment_id>', methods=['PUT'])
@require_admin
def update_segment(user_id, segment_id):
    """Update segment by ID"""
    try:
        data = request.get_json()

        segment = get_crm_repo().update_segment(segment_id, data)

        return jsonify({
            'message': 'Segment updated successfully',
            'segment': segment
        }), 200

    except Exception as e:
        logger.error(f"Error updating segment: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/segments/<segment_id>', methods=['DELETE'])
@require_admin
def delete_segment(user_id, segment_id):
    """Delete segment by ID"""
    try:
        get_crm_repo().delete_segment(segment_id)

        return jsonify({'message': 'Segment deleted successfully'}), 200

    except Exception as e:
        logger.error(f"Error deleting segment: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/segments/preview', methods=['POST'])
@require_admin
def preview_segment(user_id):
    """
    Preview users matching segment rules.

    Request body:
    {
        "filter_rules": {"role": "student", ...}
    }
    """
    try:
        data = request.get_json()
        filter_rules = data.get('filter_rules', {})

        users = get_crm_service().segment_users(filter_rules)

        return jsonify({
            'total_users': len(users),
            'sample_users': users[:10],  # First 10 for preview
            'filter_rules': filter_rules
        }), 200

    except Exception as e:
        logger.error(f"Error previewing segment: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== TEMPLATES ====================

@crm_bp.route('/templates', methods=['GET'])
@require_admin
def get_templates(user_id):
    """
    Get all templates (system + custom).

    Query params:
    - include_yaml: Include templates from YAML (default true)
    - is_system: Filter by system/custom (optional)
    """
    try:
        include_yaml = request.args.get('include_yaml', 'true').lower() == 'true'
        is_system_param = request.args.get('is_system')

        if is_system_param is not None:
            is_system = is_system_param.lower() == 'true'
            templates = get_crm_repo().get_templates(is_system=is_system)
        else:
            templates = get_template_service().list_templates(include_yaml=include_yaml)

        return jsonify({
            'templates': templates,
            'count': len(templates)
        }), 200

    except Exception as e:
        logger.error(f"Error getting templates: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/templates/<template_key>', methods=['GET'])
@require_admin
def get_template(user_id, template_key):
    """Get template by key"""
    try:
        template = get_template_service().get_template(template_key)

        if not template:
            return jsonify({'error': 'Template not found'}), 404

        return jsonify({'template': template}), 200

    except Exception as e:
        logger.error(f"Error getting template: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/templates', methods=['POST'])
@require_admin
def create_template(user_id):
    """
    Create custom template.

    Request body:
    {
        "template_key": "custom_welcome",
        "name": "Custom Welcome",
        "subject": "Welcome!",
        "description": "Optional",
        "template_data": {YAML structure}
    }
    """
    try:
        data = request.get_json()

        required = ['template_key', 'name', 'subject', 'template_data']
        if not all(field in data for field in required):
            return jsonify({'error': f'Missing required fields: {required}'}), 400

        from flask import g
        created_by = g.get('current_user_id')

        template = get_template_service().create_template(
            template_key=data['template_key'],
            name=data['name'],
            subject=data['subject'],
            template_data=data['template_data'],
            description=data.get('description'),
            created_by=created_by
        )

        return jsonify({
            'message': 'Template created successfully',
            'template': template
        }), 201

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error creating template: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/templates/<template_key>', methods=['PUT'])
@require_admin
def update_template(user_id, template_key):
    """
    Update template or create override for YAML templates.

    Now supports editing system templates by creating database overrides.
    """
    try:
        data = request.get_json()

        from flask import g
        created_by = g.get('current_user_id')

        template = get_template_service().update_template(
            template_key,
            data,
            created_by=created_by
        )

        return jsonify({
            'message': 'Template updated successfully',
            'template': template
        }), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error updating template: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/templates/<template_key>/revert', methods=['POST'])
@require_admin
def revert_template(user_id, template_key):
    """
    Revert template to YAML default by deleting override.

    Only works for templates that have a YAML default.
    """
    try:
        get_template_service().revert_to_default(template_key)

        return jsonify({
            'message': f"Template '{template_key}' reverted to default successfully"
        }), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error reverting template: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/templates/<template_key>', methods=['DELETE'])
@require_admin
def delete_template(user_id, template_key):
    """Delete custom template (cannot delete system templates)"""
    try:
        get_template_service().delete_template(template_key)

        return jsonify({'message': 'Template deleted successfully'}), 200

    except ValueError as e:
        return jsonify({'error': str(e)}), 400
    except Exception as e:
        logger.error(f"Error deleting template: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/templates/<template_key>/preview', methods=['POST'])
@require_admin
def preview_template(user_id, template_key):
    """
    Render template preview with sample data.

    Request body (optional):
    {
        "sample_data": {"user_name": "John Doe", ...},
        "subject": "Custom subject",  // Optional override
        "template_data": {...}  // Optional template_data override
    }
    """
    try:
        data = request.get_json() or {}

        # Define comprehensive default sample data to match _prepare_user_variables() + custom templates
        default_sample_data = {
            # Student variables
            'user_name': 'Jane Student',
            'first_name': 'Jane',
            'last_name': 'Student',
            'email': 'jane.student@example.com',
            'total_xp': 1250,
            'level': 5,
            'streak_days': 7,
            # Quest variables
            'quest_title': 'Introduction to Python',
            'xp_earned': 500,
            # Auth variables
            'confirmation_link': 'https://www.optioeducation.com/confirm/abc123',
            'reset_link': 'https://www.optioeducation.com/reset/abc123',
            'expiry_hours': 24,
            # URL variables
            'dashboard_url': 'https://www.optioeducation.com/dashboard',
            'quests_url': 'https://www.optioeducation.com/quests',
            'profile_url': 'https://www.optioeducation.com/profile',
            'tutor_url': 'https://www.optioeducation.com/tutor',
            'connections_url': 'https://www.optioeducation.com/connections',
            # Parent/promo variables (for promo_welcome and parent emails)
            'parent_name': 'Sarah Johnson',
            'teen_age_text': ' (age 15)',
            'activity_text': " We're excited to hear about your interest in homeschooling.",
            'current_curriculum': 'Time4Learning',
            'phone': '(555) 123-4567',
            'goals': 'Prepare for college while maintaining flexibility',
            'child_name': 'Alex Johnson'
        }

        # Merge user-provided sample_data with defaults (user data takes priority)
        sample_data = {**default_sample_data, **data.get('sample_data', {})}
        subject_override = data.get('subject')
        template_data_override = data.get('template_data')

        logger.info(f"📧 Template preview request for '{template_key}'")
        logger.info(f"📊 Sample data received: {sample_data}")
        logger.info(f"📝 Has template_data override: {bool(template_data_override)}")

        # Get CRM service for rendering
        crm_service = get_crm_service()

        # If template_data override provided, render directly
        if template_data_override:
            # Create temporary template structure
            temp_template = {
                'key': template_key,
                'subject': subject_override or 'Preview',
                'data': template_data_override
            }

            # Render with CRM service
            rendered = crm_service._render_email(
                template=temp_template,
                subject_override=subject_override,
                variables=sample_data
            )

            return jsonify({
                'html': rendered['html_body'],
                'subject': rendered['subject'],
                'text_body': rendered.get('text_body')
            }), 200
        else:
            # Use existing template - render full HTML just like sent emails
            template = get_template_service().get_template(template_key)
            if not template:
                return jsonify({'error': 'Template not found'}), 404

            # Render with CRM service for consistent output
            rendered = crm_service._render_email(
                template=template,
                subject_override=subject_override,
                variables=sample_data
            )

            return jsonify({
                'html': rendered['html_body'],
                'subject': rendered['subject'],
                'text_body': rendered.get('text_body')
            }), 200

    except Exception as e:
        logger.error(f"Error previewing template: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/templates/sync', methods=['POST'])
@require_admin
def sync_templates(user_id):
    """
    Sync templates from email_copy.yaml to database.

    Request body (optional):
    {
        "template_keys": ["welcome", "quest_completion"]  // Sync specific templates
    }
    """
    try:
        data = request.get_json() or {}
        template_keys = data.get('template_keys')

        results = get_template_service().sync_yaml_to_database(template_keys)

        return jsonify({
            'message': 'Template sync complete',
            'results': results
        }), 200

    except Exception as e:
        logger.error(f"Error syncing templates: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== AUTOMATION SEQUENCES ====================

@crm_bp.route('/sequences', methods=['GET'])
@require_admin
def get_sequences(user_id):
    """
    Get all automation sequences.

    Query params:
    - is_active: Filter by active/inactive (optional)
    """
    try:
        is_active_param = request.args.get('is_active')

        if is_active_param is not None:
            is_active = is_active_param.lower() == 'true'
            sequences = get_crm_repo().get_sequences(is_active=is_active)
        else:
            sequences = get_crm_repo().get_sequences()

        return jsonify({
            'sequences': sequences,
            'count': len(sequences)
        }), 200

    except Exception as e:
        logger.error(f"Error getting sequences: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/sequences/<sequence_id>', methods=['GET'])
@require_admin
def get_sequence(user_id, sequence_id):
    """Get sequence by ID"""
    try:
        sequence = get_crm_repo().get_sequence_by_id(sequence_id)

        if not sequence:
            return jsonify({'error': 'Sequence not found'}), 404

        return jsonify({'sequence': sequence}), 200

    except Exception as e:
        logger.error(f"Error getting sequence: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/sequences', methods=['POST'])
@require_admin
def create_sequence(user_id):
    """
    Create new automation sequence (inactive by default).

    Request body:
    {
        "name": "Onboarding Sequence",
        "description": "Optional",
        "trigger_event": "registration_success",
        "steps": [
            {"delay_hours": 24, "template_key": "day_1", "condition": "email_not_verified"},
            {"delay_hours": 72, "template_key": "day_3", "condition": "no_quests_started"}
        ]
    }
    """
    try:
        data = request.get_json()

        required = ['name', 'trigger_event', 'steps']
        if not all(field in data for field in required):
            return jsonify({'error': f'Missing required fields: {required}'}), 400

        from flask import g
        created_by = g.get('current_user_id')

        sequence_data = {
            'name': data['name'],
            'description': data.get('description', ''),
            'trigger_event': data['trigger_event'],
            'steps': data['steps'],
            'is_active': False,  # Always start inactive for safety
            'created_by': created_by
        }

        sequence = get_crm_repo().create_sequence(sequence_data)

        return jsonify({
            'message': 'Sequence created successfully (INACTIVE - must be manually activated)',
            'sequence': sequence
        }), 201

    except Exception as e:
        logger.error(f"Error creating sequence: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/sequences/<sequence_id>', methods=['PUT'])
@require_admin
def update_sequence(user_id, sequence_id):
    """Update sequence by ID"""
    try:
        data = request.get_json()

        # Don't allow direct is_active updates (use activate/pause endpoints)
        if 'is_active' in data:
            return jsonify({'error': 'Use /activate or /pause endpoints to change active status'}), 400

        sequence = get_crm_repo().update_sequence(sequence_id, data)

        return jsonify({
            'message': 'Sequence updated successfully',
            'sequence': sequence
        }), 200

    except Exception as e:
        logger.error(f"Error updating sequence: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/sequences/<sequence_id>/activate', methods=['POST'])
@require_admin
def activate_sequence(user_id, sequence_id):
    """
    ACTIVATE a sequence - starts sending automated emails.

    WARNING: This will start sending emails automatically based on triggers.
    """
    try:
        sequence = get_crm_repo().activate_sequence(sequence_id)

        logger.warning(f"SEQUENCE ACTIVATED: {sequence['name']} (ID: {sequence_id}) - emails will now be sent automatically")

        return jsonify({
            'message': f"Sequence '{sequence['name']}' ACTIVATED - emails will now be sent automatically",
            'sequence': sequence,
            'warning': 'This sequence is now ACTIVE and will send emails based on triggers'
        }), 200

    except Exception as e:
        logger.error(f"Error activating sequence: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/sequences/<sequence_id>/pause', methods=['POST'])
@require_admin
def pause_sequence(user_id, sequence_id):
    """Pause a sequence - stops all automated emails"""
    try:
        sequence = get_crm_repo().pause_sequence(sequence_id)

        return jsonify({
            'message': f"Sequence '{sequence['name']}' paused - no more automated emails will be sent",
            'sequence': sequence
        }), 200

    except Exception as e:
        logger.error(f"Error pausing sequence: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/sequences/<sequence_id>', methods=['DELETE'])
@require_admin
def delete_sequence(user_id, sequence_id):
    """Delete sequence by ID"""
    try:
        get_crm_repo().delete_sequence(sequence_id)

        return jsonify({'message': 'Sequence deleted successfully'}), 200

    except Exception as e:
        logger.error(f"Error deleting sequence: {e}")
        return jsonify({'error': str(e)}), 500


# ==================== ANALYTICS ====================

@crm_bp.route('/analytics/overview', methods=['GET'])
@require_admin
def get_analytics_overview(user_id):
    """Get CRM overview analytics"""
    try:
        campaigns = get_crm_repo().get_campaigns()
        sequences = get_crm_repo().get_sequences()

        # Get total sends
        all_sends = get_crm_repo().get_campaign_sends(limit=10000)

        stats = {
            'total_campaigns': len(campaigns),
            'active_campaigns': sum(1 for c in campaigns if c['status'] == 'active'),
            'total_sequences': len(sequences),
            'active_sequences': sum(1 for s in sequences if s.get('is_active')),
            'total_emails_sent': len(all_sends),
            'emails_sent_today': sum(1 for s in all_sends if s['sent_at'] and s['sent_at'].startswith(datetime.now().strftime('%Y-%m-%d'))),
            'success_rate': (sum(1 for s in all_sends if s['status'] == 'sent') / len(all_sends) * 100) if all_sends else 100
        }

        return jsonify({'stats': stats}), 200

    except Exception as e:
        logger.error(f"Error getting analytics overview: {e}")
        return jsonify({'error': str(e)}), 500


@crm_bp.route('/analytics/campaigns/<campaign_id>', methods=['GET'])
@require_admin
def get_campaign_analytics(user_id, campaign_id):
    """Get detailed analytics for a campaign"""
    try:
        campaign = get_crm_repo().get_campaign_by_id(campaign_id)
        if not campaign:
            return jsonify({'error': 'Campaign not found'}), 404

        stats = get_crm_repo().get_campaign_stats(campaign_id)
        sends = get_crm_repo().get_campaign_sends(campaign_id=campaign_id, limit=100)

        return jsonify({
            'campaign': campaign,
            'stats': stats,
            'recent_sends': sends[:10]
        }), 200

    except Exception as e:
        logger.error(f"Error getting campaign analytics: {e}")
        return jsonify({'error': str(e)}), 500


# Register blueprint
def register_crm_routes(app):
    """Register CRM blueprint with app"""
    app.register_blueprint(crm_bp)
    logger.info("CRM routes registered at /api/admin/crm")
