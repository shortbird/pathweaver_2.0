"""
Bounty Service - Business logic for Bounty Board system.

Handles bounty lifecycle: creation with deliverables, claiming, deliverable
completion tracking, auto-submission, review, and XP rewards.
"""

import uuid
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone

from services.base_service import BaseService, ValidationError
from repositories.base_repository import NotFoundError
from repositories.bounty_repository import BountyRepository
from repositories.yeti_repository import YetiRepository
from utils.logger import get_logger

logger = get_logger(__name__)

VALID_PILLARS = ('stem', 'art', 'communication', 'civics', 'wellness')
VALID_BOUNTY_TYPES = ('open', 'challenge', 'family', 'org', 'sponsored')
MIN_XP_REWARD = 25
MAX_XP_REWARD = 200


class BountyService(BaseService):
    """Service for bounty management and lifecycle."""

    def __init__(self):
        super().__init__()
        self.repository = BountyRepository()
        self.yeti_repository = YetiRepository()

    def is_superadmin(self, user_id: str) -> bool:
        """Check if a user has the superadmin role."""
        try:
            result = self.repository.client.table('users').select('role').eq('id', user_id).execute()
            return bool(result.data and result.data[0].get('role') == 'superadmin')
        except Exception:
            return False

    def create_bounty(self, poster_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new bounty with deliverables. Auto-activates."""
        self.validate_required(
            poster_id=poster_id,
            title=data.get('title'),
            description=data.get('description'),
        )

        # Validate deliverables
        deliverables_raw = data.get('deliverables', [])
        if not deliverables_raw or not isinstance(deliverables_raw, list):
            raise ValidationError("At least one deliverable is required")

        deliverables = []
        for item in deliverables_raw:
            text = item.strip() if isinstance(item, str) else item.get('text', '').strip()
            if not text:
                continue
            deliverables.append({'id': str(uuid.uuid4()), 'text': text})

        if not deliverables:
            raise ValidationError("At least one non-empty deliverable is required")

        # Validate and build rewards
        rewards_raw = data.get('rewards', [])
        rewards = []
        total_xp = 0
        primary_pillar = None

        if not isinstance(rewards_raw, list):
            rewards_raw = []

        for r in rewards_raw:
            if isinstance(r, dict):
                if r.get('type') == 'xp':
                    xp_val = int(r.get('value', 0))
                    pillar = r.get('pillar', 'stem')
                    if xp_val < MIN_XP_REWARD or xp_val > MAX_XP_REWARD:
                        raise ValidationError(f"XP reward must be between {MIN_XP_REWARD} and {MAX_XP_REWARD}")
                    if pillar not in VALID_PILLARS:
                        raise ValidationError(f"Invalid pillar: {pillar}")
                    rewards.append({'id': str(uuid.uuid4()), 'type': 'xp', 'value': xp_val, 'pillar': pillar})
                    total_xp += xp_val
                    if not primary_pillar:
                        primary_pillar = pillar
                elif r.get('type') == 'custom':
                    text = r.get('text', '').strip()
                    if text:
                        rewards.append({'id': str(uuid.uuid4()), 'type': 'custom', 'text': text})

        # Visibility
        visibility = data.get('visibility', 'public')
        if visibility not in ('public', 'organization', 'family'):
            raise ValidationError(f"Invalid visibility: {visibility}")

        # Build requirements text from deliverables for backwards compatibility
        requirements_text = '\n'.join(f"- {d['text']}" for d in deliverables)

        # Build sponsor info from poster
        OPTIO_LOGO = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'
        OPTIO_USERS = ['tanner bowman']

        sponsor = data.get('sponsor')
        if not sponsor:
            poster = self.repository.client.table('users').select('display_name, first_name, last_name, role').eq('id', poster_id).execute()
            if poster.data:
                user_data = poster.data[0]
                full_name = f"{user_data.get('first_name', '')} {user_data.get('last_name', '')}".strip()
                is_optio = user_data.get('role') == 'superadmin' or full_name.lower() in OPTIO_USERS
                if is_optio:
                    sponsor = {'name': 'Optio', 'logo_url': OPTIO_LOGO}
                else:
                    name = user_data.get('display_name') or full_name or 'Anonymous'
                    sponsor = {'name': name}

        # Allowed student IDs (for family visibility targeting specific kids)
        allowed_student_ids = data.get('allowed_student_ids')
        if allowed_student_ids is not None:
            if not isinstance(allowed_student_ids, list):
                allowed_student_ids = None
            else:
                # Filter to valid non-empty strings
                allowed_student_ids = [s for s in allowed_student_ids if isinstance(s, str) and s.strip()]
                if not allowed_student_ids:
                    allowed_student_ids = None

        bounty_data = {
            'poster_id': poster_id,
            'title': data['title'].strip(),
            'description': data['description'].strip(),
            'requirements': requirements_text,
            'deliverables': deliverables,
            'rewards': rewards,
            'pillar': data.get('pillar') or primary_pillar or 'stem',
            'bounty_type': data.get('bounty_type', 'open'),
            'xp_reward': total_xp,
            'max_participants': data.get('max_participants', 0),
            'deadline': data.get('deadline', (datetime.now(timezone.utc).replace(year=datetime.now().year + 1)).isoformat()),
            'status': 'active',
            'moderation_status': 'manually_approved',
            'visibility': visibility,
            'allowed_student_ids': allowed_student_ids,
            'sponsored_reward': sponsor,
            'organization_id': data.get('organization_id'),
        }

        bounty = self.repository.create_bounty(bounty_data)
        logger.info(f"Bounty '{data['title']}' created by {poster_id[:8]} with {len(deliverables)} deliverables")
        return bounty

    def update_bounty(self, bounty_id: str, poster_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update an existing bounty. Poster or superadmin can update."""
        bounty = self.repository.get_bounty_by_id(bounty_id)
        if not bounty:
            raise NotFoundError(f"Bounty {bounty_id} not found")

        if bounty['poster_id'] != poster_id and not self.is_superadmin(poster_id):
            raise ValidationError("Only the poster can edit this bounty")

        updates = {}

        if 'title' in data:
            title = data['title'].strip()
            if not title:
                raise ValidationError("Title cannot be empty")
            updates['title'] = title

        if 'description' in data:
            updates['description'] = data['description'].strip()

        if 'max_participants' in data:
            updates['max_participants'] = max(0, int(data['max_participants']))

        if 'visibility' in data:
            if data['visibility'] not in ('public', 'organization', 'family'):
                raise ValidationError(f"Invalid visibility: {data['visibility']}")
            updates['visibility'] = data['visibility']

        if 'allowed_student_ids' in data:
            val = data['allowed_student_ids']
            if val is None or (isinstance(val, list) and len(val) == 0):
                updates['allowed_student_ids'] = None
            elif isinstance(val, list):
                filtered = [s for s in val if isinstance(s, str) and s.strip()]
                updates['allowed_student_ids'] = filtered if filtered else None
            else:
                updates['allowed_student_ids'] = None

        if 'deliverables' in data:
            deliverables_raw = data['deliverables']
            if not isinstance(deliverables_raw, list) or not deliverables_raw:
                raise ValidationError("At least one deliverable is required")

            deliverables = []
            for item in deliverables_raw:
                text = item.strip() if isinstance(item, str) else item.get('text', '').strip()
                if not text:
                    continue
                deliverables.append({'id': str(uuid.uuid4()), 'text': text})

            if not deliverables:
                raise ValidationError("At least one non-empty deliverable is required")

            updates['deliverables'] = deliverables
            updates['requirements'] = '\n'.join(f"- {d['text']}" for d in deliverables)

        if 'rewards' in data:
            rewards_raw = data['rewards']
            if not isinstance(rewards_raw, list):
                rewards_raw = []

            rewards = []
            total_xp = 0
            primary_pillar = None
            for r in rewards_raw:
                if isinstance(r, dict):
                    if r.get('type') == 'xp':
                        xp_val = int(r.get('value', 0))
                        pillar = r.get('pillar', 'stem')
                        if xp_val < MIN_XP_REWARD or xp_val > MAX_XP_REWARD:
                            raise ValidationError(f"XP reward must be between {MIN_XP_REWARD} and {MAX_XP_REWARD}")
                        if pillar not in VALID_PILLARS:
                            raise ValidationError(f"Invalid pillar: {pillar}")
                        rewards.append({'id': str(uuid.uuid4()), 'type': 'xp', 'value': xp_val, 'pillar': pillar})
                        total_xp += xp_val
                        if not primary_pillar:
                            primary_pillar = pillar
                    elif r.get('type') == 'custom':
                        text = r.get('text', '').strip()
                        if text:
                            rewards.append({'id': str(uuid.uuid4()), 'type': 'custom', 'text': text})

            updates['rewards'] = rewards
            updates['xp_reward'] = total_xp
            if primary_pillar:
                updates['pillar'] = primary_pillar

        # Explicit pillar override (e.g. custom-reward-only bounties)
        if 'pillar' in data and data['pillar'] in VALID_PILLARS:
            updates['pillar'] = data['pillar']

        if not updates:
            raise ValidationError("No valid fields to update")

        from datetime import datetime, timezone
        updates['updated_at'] = datetime.now(timezone.utc).isoformat()

        response = self.repository.client.table('bounties').update(updates).eq('id', bounty_id).execute()
        if not response.data:
            raise NotFoundError(f"Bounty {bounty_id} not found")

        logger.info(f"Bounty {bounty_id[:8]} updated by {poster_id[:8]}")
        return response.data[0]

    def get_bounty(self, bounty_id: str) -> Dict[str, Any]:
        """Get bounty details."""
        bounty = self.repository.get_bounty_by_id(bounty_id)
        if not bounty:
            raise NotFoundError(f"Bounty {bounty_id} not found")
        return bounty

    def list_bounties(self, user_id: str, pillar: Optional[str] = None, bounty_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """List active bounties visible to the user, with optional filters."""
        all_bounties = self.repository.list_active_bounties(pillar=pillar, bounty_type=bounty_type)

        # Get user info for visibility filtering
        user_result = self.repository.client.table('users').select(
            'id, role, organization_id, managed_by_parent_id'
        ).eq('id', user_id).execute()

        if not user_result.data:
            return [b for b in all_bounties if b.get('visibility') == 'public']

        user = user_result.data[0]
        user_org_id = user.get('organization_id')
        user_parent_id = user.get('managed_by_parent_id')
        is_superadmin = user.get('role') == 'superadmin'

        visible = []
        for b in all_bounties:
            vis = b.get('visibility', 'public')
            if vis == 'public':
                visible.append(b)
            elif vis == 'organization' and user_org_id and b.get('organization_id') == user_org_id:
                visible.append(b)
            elif vis == 'family':
                # Poster always sees their own family bounties
                if b['poster_id'] == user_id:
                    visible.append(b)
                # Child of the poster
                elif b['poster_id'] == user_parent_id:
                    # If allowed_student_ids is set, only those specific kids can see it
                    allowed = b.get('allowed_student_ids')
                    if allowed and isinstance(allowed, list):
                        if user_id in allowed:
                            visible.append(b)
                    else:
                        # No restriction -- all kids of the poster can see it
                        visible.append(b)
            elif b['poster_id'] == user_id:
                # Poster always sees their own bounties
                visible.append(b)
            elif is_superadmin:
                visible.append(b)

        return visible

    def get_my_posted(self, poster_id: str) -> List[Dict[str, Any]]:
        """Get bounties posted by user."""
        return self.repository.get_poster_bounties(poster_id)

    def get_my_posted_with_claims(self, poster_id: str) -> List[Dict[str, Any]]:
        """Get bounties posted by user, each enriched with its claims and student info."""
        bounties = self.repository.get_poster_bounties(poster_id)
        return self._enrich_bounties_with_claims(bounties)

    def get_all_bounties_with_claims(self) -> List[Dict[str, Any]]:
        """Get ALL bounties with claims (superadmin view)."""
        try:
            response = self.repository.client.table('bounties')\
                .select('*').order('created_at', desc=True).execute()
            bounties = response.data or []
        except Exception as e:
            logger.error(f"Error fetching all bounties: {e}")
            return []
        return self._enrich_bounties_with_claims(bounties)

    def _enrich_bounties_with_claims(self, bounties: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Enrich a list of bounties with claims and student info."""
        all_student_ids: set = set()
        for bounty in bounties:
            bounty['claims'] = self.repository.get_bounty_claims(bounty['id'])
            for c in bounty['claims']:
                if c.get('student_id'):
                    all_student_ids.add(c['student_id'])
        student_map: Dict[str, Dict] = {}
        if all_student_ids:
            students = self.repository.client.table('users')\
                .select('id, display_name, first_name, last_name')\
                .in_('id', list(all_student_ids)).execute()
            for s in (students.data or []):
                student_map[s['id']] = {
                    'display_name': s.get('display_name') or f"{s.get('first_name', '')} {s.get('last_name', '')}".strip() or 'Student',
                    'first_name': s.get('first_name', ''),
                    'last_name': s.get('last_name', ''),
                }
        for bounty in bounties:
            for claim in bounty['claims']:
                claim['student'] = student_map.get(claim.get('student_id'), {})
        return bounties

    def get_my_claims(self, student_id: str) -> List[Dict[str, Any]]:
        """Get claims by student."""
        return self.repository.get_student_claims(student_id)

    def get_my_claims_with_bounties(self, student_id: str) -> List[Dict[str, Any]]:
        """Get claims by student, each enriched with its bounty data."""
        claims = self.repository.get_student_claims(student_id)
        for claim in claims:
            bounty = self.repository.get_bounty_by_id(claim['bounty_id'])
            claim['bounty'] = bounty
        return claims

    def claim_bounty(self, bounty_id: str, student_id: str) -> Dict[str, Any]:
        """Student claims a bounty."""
        bounty = self.repository.get_bounty_by_id(bounty_id)
        if not bounty:
            raise NotFoundError(f"Bounty {bounty_id} not found")

        if bounty['status'] != 'active':
            raise ValidationError("Bounty is not active")

        # Check capacity (0 = unlimited)
        max_p = bounty.get('max_participants', 0)
        if max_p > 0:
            current_claims = self.repository.count_bounty_claims(bounty_id)
            if current_claims >= max_p:
                raise ValidationError("Bounty has reached maximum participants")

        claim = self.repository.create_claim(bounty_id, student_id)
        logger.info(f"Student {student_id[:8]} claimed bounty {bounty_id[:8]}")
        return claim

    def toggle_deliverable(self, claim_id: str, student_id: str, bounty_id: str,
                           deliverable_id: str, completed: bool = True,
                           deliverable_evidence: Optional[List] = None) -> Dict[str, Any]:
        """Toggle a deliverable completion with evidence. Auto-submits when all are done.

        When completing a deliverable, evidence (list of evidence items) is required.
        Each item: {type: 'text'|'image'|'video'|'link'|'document', content: {...}}
        """
        claim = self.repository.get_claim(claim_id)
        if not claim:
            raise NotFoundError(f"Claim {claim_id} not found")

        if claim['student_id'] != student_id:
            raise ValidationError("You can only update your own claims")

        if claim['status'] not in ('claimed', 'revision_requested'):
            raise ValidationError(f"Cannot update deliverables for claim with status '{claim['status']}'")

        # Get the bounty to know all deliverable IDs
        bounty = self.repository.get_bounty_by_id(bounty_id)
        if not bounty:
            raise NotFoundError(f"Bounty {bounty_id} not found")

        all_deliverable_ids = [d['id'] for d in (bounty.get('deliverables') or [])]
        if deliverable_id not in all_deliverable_ids:
            raise ValidationError(f"Deliverable {deliverable_id} not found on this bounty")

        # Require evidence when completing
        if completed and (not deliverable_evidence or len(deliverable_evidence) == 0):
            raise ValidationError("At least one piece of evidence is required to complete a deliverable")

        # Update completed deliverables list and evidence
        evidence = claim.get('evidence') or {}
        completed_ids = list(evidence.get('completed_deliverables', []))
        all_evidence = dict(evidence.get('deliverable_evidence', {}))

        if completed:
            if deliverable_id not in completed_ids:
                completed_ids.append(deliverable_id)
            # Append new evidence to existing evidence for this deliverable
            existing = list(all_evidence.get(deliverable_id, []))
            existing.extend(deliverable_evidence)
            all_evidence[deliverable_id] = existing
        elif not completed and deliverable_id in completed_ids:
            completed_ids.remove(deliverable_id)
            # Keep evidence even when uncompleting

        evidence['completed_deliverables'] = completed_ids
        evidence['deliverable_evidence'] = all_evidence

        # Just update evidence -- student must explicitly "Turn in" to submit
        updated = self.repository.update_claim_evidence(claim_id, evidence)
        return updated

    def turn_in_bounty(self, claim_id: str, student_id: str, bounty_id: str) -> Dict[str, Any]:
        """Student explicitly turns in a bounty for review. All deliverables must be complete."""
        claim = self.repository.get_claim(claim_id)
        if not claim:
            raise NotFoundError(f"Claim {claim_id} not found")

        if claim['student_id'] != student_id:
            raise ValidationError("You can only turn in your own claims")

        if claim['status'] not in ('claimed', 'revision_requested'):
            raise ValidationError(f"Cannot turn in claim with status '{claim['status']}'")

        bounty = self.repository.get_bounty_by_id(bounty_id)
        if not bounty:
            raise NotFoundError(f"Bounty {bounty_id} not found")

        # Verify all deliverables are completed
        all_deliverable_ids = [d['id'] for d in (bounty.get('deliverables') or [])]
        evidence = claim.get('evidence') or {}
        completed_ids = evidence.get('completed_deliverables', [])

        if not set(completed_ids) >= set(all_deliverable_ids):
            raise ValidationError("All deliverables must be completed before turning in")

        # Submit for review
        updated = self.repository.submit_evidence(claim_id, evidence)
        logger.info(f"Bounty turned in: claim {claim_id[:8]} for bounty {bounty_id[:8]}")

        # Notify bounty poster
        try:
            import threading
            from services.notification_service import NotificationService

            def send_notification():
                try:
                    ns = NotificationService()
                    student_result = self.repository.client.table('users').select('display_name, first_name, last_name').eq('id', student_id).execute()
                    student_name = 'A student'
                    if student_result.data:
                        s = student_result.data[0]
                        student_name = s.get('display_name') or f"{s.get('first_name', '')} {s.get('last_name', '')}".strip() or 'A student'
                    ns.create_notification(
                        user_id=bounty['poster_id'],
                        notification_type='bounty_submission',
                        title='Bounty Submission',
                        message=f'{student_name} completed all deliverables for "{bounty["title"]}" and is awaiting your review.',
                        link='/bounties?tab=my-bounties',
                        metadata={'bounty_id': bounty_id, 'claim_id': claim_id},
                    )
                except Exception as e:
                    logger.warning(f"Failed to send bounty submission notification: {e}")

            thread = threading.Thread(target=send_notification)
            thread.daemon = True
            thread.start()
        except Exception as e:
            logger.warning(f"Failed to start notification thread: {e}")

        return updated

    def delete_evidence_item(self, claim_id: str, student_id: str,
                             deliverable_id: str, evidence_index: int) -> Dict[str, Any]:
        """Delete a specific evidence item from a deliverable. Cleans up storage."""
        claim = self.repository.get_claim(claim_id)
        if not claim:
            raise NotFoundError(f"Claim {claim_id} not found")

        if claim['student_id'] != student_id:
            raise ValidationError("You can only modify your own claims")

        if claim['status'] not in ('claimed', 'revision_requested'):
            raise ValidationError(f"Cannot modify evidence for claim with status '{claim['status']}'")

        evidence = claim.get('evidence') or {}
        all_evidence = dict(evidence.get('deliverable_evidence', {}))
        items = list(all_evidence.get(deliverable_id, []))

        if evidence_index < 0 or evidence_index >= len(items):
            raise ValidationError("Evidence item not found")

        # Collect storage URLs to delete
        removed = items.pop(evidence_index)
        urls_to_delete = []
        if removed.get('content', {}).get('items'):
            for ci in removed['content']['items']:
                url = ci.get('url', '')
                if url and 'supabase' in url:
                    urls_to_delete.append(url)

        all_evidence[deliverable_id] = items

        # If no evidence left for this deliverable, un-complete it
        completed_ids = list(evidence.get('completed_deliverables', []))
        if len(items) == 0 and deliverable_id in completed_ids:
            completed_ids.remove(deliverable_id)

        evidence['deliverable_evidence'] = all_evidence
        evidence['completed_deliverables'] = completed_ids

        updated = self.repository.update_claim_evidence(claim_id, evidence)

        # Delete files from storage (best-effort)
        if urls_to_delete:
            try:
                import requests
                from app_config import Config
                api_url = Config.SUPABASE_URL
                service_key = Config.SUPABASE_SERVICE_KEY
                requests.post(
                    f"{api_url}/functions/v1/delete-storage-files",
                    json={"urls": urls_to_delete},
                    headers={"Authorization": f"Bearer {service_key}"},
                    timeout=5,
                )
            except Exception as e:
                # Also try the app's own endpoint
                try:
                    # Direct storage deletion via supabase client
                    storage = self.repository.client.storage
                    for url in urls_to_delete:
                        # Extract bucket and path from URL
                        # URL format: https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
                        parts = url.split('/storage/v1/object/public/')
                        if len(parts) == 2:
                            bucket_path = parts[1]
                            slash_idx = bucket_path.index('/')
                            bucket = bucket_path[:slash_idx]
                            path = bucket_path[slash_idx + 1:]
                            storage.from_(bucket).remove([path])
                except Exception as e2:
                    logger.warning(f"Failed to delete storage files: {e2}")

        logger.info(f"Deleted evidence item {evidence_index} from deliverable {deliverable_id[:8]} on claim {claim_id[:8]}")
        return updated

    def submit_evidence(self, claim_id: str, student_id: str, evidence: Dict[str, Any]) -> Dict[str, Any]:
        """Student submits evidence for a claimed bounty."""
        claim = self.repository.get_claim(claim_id)
        if not claim:
            raise NotFoundError(f"Claim {claim_id} not found")

        if claim['student_id'] != student_id:
            raise ValidationError("You can only submit evidence for your own claims")

        if claim['status'] not in ('claimed', 'revision_requested'):
            raise ValidationError(f"Cannot submit evidence for claim with status '{claim['status']}'")

        return self.repository.submit_evidence(claim_id, evidence)

    def review_submission(self, claim_id: str, reviewer_id: str, decision: str, feedback: Optional[str] = None) -> Dict[str, Any]:
        """Poster reviews a submission."""
        if decision not in ('approved', 'rejected', 'revision_requested'):
            raise ValidationError(f"Invalid decision: {decision}")

        claim = self.repository.get_claim(claim_id)
        if not claim:
            raise NotFoundError(f"Claim {claim_id} not found")

        if claim['status'] != 'submitted':
            raise ValidationError("Can only review submitted claims")

        # Create review record
        self.repository.create_review(claim_id, reviewer_id, decision, feedback)

        # Update claim status
        updated_claim = self.repository.update_claim_status(claim_id, decision)

        bounty = self.repository.get_bounty_by_id(claim['bounty_id'])

        if decision == 'approved' and bounty:
            # Award XP per reward
            self._award_bounty_rewards(claim['student_id'], bounty)
            # Create learning event with evidence
            self._create_bounty_learning_event(claim['student_id'], bounty, claim)

        # Notify student
        if bounty:
            try:
                import threading
                from services.notification_service import NotificationService

                def send_student_notification():
                    try:
                        ns = NotificationService()
                        if decision == 'approved':
                            ns.create_notification(
                                user_id=claim['student_id'],
                                notification_type='task_approved',
                                title='Bounty Approved!',
                                message=f'Your submission for "{bounty["title"]}" has been approved!',
                                link='/bounties?tab=active',
                                metadata={'bounty_id': bounty['id'], 'claim_id': claim_id},
                            )
                        elif decision == 'revision_requested':
                            ns.create_notification(
                                user_id=claim['student_id'],
                                notification_type='task_revision_requested',
                                title='Bounty Revision Requested',
                                message=f'The poster of "{bounty["title"]}" requested changes to your submission.' + (f' Feedback: {feedback}' if feedback else ''),
                                link='/bounties?tab=active',
                                metadata={'bounty_id': bounty['id'], 'claim_id': claim_id},
                            )
                        elif decision == 'rejected':
                            ns.create_notification(
                                user_id=claim['student_id'],
                                notification_type='system_alert',
                                title='Bounty Submission Rejected',
                                message=f'Your submission for "{bounty["title"]}" was not accepted.' + (f' Feedback: {feedback}' if feedback else ''),
                                link='/bounties?tab=active',
                                metadata={'bounty_id': bounty['id'], 'claim_id': claim_id},
                            )
                    except Exception as e:
                        logger.warning(f"Failed to send bounty review notification: {e}")

                thread = threading.Thread(target=send_student_notification)
                thread.daemon = True
                thread.start()
            except Exception as e:
                logger.warning(f"Failed to start notification thread: {e}")

        logger.info(f"Claim {claim_id[:8]} reviewed: {decision}")
        return updated_claim

    def moderate_bounty(self, bounty_id: str, moderation_status: str, notes: Optional[str] = None) -> Dict[str, Any]:
        """Admin moderates a bounty (approve/reject)."""
        if moderation_status not in ('ai_approved', 'manually_approved', 'rejected'):
            raise ValidationError(f"Invalid moderation status: {moderation_status}")

        bounty = self.repository.update_moderation_status(bounty_id, moderation_status, notes)

        # Auto-activate approved bounties
        if moderation_status in ('ai_approved', 'manually_approved'):
            bounty = self.repository.update_bounty_status(bounty_id, 'active')

        return bounty

    def _award_bounty_rewards(self, student_id: str, bounty: Dict[str, Any]):
        """Award XP for completing a bounty, per reward entry."""
        try:
            from services.xp_service import XPService
            xp_service = XPService()
            rewards = bounty.get('rewards') or []
            total_xp = 0

            for reward in rewards:
                if reward.get('type') == 'xp':
                    xp_val = reward.get('value', 0)
                    pillar = reward.get('pillar', 'stem')
                    if xp_val > 0:
                        xp_service.award_xp(
                            user_id=student_id,
                            pillar=pillar,
                            xp_amount=xp_val,
                            source='bounty_completion',
                        )
                        total_xp += xp_val

            # Fallback: if no rewards array, use legacy xp_reward
            if not rewards and bounty.get('xp_reward', 0) > 0:
                xp_service.award_xp(
                    user_id=student_id,
                    pillar=bounty.get('pillar', 'stem'),
                    xp_amount=bounty['xp_reward'],
                    source='bounty_completion',
                )
                total_xp = bounty['xp_reward']

            if total_xp > 0:
                self.yeti_repository.add_spendable_xp(student_id, total_xp)

            logger.info(f"Awarded {total_xp} XP to student {student_id[:8]} for bounty {bounty['id'][:8]}")
        except Exception as e:
            logger.error(f"Failed to award bounty XP: {e}")

    def _create_bounty_learning_event(self, student_id: str, bounty: Dict[str, Any], claim: Dict[str, Any]):
        """Create a learning event from bounty completion, with evidence blocks."""
        try:
            from services.learning_events_service import LearningEventsService
            from database import get_supabase_admin_client

            # Determine pillars from rewards
            pillars = list(set(
                r.get('pillar') for r in (bounty.get('rewards') or [])
                if r.get('type') == 'xp' and r.get('pillar')
            ))
            if not pillars and bounty.get('pillar'):
                pillars = [bounty['pillar']]

            # Create the learning event
            result = LearningEventsService.create_learning_event(
                user_id=student_id,
                description=f"Completed bounty: {bounty['title']}\n\n{bounty.get('description', '')}",
                title=f"Bounty: {bounty['title']}",
                pillars=pillars,
                source_type='realtime',
            )

            if not result.get('success') or not result.get('event'):
                logger.warning(f"Failed to create learning event for bounty: {result.get('error')}")
                return

            event_id = result['event']['id']

            # Copy evidence blocks from claim to learning event
            # admin client justified: service layer — called from multiple routes; access control is enforced by each calling route's decorators (@require_auth/@require_admin/etc.)
            supabase = get_supabase_admin_client()
            evidence = claim.get('evidence') or {}
            deliverable_evidence = evidence.get('deliverable_evidence', {})
            deliverables = bounty.get('deliverables') or []

            order_idx = 0
            for d in deliverables:
                items = deliverable_evidence.get(d['id'], [])
                for item in items:
                    block_type = item.get('type', 'text')
                    content = item.get('content', {})

                    if block_type == 'text':
                        # Text: {text: '...'} -- already correct format
                        supabase.table('learning_event_evidence_blocks').insert({
                            'learning_event_id': event_id,
                            'block_type': 'text',
                            'content': content,
                            'order_index': order_idx,
                        }).execute()
                        order_idx += 1
                    elif content.get('items'):
                        # Media types: flatten {items: [{url, title, ...}]} into individual blocks
                        for ci in content['items']:
                            flat_content = {'url': ci.get('url', '')}
                            if ci.get('alt'):
                                flat_content['alt'] = ci['alt']
                            if ci.get('title'):
                                flat_content['title'] = ci['title']
                            if ci.get('caption'):
                                flat_content['caption'] = ci['caption']
                            if ci.get('filename'):
                                flat_content['filename'] = ci['filename']
                            # Map camera type to image/video
                            actual_type = block_type
                            if block_type == 'camera':
                                actual_type = ci.get('mediaType', 'image')
                            supabase.table('learning_event_evidence_blocks').insert({
                                'learning_event_id': event_id,
                                'block_type': actual_type,
                                'content': flat_content,
                                'order_index': order_idx,
                            }).execute()
                            order_idx += 1

            logger.info(f"Created learning event {event_id[:8]} with {order_idx} evidence blocks for bounty {bounty['id'][:8]}")
        except Exception as e:
            logger.error(f"Failed to create bounty learning event: {e}")
