"""
Brevo marketing-email sync.

Pushes leads and conversion events into Brevo so the marketing automations
(Free Class Nurture etc.) stay in step with the platform. Every call is
fire-and-forget: failures are logged and swallowed so a Brevo outage can
never break a signup or contact-form request.

List ids, attributes, and the funnel design live in
docs/marketing/brevo_funnel_plan.md.
"""
from datetime import date
from urllib.parse import quote

import requests

from app_config import Config
from utils.logger import get_logger

logger = get_logger(__name__)

BREVO_BASE = 'https://api.brevo.com/v3'
REQUEST_TIMEOUT = 5

# Brevo list ids (created 2026-07-07; see funnel plan doc section 5C)
LIST_FREE_CLASS_LEADS = 4
LIST_FAMILIES = 5
LIST_B2B = 6
LIST_POE_PARENTS = 7
LIST_CUSTOMERS = 8
# Pre-automation backfill leads receiving the nurture as scheduled campaigns
# (Jul 2026). Unlinking on conversion is what stops their remaining sends,
# since scheduled campaigns resolve recipients from list membership at send
# time. Safe to keep once the sequence finishes; unlinking an absent member
# is a no-op.
LIST_CATCHUP_FREE_CLASS = 11
# Homepage "Get More Info" leads (demo/general types). These turned out to be
# mostly homeschool parents, not B2B, so they get their own parent-voiced
# nurture (templates 24-27) instead of the B2B pipeline.
LIST_GENERAL_INTEREST = 12
# Trigger list for the New Account Welcome automation. Separate from
# Customers (#8) on purpose: mark_converted also adds ineligible registrants
# (org users, under-13) to Customers so their nurture sequences exit, and
# those must NOT receive the welcome emails. Only sync_new_account adds here.
LIST_NEW_ACCOUNTS = 13

# Which list a contact_submissions.contact_type lands in. Adding a contact to
# Free Class Leads or General Interest Leads triggers a nurture automation, so
# callers must only sync genuinely new leads (not existing account holders).
LEAD_TYPE_LISTS = {
    'claim_free_class': LIST_FREE_CLASS_LEADS,
    'families': LIST_FAMILIES,
    'general': LIST_GENERAL_INTEREST,
    'demo': LIST_GENERAL_INTEREST,
    'sales': LIST_B2B,
    'academy': LIST_B2B,
}


def _enabled():
    if not Config.BREVO_API_KEY:
        logger.warning('BREVO_API_KEY not set; skipping Brevo sync')
        return False
    return True


def _headers():
    return {
        'api-key': Config.BREVO_API_KEY,
        'accept': 'application/json',
        'content-type': 'application/json',
    }


def _upsert_contact(email, list_ids, attributes):
    if isinstance(list_ids, int):
        list_ids = [list_ids]
    resp = requests.post(
        f'{BREVO_BASE}/contacts',
        headers=_headers(),
        json={
            'email': email,
            'listIds': list_ids,
            'updateEnabled': True,
            'attributes': attributes,
        },
        timeout=REQUEST_TIMEOUT,
    )
    if resp.status_code >= 400:
        logger.warning(f'Brevo contact upsert failed ({resp.status_code}): {resp.text[:200]}')
        return False
    return True


def sync_lead(email, contact_type, name=None):
    """Create/update a Brevo contact for a new lead and add it to the list
    matching its type (which starts the nurture automation for free-class
    leads)."""
    if not _enabled():
        return
    list_id = LEAD_TYPE_LISTS.get(contact_type)
    if not list_id:
        return

    attributes = {
        'LEAD_TYPE': contact_type,
        'LEAD_SOURCE': 'classes_lp' if contact_type == 'claim_free_class' else 'contact_form',
        'LEAD_DATE': date.today().isoformat(),
        'CONVERTED': False,
    }
    # The free-class modal submits the placeholder name 'Free Class Lead'.
    if name and name.strip() and name.strip().lower() != 'free class lead':
        parts = name.strip().split(None, 1)
        attributes['FIRSTNAME'] = parts[0]
        if len(parts) > 1:
            attributes['LASTNAME'] = parts[1]

    try:
        if _upsert_contact(email, list_id, attributes):
            logger.info(f'Brevo lead synced: type={contact_type} list={list_id}')
    except Exception as e:
        logger.warning(f'Brevo lead sync error: {e}')


def sync_poe_parent(parent_email, first_name=None, last_name=None):
    """Add a POE signup's parent to the POE Parents list. Marketing goes to
    parents only; student emails must never be synced (all POE signups are
    minors)."""
    if not _enabled():
        return
    attributes = {
        'LEAD_TYPE': 'poe_parent',
        'LEAD_SOURCE': 'poe_signup',
        'LEAD_DATE': date.today().isoformat(),
        'CONVERTED': False,
    }
    if first_name:
        attributes['FIRSTNAME'] = first_name
    if last_name:
        attributes['LASTNAME'] = last_name

    try:
        if _upsert_contact(parent_email, LIST_POE_PARENTS, attributes):
            logger.info('Brevo POE parent synced')
    except Exception as e:
        logger.warning(f'Brevo POE parent sync error: {e}')


def sync_new_account(email, first_name=None, last_name=None, role=None):
    """Sync an eligible new registration into Brevo: adds the contact to
    Customers (#8, exits any nurture automation and suppresses future lead
    sends) and to New Account Welcome (#13, starts the welcome automation),
    then unlinks any lead lists. Deliberately does not touch LEAD_TYPE /
    LEAD_SOURCE / LEAD_DATE so ex-lead provenance survives.

    Callers gate eligibility (see routes/auth/registration.py): self-signups
    with an effective role of student or parent (platform or org), not
    under-13. Ineligible registrants go through mark_converted instead."""
    if not _enabled():
        return
    attributes = {
        'CONVERTED': True,
        'SIGNUP_DATE': date.today().isoformat(),
    }
    if role:
        attributes['ROLE'] = role
    if first_name:
        attributes['FIRSTNAME'] = first_name
    if last_name:
        attributes['LASTNAME'] = last_name

    try:
        if not _upsert_contact(email, [LIST_CUSTOMERS, LIST_NEW_ACCOUNTS], attributes):
            return
        # Second call: POST /contacts can't unlink lists, so drop any lead-list
        # memberships with a PUT (no-op for organic signups).
        resp = requests.put(
            f'{BREVO_BASE}/contacts/{quote(email, safe="")}',
            headers=_headers(),
            json={
                'unlinkListIds': [LIST_FREE_CLASS_LEADS, LIST_FAMILIES, LIST_B2B, LIST_CATCHUP_FREE_CLASS, LIST_GENERAL_INTEREST],
            },
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code >= 400:
            logger.warning(f'Brevo new-account unlink failed ({resp.status_code}): {resp.text[:200]}')
        else:
            logger.info('Brevo new account synced')
    except Exception as e:
        logger.warning(f'Brevo new-account sync error: {e}')


def mark_converted(email):
    """Flag a Brevo contact as converted: CONVERTED=true and move from the
    lead lists into Customers. The nurture automation's exit rule (contact
    added to Customers) removes them from the sequence. A 404 just means the
    registrant was never a marketing lead, which is the common case."""
    if not _enabled():
        return
    try:
        resp = requests.put(
            f'{BREVO_BASE}/contacts/{quote(email, safe="")}',
            headers=_headers(),
            json={
                'attributes': {'CONVERTED': True},
                'listIds': [LIST_CUSTOMERS],
                'unlinkListIds': [LIST_FREE_CLASS_LEADS, LIST_FAMILIES, LIST_B2B, LIST_CATCHUP_FREE_CLASS, LIST_GENERAL_INTEREST],
            },
            timeout=REQUEST_TIMEOUT,
        )
        if resp.status_code == 404:
            return
        if resp.status_code >= 400:
            logger.warning(f'Brevo conversion sync failed ({resp.status_code}): {resp.text[:200]}')
        else:
            logger.info('Brevo contact marked converted')
    except Exception as e:
        logger.warning(f'Brevo conversion sync error: {e}')
