"""
Bounty Service - Business logic for Bounty Board system.

Handles bounty lifecycle: creation with deliverables, claiming, deliverable
completion tracking, auto-submission, review, and XP rewards.
"""

import uuid
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone, timedelta

from services.base_service import BaseService, ValidationError
from repositories.base_repository import NotFoundError
from repositories.bounty_repository import BountyRepository
from repositories.wallet_repository import WalletRepository
from utils.logger import get_logger

logger = get_logger(__name__)

VALID_PILLARS = ('stem', 'art', 'communication', 'civics', 'wellness')
VALID_BOUNTY_TYPES = ('open', 'challenge', 'family', 'org', 'sponsored')
MIN_XP_REWARD = 25
MAX_XP_REWARD = 200
# The bounties.xp_reward column CHECK is <= 500. Enforcing the same ceiling here
# turns "three 200-XP rewards" into a readable 400 instead of a Postgres 500.
MAX_TOTAL_XP = 500
MAX_REWARD_ENTRIES = 10
MAX_PARTICIPANTS_CAP = 1000


class BountyService(BaseService):
    """Service for bounty management and lifecycle."""

    def __init__(self):
        super().__init__()
        self.repository = BountyRepository()
        self.wallet_repository = WalletRepository()

    def is_superadmin(self, user_id: str) -> bool:
        """Check if a user has the superadmin role."""
        try:
            result = self.repository.client.table('users').select('role').eq('id', user_id).execute()
            return bool(result.data and result.data[0].get('role') == 'superadmin')
        except Exception:
            return False

    def _get_posters_student_ids(self, poster_id: str) -> Optional[set]:
        """Resolve the set of student IDs the poster is authorized to target
        with a family-visibility bounty. Union of:
          - dependents (managed_by_parent_id)
          - approved parent_student_links (13+ kids)
          - observer_student_links (observer relationships)

        Returns None for superadmin to signal "no filter — they can target
        any student." Callers should treat None as "skip the intersect."

        Raises on lookup failure rather than returning an empty set: an empty
        result would make the caller drop allowed_student_ids entirely, which
        WIDENS a targeted bounty to every linked kid. A transient DB error must
        fail the request, not the targeting.
        """
        try:
            client = self.repository.client
            user_row = client.table('users').select('role').eq('id', poster_id).execute()
            if user_row.data and user_row.data[0].get('role') == 'superadmin':
                return None
            allowed: set = set()
            dependents = client.table('users').select('id').eq('managed_by_parent_id', poster_id).execute()
            allowed.update(d['id'] for d in (dependents.data or []))
            links = client.table('parent_student_links').select('student_user_id') \
                .eq('parent_user_id', poster_id).eq('status', 'approved').execute()
            allowed.update(l['student_user_id'] for l in (links.data or []))
            obs_links = client.table('observer_student_links').select('student_id') \
                .eq('observer_id', poster_id).execute()
            allowed.update(l['student_id'] for l in (obs_links.data or []))
            return allowed
        except Exception as e:
            logger.warning(f"_get_posters_student_ids failed for {poster_id[:8]}: {e}")
            raise ValidationError("Could not verify your linked students. Please try again.") from e

    @staticmethod
    def _build_rewards(rewards_raw: Any) -> Dict[str, Any]:
        """Validate and normalize a client rewards list. Shared by create/update
        so the two paths cannot drift. Returns {rewards, total_xp, primary_pillar}."""
        if not isinstance(rewards_raw, list):
            rewards_raw = []
        if len(rewards_raw) > MAX_REWARD_ENTRIES:
            raise ValidationError(f"A bounty can have at most {MAX_REWARD_ENTRIES} rewards")

        rewards = []
        total_xp = 0
        primary_pillar = None
        for r in rewards_raw:
            if not isinstance(r, dict):
                continue
            if r.get('type') == 'xp':
                try:
                    xp_val = int(r.get('value', 0))
                except (TypeError, ValueError) as _exc:
                    raise ValidationError("XP reward value must be a number") from _exc
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
                text = str(r.get('text', '')).strip()
                if text:
                    rewards.append({'id': str(uuid.uuid4()), 'type': 'custom', 'text': text[:500]})

        if total_xp > MAX_TOTAL_XP:
            raise ValidationError(f"Total XP across rewards cannot exceed {MAX_TOTAL_XP}")
        return {'rewards': rewards, 'total_xp': total_xp, 'primary_pillar': primary_pillar}

    @staticmethod
    def _parse_deadline(value: Any) -> Optional[str]:
        """Parse a client deadline into an ISO string, or raise a readable 400.
        Returns None when no deadline was supplied."""
        if not value:
            return None
        try:
            parsed = datetime.fromisoformat(str(value).replace('Z', '+00:00'))
        except (TypeError, ValueError) as _exc:
            raise ValidationError("Deadline must be a valid date") from _exc
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        if parsed <= datetime.now(timezone.utc):
            raise ValidationError("Deadline must be in the future")
        return parsed.isoformat()

    def _validate_org_fields(self, poster_org_id: Optional[str], is_superadmin: bool,
                             organization_id: Optional[str], cohort_class_id: Optional[str]) -> None:
        """A poster may only attach a bounty to their own org and its classes.
        Without this, any parent could POST visibility='organization' with
        another school's org id and land on that school's board."""
        if is_superadmin:
            return
        if organization_id and organization_id != poster_org_id:
            raise ValidationError("You can only post bounties to your own organization")
        if cohort_class_id:
            if not poster_org_id:
                raise ValidationError("Cohort-restricted bounties require an organization")
            try:
                row = self.repository.client.table('org_classes') \
                    .select('id, organization_id').eq('id', cohort_class_id).execute()
            except Exception as _exc:
                raise ValidationError("Could not verify the selected cohort. Please try again.") from _exc
            if not row.data or row.data[0].get('organization_id') != poster_org_id:
                raise ValidationError("That cohort does not belong to your organization")

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
        built = self._build_rewards(data.get('rewards', []))
        rewards = built['rewards']
        total_xp = built['total_xp']
        primary_pillar = built['primary_pillar']

        # Visibility
        visibility = data.get('visibility', 'public')
        if visibility not in ('public', 'organization', 'family'):
            raise ValidationError(f"Invalid visibility: {visibility}")

        # Audience — who may claim it. Defaults to students, so nothing about
        # existing bounty creation changes.
        audience = (data.get('audience') or 'students').strip().lower()
        if audience not in ('students', 'staff'):
            raise ValidationError(f"Invalid audience: {audience}")
        if audience == 'staff' and visibility != 'organization':
            # A staff bounty is a school's internal business. Public or family
            # visibility would put it on boards belonging to other schools.
            raise ValidationError("Staff bounties must use 'organization' visibility")

        # Build requirements text from deliverables for backwards compatibility
        requirements_text = '\n'.join(f"- {d['text']}" for d in deliverables)

        # Field-level validation up front so a bad value is a readable 400, not
        # a Postgres CHECK violation surfacing as a 500.
        pillar_override = data.get('pillar')
        if pillar_override and pillar_override not in VALID_PILLARS:
            raise ValidationError(f"Invalid pillar: {pillar_override}")

        bounty_type = data.get('bounty_type', 'open')
        if bounty_type not in VALID_BOUNTY_TYPES:
            raise ValidationError(f"Invalid bounty type: {bounty_type}")

        try:
            max_participants = int(data.get('max_participants', 0))
        except (TypeError, ValueError) as _exc:
            raise ValidationError("Max participants must be a number") from _exc
        if max_participants < 0 or max_participants > MAX_PARTICIPANTS_CAP:
            raise ValidationError(f"Max participants must be between 0 and {MAX_PARTICIPANTS_CAP}")

        deadline = self._parse_deadline(data.get('deadline'))
        if not deadline:
            deadline = (datetime.now(timezone.utc) + timedelta(days=365)).isoformat()

        # Build sponsor info from poster (one lookup also serves org validation)
        OPTIO_LOGO = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'
        OPTIO_USERS = ['tanner bowman']

        poster_org_id = None
        poster_is_superadmin = False
        sponsor = data.get('sponsor')
        poster = self.repository.client.table('users') \
            .select('display_name, first_name, last_name, role, organization_id') \
            .eq('id', poster_id).execute()
        if poster.data:
            user_data = poster.data[0]
            poster_org_id = user_data.get('organization_id')
            poster_is_superadmin = user_data.get('role') == 'superadmin'
            if not sponsor:
                full_name = f"{user_data.get('first_name', '')} {user_data.get('last_name', '')}".strip()
                is_optio = poster_is_superadmin or full_name.lower() in OPTIO_USERS
                if is_optio:
                    sponsor = {'name': 'Optio', 'logo_url': OPTIO_LOGO}
                else:
                    name = user_data.get('display_name') or full_name or 'Anonymous'
                    sponsor = {'name': name}

        self._validate_org_fields(
            poster_org_id, poster_is_superadmin,
            data.get('organization_id'), data.get('cohort_class_id'),
        )

        # Allowed student IDs (for family visibility targeting specific kids).
        # Intersect with the poster's actual relationships so an observer
        # linked to student A can't post a "family" bounty with
        # allowed_student_ids=[A, B] and trip a notification for unrelated
        # student B. Superadmin gets a None sentinel (skip intersect).
        allowed_student_ids = data.get('allowed_student_ids')
        if allowed_student_ids is not None:
            if not isinstance(allowed_student_ids, list):
                allowed_student_ids = None
            else:
                allowed_student_ids = [s for s in allowed_student_ids if isinstance(s, str) and s.strip()]
                if allowed_student_ids:
                    posters_students = self._get_posters_student_ids(poster_id)
                    if posters_students is not None:
                        allowed_student_ids = [s for s in allowed_student_ids if s in posters_students]
                if not allowed_student_ids:
                    allowed_student_ids = None

        bounty_data = {
            'poster_id': poster_id,
            'title': data['title'].strip(),
            'description': data['description'].strip(),
            'requirements': requirements_text,
            'deliverables': deliverables,
            'rewards': rewards,
            'pillar': pillar_override or primary_pillar or 'stem',
            'bounty_type': bounty_type,
            'xp_reward': total_xp,
            'max_participants': max_participants,
            'deadline': deadline,
            'status': 'active',
            'moderation_status': 'manually_approved',
            'visibility': visibility,
            'allowed_student_ids': allowed_student_ids,
            'sponsored_reward': sponsor,
            'organization_id': data.get('organization_id'),
            # Optional cohort restriction (The Treehouse "differentiate boards by
            # cohort"): when set, only students enrolled in this org_class see it.
            'cohort_class_id': data.get('cohort_class_id') or None,
            # Who this is for. 'staff' bounties are teacher training bonuses and
            # never appear on a student board; anything unspecified stays a
            # student bounty, which is every bounty that existed before this.
            'audience': audience,
        }

        bounty = self.repository.create_bounty(bounty_data)
        logger.info(f"Bounty '{data['title']}' created by {poster_id[:8]} with {len(deliverables)} deliverables")

        # Notify target students (family-visibility bounties only — avoids spamming on public bounties)
        if visibility == 'family' and allowed_student_ids:
            try:
                import threading
                from services.notification_service import NotificationService

                def _notify():
                    try:
                        ns = NotificationService()
                        poster_name = (sponsor or {}).get('name') or 'Someone'
                        for sid in allowed_student_ids:
                            try:
                                ns.notify_bounty_posted(
                                    student_id=sid,
                                    bounty_title=bounty['title'],
                                    poster_name=poster_name,
                                    bounty_id=bounty['id'],
                                    organization_id=bounty.get('organization_id'),
                                )
                            except Exception as inner:
                                logger.warning(f"bounty_posted notify failed for {sid[:8]}: {inner}")
                    except Exception as e:
                        logger.warning(f"bounty_posted notify thread failed: {e}")

                threading.Thread(target=_notify, daemon=True).start()
            except Exception as e:
                logger.warning(f"Failed to start bounty_posted notify thread: {e}")

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
            try:
                max_p = int(data['max_participants'])
            except (TypeError, ValueError) as _exc:
                raise ValidationError("Max participants must be a number") from _exc
            updates['max_participants'] = max(0, min(MAX_PARTICIPANTS_CAP, max_p))

        if 'deadline' in data:
            parsed = self._parse_deadline(data['deadline'])
            if parsed:
                updates['deadline'] = parsed

        if 'cohort_class_id' in data:
            cohort_id = data['cohort_class_id'] or None
            if cohort_id:
                poster_row = self.repository.client.table('users') \
                    .select('organization_id, role').eq('id', bounty['poster_id']).execute()
                p = (poster_row.data or [{}])[0]
                self._validate_org_fields(p.get('organization_id'),
                                          p.get('role') == 'superadmin', None, cohort_id)
            updates['cohort_class_id'] = cohort_id

        if 'visibility' in data:
            if data['visibility'] not in ('public', 'organization', 'family'):
                raise ValidationError(f"Invalid visibility: {data['visibility']}")
            # Same invariant as create: a staff bounty is a school's internal
            # business and must never leave 'organization' visibility.
            if (bounty.get('audience') or 'students') == 'staff' and data['visibility'] != 'organization':
                raise ValidationError("Staff bounties must use 'organization' visibility")
            updates['visibility'] = data['visibility']

        if 'allowed_student_ids' in data:
            val = data['allowed_student_ids']
            if val is None or (isinstance(val, list) and len(val) == 0):
                updates['allowed_student_ids'] = None
            elif isinstance(val, list):
                filtered = [s for s in val if isinstance(s, str) and s.strip()]
                # Intersect against the poster's actual relationships — same
                # rule as create_bounty so an update can't smuggle in
                # unrelated student IDs.
                if filtered:
                    posters_students = self._get_posters_student_ids(bounty['poster_id'])
                    if posters_students is not None:
                        filtered = [s for s in filtered if s in posters_students]
                updates['allowed_student_ids'] = filtered if filtered else None
            else:
                updates['allowed_student_ids'] = None

        if 'deliverables' in data:
            deliverables_raw = data['deliverables']
            if not isinstance(deliverables_raw, list) or not deliverables_raw:
                raise ValidationError("At least one deliverable is required")

            # Preserve existing deliverable IDs wherever possible. Claims key
            # their completed-deliverable sets and evidence on these IDs, so
            # minting fresh UUIDs on every edit silently wiped every claimant's
            # progress and made their evidence unreachable.
            existing = bounty.get('deliverables') or []
            by_id = {d['id']: d for d in existing if isinstance(d, dict) and d.get('id')}
            by_text = {d.get('text', '').strip(): d['id'] for d in existing
                       if isinstance(d, dict) and d.get('id')}

            deliverables = []
            for item in deliverables_raw:
                if isinstance(item, str):
                    text, item_id = item.strip(), None
                else:
                    text = str(item.get('text', '')).strip()
                    item_id = item.get('id')
                if not text:
                    continue
                if item_id and item_id in by_id:
                    keep_id = item_id
                elif text in by_text:
                    keep_id = by_text[text]
                else:
                    keep_id = str(uuid.uuid4())
                deliverables.append({'id': keep_id, 'text': text})

            if not deliverables:
                raise ValidationError("At least one non-empty deliverable is required")

            updates['deliverables'] = deliverables
            updates['requirements'] = '\n'.join(f"- {d['text']}" for d in deliverables)

        if 'rewards' in data:
            built = self._build_rewards(data['rewards'])
            updates['rewards'] = built['rewards']
            updates['xp_reward'] = built['total_xp']
            if built['primary_pillar']:
                updates['pillar'] = built['primary_pillar']

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

    def get_bounty_for_viewer(self, bounty_id: str, viewer_id: str) -> Dict[str, Any]:
        """Get bounty details, enforcing visibility for the viewer.

        The claim path always ran _student_can_access_bounty; the read path
        didn't, so any authenticated user could read any bounty by id —
        including a family bounty's allowed_student_ids and moderation notes.
        404 rather than 403, matching the claim path: an invisible bounty
        simply isn't there.
        """
        bounty = self.get_bounty(bounty_id)
        if not self._student_can_access_bounty(viewer_id, bounty):
            raise NotFoundError(f"Bounty {bounty_id} not found")
        return bounty

    def get_bounty_detail(self, bounty_id: str, viewer_id: str) -> Dict[str, Any]:
        """Bounty detail for a viewer: visibility-checked, and enriched with
        claims + student names + latest reviews when the viewer is the poster
        or a superadmin."""
        bounty = self.get_bounty_for_viewer(bounty_id, viewer_id)
        if bounty['poster_id'] == viewer_id or self.is_superadmin(viewer_id):
            return self._enrich_bounties_with_claims([bounty])[0]
        return bounty

    @staticmethod
    def _deadline_passed(bounty: Dict[str, Any]) -> bool:
        """Whether the bounty's deadline is in the past. Malformed/missing
        deadlines count as open — legacy rows must not vanish from boards."""
        raw = bounty.get('deadline')
        if not raw:
            return False
        try:
            deadline = datetime.fromisoformat(str(raw).replace('Z', '+00:00'))
            if deadline.tzinfo is None:
                deadline = deadline.replace(tzinfo=timezone.utc)
            return deadline < datetime.now(timezone.utc)
        except (TypeError, ValueError):
            return False

    def _get_connected_poster_ids(self, user_id: str, user_parent_id: Optional[str] = None) -> set:
        """The set of adults connected to this student — the posters whose
        family-visibility bounties the student may see. Mirrors
        _get_posters_student_ids from the viewer's side:
          - their managing parent (managed_by_parent_id, dependents)
          - parents with an approved parent_student_links row (13+ kids)
          - observers linked via observer_student_links
        """
        connected: set = set()
        if user_parent_id:
            connected.add(user_parent_id)
        client = self.repository.client
        try:
            links = client.table('parent_student_links').select('parent_user_id')\
                .eq('student_user_id', user_id).eq('status', 'approved').execute()
            connected.update(l['parent_user_id'] for l in (links.data or []))
        except Exception as _exc:
            logger.debug("parent-link lookup failed: %s", _exc, exc_info=True)
        try:
            obs_links = client.table('observer_student_links')\
                .select('observer_id').eq('student_id', user_id).execute()
            connected.update(l['observer_id'] for l in (obs_links.data or []))
        except Exception as _exc:
            logger.debug("observer-link lookup failed: %s", _exc, exc_info=True)
        return connected

    def list_bounties(self, user_id: str, pillar: Optional[str] = None, bounty_type: Optional[str] = None) -> List[Dict[str, Any]]:
        """List active bounties visible to the user, with optional filters."""
        all_bounties = self.repository.list_active_bounties(pillar=pillar, bounty_type=bounty_type)

        # Get user info for visibility filtering (org_role too: org-managed staff
        # carry their real role there, and it decides which board they see).
        user_result = self.repository.client.table('users').select(
            'id, role, org_role, org_roles, organization_id, managed_by_parent_id'
        ).eq('id', user_id).execute()

        if not user_result.data:
            return [b for b in all_bounties if b.get('visibility') == 'public']

        user = user_result.data[0]
        user_org_id = user.get('organization_id')
        is_superadmin = user.get('role') == 'superadmin'

        # Split the two boards before anything else: staff training bounties are
        # not student content, and student bounties are not staff work. A
        # superadmin sees whichever board they asked for rather than both mixed.
        wanted_audience = 'staff' if self._is_staff_user(user) else 'students'
        all_bounties = [b for b in all_bounties
                        if (b.get('audience') or 'students') == wanted_audience
                        or (is_superadmin and b['poster_id'] == user_id)]

        # Adults connected to this user (managing parent, approved parent
        # links, observers) — their family-visibility bounties are visible.
        connected_poster_ids = self._get_connected_poster_ids(
            user_id, user.get('managed_by_parent_id')
        )

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
                # Posted by any adult connected to this user (managing parent,
                # approved parent link, or observer link)
                elif b['poster_id'] in connected_poster_ids:
                    # If allowed_student_ids is set, only those specific kids can see it
                    allowed = b.get('allowed_student_ids')
                    if allowed and isinstance(allowed, list):
                        if user_id in allowed:
                            visible.append(b)
                    else:
                        # No restriction -- all linked kids/students see it
                        visible.append(b)
            elif b['poster_id'] == user_id:
                # Poster always sees their own bounties
                visible.append(b)
            elif is_superadmin:
                visible.append(b)

        # Cohort restriction (The Treehouse): a bounty tagged with cohort_class_id
        # is only shown to students enrolled in that org_class. The poster and
        # superadmin always see it. Bounties with no cohort are unaffected.
        cohort_ids = {b['cohort_class_id'] for b in visible if b.get('cohort_class_id')}
        if cohort_ids:
            try:
                enr = self.repository.client.table('class_enrollments')\
                    .select('class_id').eq('student_id', user_id).eq('status', 'active').execute()
                my_cohorts = {e['class_id'] for e in (enr.data or [])}
            except Exception:
                my_cohorts = set()
            visible = [
                b for b in visible
                if not b.get('cohort_class_id')
                or is_superadmin
                or b['poster_id'] == user_id
                or b['cohort_class_id'] in my_cohorts
            ]

        # A bounty past its deadline stays visible to its poster (their review
        # queue may still hold submissions) but leaves everyone else's board.
        visible = [b for b in visible
                   if not self._deadline_passed(b)
                   or b['poster_id'] == user_id
                   or is_superadmin]

        # L1 (org setting): an org can hide platform-wide "public" bounties from its
        # students so School Jobs shows only org/cohort-scoped jobs. The poster and
        # superadmin are never filtered. Bounties from the user's own org stay visible.
        if user_org_id and not is_superadmin:
            try:
                org = self.repository.client.table('organizations')\
                    .select('feature_flags').eq('id', user_org_id).single().execute()
                flags = (org.data or {}).get('feature_flags') or {}
            except Exception:
                flags = {}
            if flags.get('hide_public_bounties'):
                visible = [
                    b for b in visible
                    if b.get('visibility') != 'public'
                    or b.get('organization_id') == user_org_id
                    or b['poster_id'] == user_id
                ]

        return visible

    def get_my_posted_with_claims(self, poster_id: str) -> List[Dict[str, Any]]:
        """Get bounties posted by user, each enriched with its claims and student info."""
        bounties = self.repository.get_poster_bounties(poster_id)
        return self._enrich_bounties_with_claims(bounties)

    def delete_bounty(self, bounty_id: str, user_id: str) -> None:
        """Delete a bounty (poster or superadmin). Tells students with a live
        claim before their work disappears — deletion cascades claims and
        reviews, and previously did so silently."""
        bounty = self.get_bounty(bounty_id)
        if bounty['poster_id'] != user_id and not self.is_superadmin(user_id):
            raise ValidationError("Only the poster or superadmin can delete this bounty")

        claims = self.repository.get_bounty_claims(bounty_id)
        affected = [c['student_id'] for c in claims
                    if c.get('status') in ('claimed', 'submitted', 'revision_requested')
                    and c.get('student_id')]

        self.repository.delete_bounty(bounty_id)
        logger.info(f"Bounty {bounty_id[:8]} deleted by {user_id[:8]} ({len(affected)} live claims)")

        if affected:
            try:
                import threading
                from services.notification_service import NotificationService

                def _notify():
                    try:
                        ns = NotificationService()
                        for sid in affected:
                            try:
                                ns.create_notification(
                                    user_id=sid,
                                    notification_type='announcement',
                                    title='Bounty Removed',
                                    message=f'The bounty "{bounty["title"]}" was taken down by its poster, so it no longer needs your work.',
                                    link='/bounties',
                                    metadata={'bounty_id': bounty_id},
                                )
                            except Exception as inner:
                                logger.warning(f"bounty-deleted notify failed for {sid[:8]}: {inner}")
                    except Exception as e:
                        logger.warning(f"bounty-deleted notify thread failed: {e}")

                threading.Thread(target=_notify, daemon=True).start()
            except Exception as e:
                logger.warning(f"Failed to start bounty-deleted notify thread: {e}")

    # ── bounty evidence lives in `quest-evidence`, same as task evidence ─────
    #
    # It just hangs off a different shape: claim.evidence.deliverable_evidence
    # is {deliverable_id: [{type, content}, ...]}, and each of those entries is
    # block-shaped, so PortfolioService's block helpers apply once the entries
    # are flattened out of the nested dict.

    @staticmethod
    def _claim_evidence_items(claims) -> List[Dict[str, Any]]:
        """Every ``{type, content}`` evidence entry across one or more claims."""
        if isinstance(claims, dict):
            claims = [claims]
        items: List[Dict[str, Any]] = []
        for claim in (claims or []):
            if not isinstance(claim, dict):
                continue
            evidence = claim.get('evidence') or {}
            for entries in (evidence.get('deliverable_evidence') or {}).values():
                items.extend(e for e in (entries or []) if isinstance(e, dict))
        return items

    @classmethod
    def _sign_claim_evidence(cls, claims):
        """Serve signed, never public: the media behind a claim is a minor's
        work in a private bucket. One batched call for the whole list."""
        from services.portfolio_service import PortfolioService

        items = cls._claim_evidence_items(claims)
        if items:
            PortfolioService().sign_evidence_blocks(items)
        return claims

    @classmethod
    def _canonicalize_evidence_entries(cls, entries) -> List[Dict[str, Any]]:
        """Reduce client-supplied evidence entries to canonical pointers.

        The upload endpoints hand the client a signed twin for its preview and
        the claim form posts it straight back. Persisting that would store a URL
        that dies with the TTL — and `_create_bounty_learning_event` would then
        copy the dying URL on into learning_event_evidence_blocks.
        """
        from services.portfolio_service import PortfolioService

        for entry in (entries or []):
            if isinstance(entry, dict) and isinstance(entry.get('content'), dict):
                PortfolioService.canonical_block_content(entry['content'])
        return entries or []

    def _attach_latest_reviews(self, claims: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Attach the most recent review (decision + feedback) to each claim.

        Reviewer feedback was written to bounty_reviews and then never read
        back — the only place a student ever saw it was inside a notification
        string. One batched query for the whole page.
        """
        claim_ids = [c['id'] for c in claims if c.get('id')]
        if not claim_ids:
            return claims
        try:
            rows = (self.repository.client.table('bounty_reviews')
                    .select('claim_id, decision, feedback, created_at')
                    .in_('claim_id', claim_ids)
                    .order('created_at', desc=True)
                    .execute()).data or []
        except Exception as e:
            logger.warning(f"Could not attach bounty reviews: {e}")
            rows = []
        latest: Dict[str, Dict] = {}
        for r in rows:  # newest-first, so first wins
            latest.setdefault(r['claim_id'], {
                'decision': r.get('decision'),
                'feedback': r.get('feedback'),
                'created_at': r.get('created_at'),
            })
        for c in claims:
            c['latest_review'] = latest.get(c.get('id'))
        return claims

    def _enrich_bounties_with_claims(self, bounties: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Enrich a list of bounties with claims and student info."""
        # One batched claims query for the page, not one per bounty.
        claims_by_bounty = self.repository.get_claims_for_bounties(
            [b['id'] for b in bounties]
        )
        all_student_ids: set = set()
        for bounty in bounties:
            bounty['claims'] = claims_by_bounty.get(bounty['id'], [])
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
        all_claims = [claim for bounty in bounties for claim in bounty['claims']]
        self._attach_latest_reviews(all_claims)
        # One signing call for every claim on the page, not one per claim.
        self._sign_claim_evidence(all_claims)
        return bounties

    def get_my_claims_with_bounties(self, student_id: str) -> List[Dict[str, Any]]:
        """Get claims by student, each enriched with its bounty data and the
        latest review (so a student can read the reviewer's feedback)."""
        claims = self.repository.get_student_claims(student_id)
        bounty_ids = list({c['bounty_id'] for c in claims if c.get('bounty_id')})
        bounty_map: Dict[str, Dict] = {}
        if bounty_ids:
            try:
                rows = (self.repository.client.table('bounties')
                        .select('*').in_('id', bounty_ids).execute()).data or []
                bounty_map = {b['id']: b for b in rows}
            except Exception as e:
                logger.warning(f"Batch bounty fetch failed, claims will lack bounty data: {e}")
        for claim in claims:
            claim['bounty'] = bounty_map.get(claim.get('bounty_id'))
        self._attach_latest_reviews(claims)
        return self._sign_claim_evidence(claims)

    def _student_can_access_bounty(self, student_id: str, bounty: Dict[str, Any]) -> bool:
        """Whether a student may see/claim a bounty under its visibility rules.
        Mirrors the list_bounties filter so a direct link can't bypass it."""
        vis = bounty.get('visibility', 'public')
        if vis == 'public' or bounty['poster_id'] == student_id:
            return True

        try:
            user_result = self.repository.client.table('users').select(
                'id, role, organization_id, managed_by_parent_id'
            ).eq('id', student_id).execute()
        except Exception:
            return False
        if not user_result.data:
            return False
        user = user_result.data[0]

        if user.get('role') == 'superadmin':
            return True

        if vis == 'organization':
            return bool(user.get('organization_id')
                        and bounty.get('organization_id') == user.get('organization_id'))

        if vis == 'family':
            connected = self._get_connected_poster_ids(student_id, user.get('managed_by_parent_id'))
            if bounty['poster_id'] not in connected:
                return False
            allowed = bounty.get('allowed_student_ids')
            if allowed and isinstance(allowed, list):
                return student_id in allowed
            return True

        return False

    @staticmethod
    def _is_staff_user(user: Dict[str, Any]) -> bool:
        """Teacher, coordinator or org admin — the people staff bounties are for.
        Org-managed users carry their real role in org_roles (array, canonical)
        with org_role as the legacy scalar; check both, the way
        get_effective_roles does, or a teacher carried on org_roles alone lands
        on the student board and can claim family bounties."""
        STAFF = ('advisor', 'org_admin', 'campus_coordinator')
        role = user.get('role')
        if role in STAFF:
            return True
        if role == 'org_managed':
            org_roles = user.get('org_roles') or []
            if user.get('org_role'):
                org_roles = list(org_roles) + [user['org_role']]
            return any(r in STAFF for r in org_roles)
        return False

    def _audience_matches_claimer(self, claimer_id: str, bounty: Dict[str, Any]) -> bool:
        """Whether this person is who the bounty was posted for.

        Staff can claim bounties since 2026-07-28 (teacher training bonuses), so
        audience is what keeps the two boards apart: a teacher must not be able
        to claim the bounty a parent posted for their own child, and a student
        must not pick up staff training. Superadmins bypass, as everywhere else.
        """
        audience = (bounty.get('audience') or 'students').strip().lower()
        user = None
        try:
            rows = (self.repository.client.table('users')
                    .select('role, org_role, org_roles').eq('id', claimer_id).execute()).data
            if isinstance(rows, list) and rows:
                user = rows[0]
        except Exception:
            logger.warning('Could not resolve claimer role for audience check', exc_info=True)

        if user and user.get('role') == 'superadmin':
            return True
        # An unresolvable role counts as "not staff": that still lets a student
        # claim a student bounty, and refuses a staff bounty to anyone we cannot
        # positively identify as staff, which is the direction that matters.
        is_staff = self._is_staff_user(user) if user else False
        return is_staff if audience == 'staff' else not is_staff

    def claim_bounty(self, bounty_id: str, student_id: str) -> Dict[str, Any]:
        """Claim a bounty. `student_id` is the claimer — a student, or (for
        audience='staff' training bounties) a teacher or org admin."""
        bounty = self.repository.get_bounty_by_id(bounty_id)
        if not bounty:
            raise NotFoundError(f"Bounty {bounty_id} not found")

        if bounty['status'] != 'active':
            raise ValidationError("Bounty is not active")

        # Enforce visibility: a claimer can only claim a bounty they can see
        # on their board (family bounties from their own adults, org bounties
        # from their own org). Prevents claiming via a shared direct link.
        if not self._student_can_access_bounty(student_id, bounty):
            raise NotFoundError(f"Bounty {bounty_id} not found")

        # 404 rather than 403: a staff bounty simply isn't on a student's board.
        if not self._audience_matches_claimer(student_id, bounty):
            raise NotFoundError(f"Bounty {bounty_id} not found")

        if self._deadline_passed(bounty):
            raise ValidationError("This bounty's deadline has passed")

        # A rejected claim used to be a permanent dead end: it can't be edited
        # or dropped, and the (bounty_id, student_id) unique constraint blocked
        # re-claiming — the DB unique violation surfaced as a raw 500 on a
        # double-tap. Re-open a rejected claim instead, and give everything
        # else a readable error.
        existing = self.repository.get_claim_by_bounty_and_student(bounty_id, student_id)
        if existing:
            if existing['status'] == 'rejected':
                reopened = self.repository.update_claim_status(existing['id'], 'claimed')
                logger.info(f"Student {student_id[:8]} re-opened rejected claim {existing['id'][:8]}")
                return reopened
            raise ValidationError("You've already claimed this bounty")

        # Check capacity (0 = unlimited)
        max_p = bounty.get('max_participants', 0)
        if max_p > 0:
            current_claims = self.repository.count_bounty_claims(bounty_id)
            if current_claims >= max_p:
                raise ValidationError("Bounty has reached maximum participants")

        claim = self.repository.create_claim(bounty_id, student_id)
        logger.info(f"Student {student_id[:8]} claimed bounty {bounty_id[:8]}")

        # Notify poster
        try:
            import threading
            from services.notification_service import NotificationService

            def _notify():
                try:
                    ns = NotificationService()
                    student_result = self.repository.client.table('users') \
                        .select('display_name, first_name, last_name') \
                        .eq('id', student_id).execute()
                    student_name = 'A student'
                    if student_result.data:
                        s = student_result.data[0]
                        student_name = s.get('display_name') or \
                            f"{s.get('first_name', '')} {s.get('last_name', '')}".strip() or \
                            'A student'
                    ns.notify_bounty_claimed(
                        poster_id=bounty['poster_id'],
                        student_name=student_name,
                        bounty_title=bounty['title'],
                        bounty_id=bounty_id,
                        claim_id=claim['id'],
                        organization_id=bounty.get('organization_id'),
                    )
                except Exception as e:
                    logger.warning(f"bounty_claimed notify failed: {e}")

            threading.Thread(target=_notify, daemon=True).start()
        except Exception as e:
            logger.warning(f"Failed to start bounty_claimed notify thread: {e}")

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

        # Require evidence when completing. Filter to well-formed entries first:
        # a bare [{}] used to satisfy the check, and a dict payload would be
        # iterated by keys and splice bare strings into the JSONB.
        if completed:
            if not isinstance(deliverable_evidence, list):
                raise ValidationError("Evidence must be a list of evidence items")
            deliverable_evidence = [
                e for e in deliverable_evidence
                if isinstance(e, dict) and e.get('type') and e.get('content')
            ]
            if not deliverable_evidence:
                raise ValidationError("At least one piece of evidence is required to complete a deliverable")

        # Update completed deliverables list and evidence
        evidence = claim.get('evidence') or {}
        completed_ids = list(evidence.get('completed_deliverables', []))
        all_evidence = dict(evidence.get('deliverable_evidence', {}))

        if completed:
            if deliverable_id not in completed_ids:
                completed_ids.append(deliverable_id)
            # Append new evidence to existing evidence for this deliverable.
            # Reduce the incoming entries to canonical pointers first: the
            # client posts back whatever it was handed, and after the read paths
            # above it is holding the SIGNED twin.
            existing = list(all_evidence.get(deliverable_id, []))
            existing.extend(self._canonicalize_evidence_entries(deliverable_evidence))
            all_evidence[deliverable_id] = existing
        elif not completed and deliverable_id in completed_ids:
            completed_ids.remove(deliverable_id)
            # Keep evidence even when uncompleting

        evidence['completed_deliverables'] = completed_ids
        evidence['deliverable_evidence'] = all_evidence

        # Just update evidence -- student must explicitly "Turn in" to submit
        updated = self.repository.update_claim_evidence(claim_id, evidence)
        return self._sign_claim_evidence(updated)

    def abandon_claim(self, claim_id: str, student_id: str, bounty_id: str) -> None:
        """Student drops a bounty they claimed, before turning it in. Removes the
        claim so the student is no longer signed up and capacity frees up."""
        claim = self.repository.get_claim(claim_id)
        if not claim:
            raise NotFoundError(f"Claim {claim_id} not found")
        if claim['student_id'] != student_id:
            raise ValidationError("You can only drop your own claims")
        if claim['status'] not in ('claimed', 'revision_requested'):
            raise ValidationError(f"Can't drop a bounty that's already '{claim['status']}'")
        self.repository.delete_claim(claim_id)
        logger.info(f"Student {student_id[:8]} dropped claim {claim_id[:8]} on bounty {bounty_id[:8]}")

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
                        # Deep-link straight to THIS student's submission in the
                        # review queue. Web reads tab=review + claim (to scroll to
                        # /highlight the card); the mobile deep-link router reads
                        # bounty + claim to open /bounties/review/<bounty>?claim=<claim>.
                        link=f'/bounties?tab=review&bounty={bounty_id}&claim={claim_id}',
                        metadata={'bounty_id': bounty_id, 'claim_id': claim_id},
                    )
                except Exception as e:
                    logger.warning(f"Failed to send bounty submission notification: {e}")

            thread = threading.Thread(target=send_notification)
            thread.daemon = True
            thread.start()
        except Exception as e:
            logger.warning(f"Failed to start notification thread: {e}")

        return self._sign_claim_evidence(updated)

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
            except Exception:
                # Also try the app's own endpoint
                try:
                    # Direct storage deletion via supabase client
                    storage = self.repository.client.storage
                    from utils.storage_urls import parse_object_ref
                    for url in urls_to_delete:
                        # parse_object_ref resolves the public, signed and
                        # legacy shapes alike. The old split() understood only
                        # the public one, so a row that had picked up a signed
                        # URL left its object orphaned in storage forever.
                        ref = parse_object_ref(url)
                        if ref:
                            storage.from_(ref[0]).remove([ref[1]])
                except Exception as e2:
                    logger.warning(f"Failed to delete storage files: {e2}")

        logger.info(f"Deleted evidence item {evidence_index} from deliverable {deliverable_id[:8]} on claim {claim_id[:8]}")
        return self._sign_claim_evidence(updated)

    def review_submission(self, claim_id: str, reviewer_id: str, decision: str, feedback: Optional[str] = None) -> Dict[str, Any]:
        """Poster reviews a submission."""
        if decision not in ('approved', 'rejected', 'revision_requested'):
            raise ValidationError(f"Invalid decision: {decision}")

        claim = self.repository.get_claim(claim_id)
        if not claim:
            raise NotFoundError(f"Claim {claim_id} not found")

        if claim['status'] != 'submitted':
            raise ValidationError("Can only review submitted claims")

        # Only the bounty's poster (or a superadmin) can review submissions.
        # Without this, the decorator's role check alone would let any
        # parent/observer act on bounties that aren't theirs.
        bounty = self.repository.get_bounty_by_id(claim['bounty_id'])
        if bounty and bounty['poster_id'] != reviewer_id and not self.is_superadmin(reviewer_id):
            raise ValidationError("Only the bounty's poster can review this submission")

        # Create review record
        review = self.repository.create_review(claim_id, reviewer_id, decision, feedback)

        # Update claim status
        updated_claim = self.repository.update_claim_status(claim_id, decision)
        updated_claim['latest_review'] = {
            'decision': decision,
            'feedback': feedback,
            'created_at': (review or {}).get('created_at'),
        }

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
                        # Link to the bounty DETAIL, not the board: web renders
                        # the claim state there, and the mobile deep-link router
                        # maps /bounties/<id> to the detail screen. The old
                        # '/bounties?tab=active' landed mobile students on the
                        # Browse-only tab — a dead end for the one notification
                        # ("revise your work") that most needs a destination.
                        detail_link = f'/bounties/{bounty["id"]}'
                        if decision == 'approved':
                            ns.create_notification(
                                user_id=claim['student_id'],
                                notification_type='task_approved',
                                title='Bounty Approved!',
                                message=f'Your submission for "{bounty["title"]}" has been approved!',
                                link=detail_link,
                                metadata={'bounty_id': bounty['id'], 'claim_id': claim_id},
                            )
                        elif decision == 'revision_requested':
                            ns.create_notification(
                                user_id=claim['student_id'],
                                notification_type='task_revision_requested',
                                title='Bounty Revision Requested',
                                message=f'The poster of "{bounty["title"]}" requested changes to your submission.' + (f' Feedback: {feedback}' if feedback else ''),
                                link=detail_link,
                                metadata={'bounty_id': bounty['id'], 'claim_id': claim_id},
                            )
                        elif decision == 'rejected':
                            # task_revision_requested, not system_alert: it is in
                            # MOBILE_PUSH_NOTIFICATION_TYPES (system_alert isn't,
                            # so rejections never pushed), it renders with the
                            # student-work icon, and rejection is now recoverable
                            # (the student can re-open the claim), so "your work
                            # needs attention" is the honest framing.
                            ns.create_notification(
                                user_id=claim['student_id'],
                                notification_type='task_revision_requested',
                                title='Bounty Submission Not Accepted',
                                message=f'Your submission for "{bounty["title"]}" was not accepted.' + (f' Feedback: {feedback}' if feedback else ''),
                                link=detail_link,
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
        return self._sign_claim_evidence(updated_claim)

    def moderate_bounty(self, bounty_id: str, moderation_status: str, notes: Optional[str] = None) -> Dict[str, Any]:
        """Admin moderates a bounty (approve/reject)."""
        if moderation_status not in ('ai_approved', 'manually_approved', 'rejected'):
            raise ValidationError(f"Invalid moderation status: {moderation_status}")

        bounty = self.repository.update_moderation_status(bounty_id, moderation_status, notes)

        # Auto-activate approved bounties
        if moderation_status in ('ai_approved', 'manually_approved'):
            bounty = self.repository.update_bounty_status(bounty_id, 'active')
        elif moderation_status == 'rejected':
            # Rejection must take the bounty DOWN. It was created status=active,
            # and writing only moderation_status left it live on every board —
            # the moderation endpoint was cosmetic.
            bounty = self.repository.update_bounty_status(bounty_id, 'rejected')

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

            # Note: XPService.award_xp already credits student_wallets per
            # award — crediting again here paid every bounty out twice in
            # spendable coin.
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
