"""
The CRM assistant's reactions to what happens in a contact's history
(docs/CRM_AI_ASSISTANT_PLAN.md).

Phase 1 holds one rule: a reply from a lead ends their automated sequence. A
canned nurture email arriving two days after somebody wrote back personally is
how a warm lead goes cold, so the funnel exits with reason 'replied' and the
conversation is Tanner's from then on.
"""
from typing import Any, Dict

from utils.logger import get_logger

logger = get_logger(__name__)

# admin client justified: crm_* tables are service-role only; this runs inside
# the cron-secret Gmail sync.
from utils.admin_client import admin_client as _db


def on_inbound_message(message: Dict[str, Any]) -> None:
    """React to an inbound email that has already been stored."""
    sender = (message.get('from_email') or '').lower()
    if not sender:
        return
    from repositories.crm_mail_repository import CrmMailRepository
    repo = CrmMailRepository(client=_db())
    lead_id = repo.lead_ids_by_email([sender]).get(sender)
    if not lead_id:
        return
    paused = repo.exit_active_funnels(lead_id, 'replied')
    if paused:
        repo.record_lead_event(lead_id, 'replied', {
            'gmail_message_id': message.get('gmail_message_id'),
            'subject': message.get('subject'),
            'funnels_paused': paused})
        logger.info(f'CRM: lead {lead_id[:8]} replied; paused {paused} funnel(s)')
