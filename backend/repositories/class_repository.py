"""
Class Repository - Data access for organization classes

Provides database operations for:
- Organization classes (org_classes)
- Class advisors (class_advisors)
- Class enrollments (class_enrollments)
- Class quests (class_quests)
"""

from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from repositories.base_repository import BaseRepository
from database import get_supabase_admin_client
from utils.logger import get_logger
from utils.validation.sanitizers import pgrst_timestamp
from utils.db_fetch import fetch_all_rows

logger = get_logger(__name__)


class ClassRepository(BaseRepository):
    """Repository for organization class data access"""

    table_name = 'org_classes'

    def __init__(self, user_id: Optional[str] = None):
        super().__init__(user_id)
        self._admin_client = None

    @property
    def admin_client(self):
        """Get admin client for operations that bypass RLS"""
        if self._admin_client is None:
            # admin client justified: repository layer — default client for data-access methods; callers should inject a user client when RLS scoping is required
            self._admin_client = get_supabase_admin_client()
        return self._admin_client

    # ===== Class CRUD =====

    def get_class_with_details(self, class_id: str) -> Optional[Dict[str, Any]]:
        """Get class with organization details"""
        response = self.admin_client.table(self.table_name)\
            .select('*, organizations(id, name, slug)')\
            .eq('id', class_id)\
            .maybe_single()\
            .execute()
        return response.data if response and response.data else None

    def list_org_classes(
        self,
        org_id: str,
        status: str = 'active',
        include_counts: bool = True
    ) -> List[Dict[str, Any]]:
        """List all classes for an organization with optional counts"""
        query = self.admin_client.table(self.table_name)\
            .select('*')\
            .eq('organization_id', org_id)

        if status:
            query = query.eq('status', status)

        query = query.order('created_at', desc=True)
        response = query.execute()
        classes = response.data if response.data else []

        if include_counts and classes:
            # Get counts for each class
            for cls in classes:
                cls['student_count'] = self._get_enrollment_count(cls['id'])
                cls['quest_count'] = self._get_quest_count(cls['id'])
                cls['advisor_count'] = self._get_advisor_count(cls['id'])

        return classes

    def create_class(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Create a new class"""
        response = self.admin_client.table(self.table_name)\
            .insert(data)\
            .execute()
        if not response.data:
            raise Exception("Failed to create class")
        logger.info(f"Created class: {response.data[0]['id']}")
        return response.data[0]

    def update_class(self, class_id: str, data: Dict[str, Any]) -> Dict[str, Any]:
        """Update class details"""
        response = self.admin_client.table(self.table_name)\
            .update(data)\
            .eq('id', class_id)\
            .execute()
        if not response.data:
            raise Exception(f"Failed to update class {class_id}")
        return response.data[0]

    def archive_class(self, class_id: str) -> Dict[str, Any]:
        """Archive a class (soft delete). Withdraws its active enrollments too:
        an archived class is hidden from families, so an enrollment left active
        in one reads as "busy at this time" to schedule-conflict checks while
        the family sees nothing to drop (phantom Expressions conflict,
        iCreate 2026-08-24). Rows are kept (withdrawn), not deleted."""
        self.admin_client.table('class_enrollments')\
            .update({'status': 'withdrawn'})\
            .eq('class_id', class_id)\
            .eq('status', 'active')\
            .execute()
        return self.update_class(class_id, {'status': 'archived'})

    def restore_class(self, class_id: str) -> Dict[str, Any]:
        """Un-archive a class (status back to active)."""
        return self.update_class(class_id, {'status': 'active'})

    # ===== Advisor Management =====

    def get_class_advisors(self, class_id: str) -> List[Dict[str, Any]]:
        """Get all advisors for a class"""
        response = self.admin_client.table('class_advisors')\
            .select('*, users!advisor_id(id, email, display_name, first_name, last_name)')\
            .eq('class_id', class_id)\
            .eq('is_active', True)\
            .order('assigned_at', desc=True)\
            .execute()
        return response.data if response.data else []

    def add_advisor(
        self,
        class_id: str,
        advisor_id: str,
        assigned_by: str
    ) -> Dict[str, Any]:
        """Add an advisor to a class"""
        data = {
            'class_id': class_id,
            'advisor_id': advisor_id,
            'assigned_by': assigned_by,
            'is_active': True
        }
        response = self.admin_client.table('class_advisors')\
            .upsert(data, on_conflict='class_id,advisor_id')\
            .execute()
        if not response.data:
            raise Exception("Failed to add advisor")
        return response.data[0]

    def remove_advisor(self, class_id: str, advisor_id: str) -> bool:
        """Remove an advisor from a class (soft delete)"""
        response = self.admin_client.table('class_advisors')\
            .update({'is_active': False})\
            .eq('class_id', class_id)\
            .eq('advisor_id', advisor_id)\
            .execute()
        return bool(response.data)

    def get_advisor_classes(self, advisor_id: str, status: str = 'active') -> List[Dict[str, Any]]:
        """Get all classes an advisor teaches.

        A teacher reaches a class through any of the three sources
        `utils.class_membership` documents — primary_instructor_id,
        assistant_instructor_ids, or an active class_advisors row. The SIS
        assigns instructors via the org_classes columns and never writes
        class_advisors, so reading the link table alone showed SIS teachers
        an empty class list on /dashboard.
        """
        from utils.class_membership import teacher_class_ids

        class_ids = list(teacher_class_ids(advisor_id))
        if not class_ids:
            return []

        classes: List[Dict[str, Any]] = []
        for chunk in (class_ids[i:i + 100] for i in range(0, len(class_ids), 100)):
            query = self.admin_client.table('org_classes')\
                .select('*, organizations(id, name, slug)')\
                .in_('id', chunk)
            if status is not None:
                query = query.eq('status', status)
            classes.extend(query.execute().data or [])

        # Keep the legacy `assignment` block for classes that do have a
        # class_advisors row; SIS-assigned classes simply omit it.
        assignments = self.admin_client.table('class_advisors')\
            .select('class_id, assigned_at, assigned_by')\
            .eq('advisor_id', advisor_id)\
            .eq('is_active', True)\
            .execute().data or []
        by_class = {a['class_id']: a for a in assignments}
        for cls in classes:
            assignment = by_class.get(cls['id'])
            if assignment:
                cls['assignment'] = {
                    'assigned_at': assignment.get('assigned_at'),
                    'assigned_by': assignment.get('assigned_by'),
                }

        return classes

    def is_class_advisor(self, class_id: str, user_id: str) -> bool:
        """Check if a user teaches a class — as primary instructor, assistant
        instructor, or an active class_advisors row (see get_advisor_classes)."""
        from utils.class_membership import class_teacher_ids

        return user_id in class_teacher_ids(class_id)

    # ===== Student Enrollment =====

    def get_class_students(self, class_id: str, status: str = 'active') -> List[Dict[str, Any]]:
        """Get all students enrolled in a class"""
        query = self.admin_client.table('class_enrollments')\
            .select('*, users!student_id(id, email, display_name, first_name, last_name, total_xp)')\
            .eq('class_id', class_id)

        if status:
            query = query.eq('status', status)

        query = query.order('enrolled_at', desc=True)
        response = query.execute()
        return response.data if response.data else []

    def enroll_student(
        self,
        class_id: str,
        student_id: str,
        enrolled_by: str
    ) -> Dict[str, Any]:
        """Enroll a student in a class"""
        data = {
            'class_id': class_id,
            'student_id': student_id,
            'enrolled_by': enrolled_by,
            'status': 'active'
        }
        response = self.admin_client.table('class_enrollments')\
            .upsert(data, on_conflict='class_id,student_id')\
            .execute()
        if not response.data:
            raise Exception("Failed to enroll student")
        return response.data[0]

    def enroll_students_bulk(
        self,
        class_id: str,
        student_ids: List[str],
        enrolled_by: str
    ) -> List[Dict[str, Any]]:
        """Enroll multiple students in a class"""
        data = [
            {
                'class_id': class_id,
                'student_id': sid,
                'enrolled_by': enrolled_by,
                'status': 'active'
            }
            for sid in student_ids
        ]
        response = self.admin_client.table('class_enrollments')\
            .upsert(data, on_conflict='class_id,student_id')\
            .execute()
        return response.data if response.data else []

    def withdraw_student(self, class_id: str, student_id: str) -> bool:
        """Withdraw a student from a class"""
        response = self.admin_client.table('class_enrollments')\
            .update({'status': 'withdrawn'})\
            .eq('class_id', class_id)\
            .eq('student_id', student_id)\
            .execute()
        return bool(response.data)

    def update_enrollment_status(
        self,
        class_id: str,
        student_id: str,
        status: str,
        completed_at: Optional[str] = None
    ) -> Dict[str, Any]:
        """Update a student's enrollment status"""
        data = {'status': status}
        if completed_at:
            data['completed_at'] = completed_at
        response = self.admin_client.table('class_enrollments')\
            .update(data)\
            .eq('class_id', class_id)\
            .eq('student_id', student_id)\
            .execute()
        if not response.data:
            raise Exception("Failed to update enrollment status")
        return response.data[0]

    def get_student_enrollments(self, student_id: str, status: str = 'active') -> List[Dict[str, Any]]:
        """Get all classes a student is enrolled in"""
        query = self.admin_client.table('class_enrollments')\
            .select('*, org_classes(*)')\
            .eq('student_id', student_id)

        if status:
            query = query.eq('status', status)

        response = query.execute()
        return response.data if response.data else []

    # ===== Quest Management =====

    def get_class_quests(self, class_id: str, only_published: bool = False) -> List[Dict[str, Any]]:
        """
        Get all quests assigned to a class.

        Args:
            class_id: Class ID
            only_published: When True (student view), hide quests whose publish_at is
                still in the future. A NULL publish_at always counts as visible now.
                Teachers/admins pass False to see scheduled quests too.
        """
        query = self.admin_client.table('class_quests')\
            .select('*, quests(id, title, description, quest_type, is_active)')\
            .eq('class_id', class_id)

        if only_published:
            now_iso = datetime.now(timezone.utc).isoformat()
            query = query.or_(
                f'publish_at.is.null,publish_at.lte.{pgrst_timestamp(now_iso, "publish_at")}'
            )

        response = query.order('sequence_order').execute()
        return response.data if response.data else []

    def set_quest_schedule(self, class_id: str, quest_id: str, publish_at: Optional[str]) -> Optional[Dict[str, Any]]:
        """Set or clear (publish_at=None) the scheduled publish time for a class quest."""
        response = self.admin_client.table('class_quests')\
            .update({'publish_at': publish_at})\
            .eq('class_id', class_id)\
            .eq('quest_id', quest_id)\
            .execute()
        return response.data[0] if response.data else None

    def set_quest_due_date(self, class_id: str, quest_id: str, due_date: Optional[str]) -> Optional[Dict[str, Any]]:
        """Set or clear (due_date=None) the due date for a class quest."""
        response = self.admin_client.table('class_quests')\
            .update({'due_date': due_date})\
            .eq('class_id', class_id)\
            .eq('quest_id', quest_id)\
            .execute()
        return response.data[0] if response.data else None

    def get_student_agenda(self, student_id: str) -> List[Dict[str, Any]]:
        """
        Upcoming due dates for a student across their active class enrollments.

        Only includes quests that are visible to the student (publish_at NULL or
        already passed) and that have a due_date. Sorted by due date ascending.
        """
        enrollments = self.admin_client.table('class_enrollments')\
            .select('class_id')\
            .eq('student_id', student_id)\
            .eq('status', 'active')\
            .execute()
        class_ids = [e['class_id'] for e in (enrollments.data or [])]
        if not class_ids:
            return []

        classes = self.admin_client.table('org_classes')\
            .select('id, name')\
            .in_('id', class_ids)\
            .execute()
        class_names = {c['id']: c['name'] for c in (classes.data or [])}

        now_iso = datetime.now(timezone.utc).isoformat()
        rows = self.admin_client.table('class_quests')\
            .select('class_id, quest_id, due_date, publish_at, quests(id, title, description, header_image_url)')\
            .in_('class_id', class_ids)\
            .not_.is_('due_date', 'null')\
            .or_(f'publish_at.is.null,publish_at.lte.{pgrst_timestamp(now_iso, "publish_at")}')\
            .order('due_date')\
            .execute()

        agenda = []
        for r in (rows.data or []):
            quest = r.get('quests') or {}
            agenda.append({
                'class_id': r['class_id'],
                'class_name': class_names.get(r['class_id']),
                'quest_id': r['quest_id'],
                'title': quest.get('title'),
                'description': quest.get('description'),
                'header_image_url': quest.get('header_image_url'),
                'due_date': r.get('due_date'),
            })
        return agenda

    def add_quest(
        self,
        class_id: str,
        quest_id: str,
        added_by: str,
        sequence_order: int = 0
    ) -> Dict[str, Any]:
        """Add a quest to a class"""
        data = {
            'class_id': class_id,
            'quest_id': quest_id,
            'added_by': added_by,
            'sequence_order': sequence_order
        }
        response = self.admin_client.table('class_quests')\
            .upsert(data, on_conflict='class_id,quest_id')\
            .execute()
        if not response.data:
            raise Exception("Failed to add quest")
        return response.data[0]

    def remove_quest(self, class_id: str, quest_id: str) -> bool:
        """Remove a quest from a class"""
        response = self.admin_client.table('class_quests')\
            .delete()\
            .eq('class_id', class_id)\
            .eq('quest_id', quest_id)\
            .execute()
        return bool(response.data)

    def reorder_quests(self, class_id: str, quest_ids: List[str]) -> List[Dict[str, Any]]:
        """Reorder quests in a class"""
        results = []
        for order, quest_id in enumerate(quest_ids):
            response = self.admin_client.table('class_quests')\
                .update({'sequence_order': order})\
                .eq('class_id', class_id)\
                .eq('quest_id', quest_id)\
                .execute()
            if response.data:
                results.extend(response.data)
        return results

    def get_class_quest_ids(self, class_id: str) -> List[str]:
        """Get just the quest IDs for a class"""
        response = self.admin_client.table('class_quests')\
            .select('quest_id')\
            .eq('class_id', class_id)\
            .execute()
        return [q['quest_id'] for q in response.data] if response.data else []

    # ===== Progress Calculation =====

    def get_student_class_xp(self, class_id: str, student_id: str) -> int:
        """Calculate total XP earned by a student for quests in a class"""
        # Get quest IDs in this class
        quest_ids = self.get_class_quest_ids(class_id)
        if not quest_ids:
            return 0

        # Sum XP from completions for these quests (join to user_quest_tasks for xp_value)
        response = self.admin_client.table('quest_task_completions')\
            .select('user_quest_task_id, user_quest_tasks(xp_value)')\
            .eq('user_id', student_id)\
            .in_('quest_id', quest_ids)\
            .execute()

        if not response.data:
            return 0

        return sum((c.get('user_quest_tasks', {}) or {}).get('xp_value', 0) or 0 for c in response.data)

    def get_class_progress_bulk(self, class_id: str) -> List[Dict[str, Any]]:
        """Get progress for all students in a class"""
        # Get class details
        cls = self.find_by_id(class_id)
        if not cls:
            return []

        # `or 0` not a .get() default: the column is nullable, so an absent
        # threshold arrives as None, not as a missing key, and None fails the
        # `> 0` comparison below with a TypeError.
        xp_threshold = cls.get('xp_threshold') or 0

        # Get all students
        students = self.get_class_students(class_id)
        if not students:
            return []

        # Get quest IDs for this class
        quest_ids = self.get_class_quest_ids(class_id)

        # Calculate progress for each student
        results = []
        for enrollment in students:
            student = enrollment.get('users', {})
            student_id = student.get('id') or enrollment.get('student_id')

            earned_xp = 0
            if quest_ids:
                response = self.admin_client.table('quest_task_completions')\
                    .select('user_quest_task_id, user_quest_tasks(xp_value)')\
                    .eq('user_id', student_id)\
                    .in_('quest_id', quest_ids)\
                    .execute()
                if response.data:
                    earned_xp = sum((c.get('user_quest_tasks', {}) or {}).get('xp_value', 0) or 0 for c in response.data)

            # A class with no threshold never auto-completes. `earned_xp >= 0`
            # is vacuously true, which put all 31 of Arete's Chesapeake students
            # under a green "Completed" header the day they were enrolled.
            # calculate_student_class_progress was fixed for this on 2026-08-28
            # (test_class_zero_threshold_completion.py); this bulk path, the one
            # the Students tab actually reads, was missed.
            percentage = min(100, int((earned_xp / xp_threshold) * 100)) if xp_threshold > 0 else 0
            is_complete = xp_threshold > 0 and earned_xp >= xp_threshold

            results.append({
                'student_id': student_id,
                'student': student,
                'enrollment': {
                    'status': enrollment.get('status'),
                    'enrolled_at': enrollment.get('enrolled_at'),
                    'completed_at': enrollment.get('completed_at')
                },
                'progress': {
                    'earned_xp': earned_xp,
                    'xp_threshold': xp_threshold,
                    'percentage': percentage,
                    'is_complete': is_complete
                }
            })

        return results

    def get_class_activity(
        self,
        class_id: str,
        start_date: str,
        end_date: str
    ) -> List[Dict[str, Any]]:
        """
        What every student on the roster finished inside a date window.

        Deliberately NOT scoped to the class's assigned quests, unlike
        get_class_progress_bulk. A class here is as often a group of students as
        it is a syllabus — Arete's Chesapeake carries 31 students and no assigned
        quests at all — so scoping to class_quests reports a flat zero for a
        roster that has been working all week. An advisor running Friday
        check-ins wants what each student actually did, wherever the quest came
        from.

        Returns one entry per enrolled student, including students with nothing
        in the window: "who did nothing this week" is the question a check-in
        list has to answer, so an empty row is a result, not an omission.
        """
        roster = self.get_class_students(class_id)
        if not roster:
            return []

        students = {}
        order = []
        for enrollment in roster:
            user = enrollment.get('users') or {}
            student_id = user.get('id') or enrollment.get('student_id')
            if not student_id or student_id in students:
                continue
            students[student_id] = {
                'student_id': student_id,
                'student': user,
                'xp': 0,
                'tasks_completed': 0,
                'quests': {},
                'last_activity': None,
            }
            order.append(student_id)

        start = pgrst_timestamp(f"{start_date}T00:00:00", 'start_date')
        end = pgrst_timestamp(f"{end_date}T23:59:59", 'end_date')

        # Paged: a week of completions across a full roster is unbounded — it
        # grows with class size and with how much the students did — and a
        # silent truncation here would under-report a student's week as
        # confidently as it would report it right.
        completions = fetch_all_rows(lambda: (
            self.admin_client.table('quest_task_completions')
            .select('id, user_id, quest_id, completed_at, '
                    'user_quest_tasks(title, xp_value, pillar)')
            .in_('user_id', list(students.keys()))
            .gte('completed_at', start)
            .lte('completed_at', end)
        ))

        quest_titles = self._quest_titles({c.get('quest_id') for c in completions})

        for completion in completions:
            entry = students.get(completion.get('user_id'))
            if entry is None:
                continue

            task = completion.get('user_quest_tasks') or {}
            xp = task.get('xp_value') or 0
            completed_at = completion.get('completed_at')

            entry['xp'] += xp
            entry['tasks_completed'] += 1
            if completed_at and (entry['last_activity'] is None
                                 or completed_at > entry['last_activity']):
                entry['last_activity'] = completed_at

            quest_id = completion.get('quest_id')
            quest = entry['quests'].get(quest_id)
            if quest is None:
                quest = {
                    'quest_id': quest_id,
                    # `quest_id` is Optional off a dict .get, while
                    # _quest_titles returns Dict[str, str]. Runtime was
                    # always fine -- a None key just misses and falls to
                    # the default -- but mypy is right that the lookup
                    # is untyped. Same result, stated explicitly.
                    'title': (quest_titles.get(quest_id) if quest_id
                              else None) or 'Self-directed work',
                    'xp': 0,
                    'tasks': [],
                }
                entry['quests'][quest_id] = quest
            quest['xp'] += xp
            quest['tasks'].append({
                'title': task.get('title') or 'Untitled task',
                'xp': xp,
                'pillar': task.get('pillar'),
                'completed_at': completed_at,
            })

        results = []
        for student_id in order:
            entry = students[student_id]
            quests = sorted(entry['quests'].values(),
                            key=lambda q: q['xp'], reverse=True)
            for quest in quests:
                quest['tasks'].sort(key=lambda t: t['completed_at'] or '')
            entry['quests'] = quests
            results.append(entry)

        results.sort(key=lambda s: s['xp'], reverse=True)
        return results

    def _quest_titles(self, quest_ids) -> Dict[str, str]:
        """Titles for a set of quest ids.

        A separate read rather than a PostgREST embed: quest_task_completions
        has no foreign key on quest_id (only user_quest_task_id and the reviewer
        columns are constrained), so `quests(title)` will not resolve as a
        nested select. Bounded by the distinct quests one class touched in one
        window.
        """
        ids = [qid for qid in quest_ids if qid]
        if not ids:
            return {}
        response = self.admin_client.table('quests')\
            .select('id, title')\
            .in_('id', ids)\
            .execute()
        return {q['id']: q.get('title') for q in (response.data or [])}

    # ===== Helper Methods =====

    def _get_enrollment_count(self, class_id: str) -> int:
        """Get count of active enrollments"""
        response = self.admin_client.table('class_enrollments')\
            .select('id', count='exact')\
            .eq('class_id', class_id)\
            .eq('status', 'active')\
            .execute()
        return response.count if response.count else 0

    def _get_quest_count(self, class_id: str) -> int:
        """Get count of quests in class"""
        response = self.admin_client.table('class_quests')\
            .select('id', count='exact')\
            .eq('class_id', class_id)\
            .execute()
        return response.count if response.count else 0

    def _get_advisor_count(self, class_id: str) -> int:
        """Get count of active advisors"""
        response = self.admin_client.table('class_advisors')\
            .select('id', count='exact')\
            .eq('class_id', class_id)\
            .eq('is_active', True)\
            .execute()
        return response.count if response.count else 0

    # ===== Authorization Helpers =====

    def is_enrolled_student(self, class_id: str, student_id: str) -> bool:
        """Check if a user is enrolled in a class as a student"""
        response = self.admin_client.table('class_enrollments')\
            .select('id')\
            .eq('class_id', class_id)\
            .eq('student_id', student_id)\
            .eq('status', 'active')\
            .execute()
        return bool(response.data)

    @staticmethod
    def _role_set(user_role) -> set:
        """Accept either one role or every role the account holds.

        Callers used to pass a single string resolved from `org_roles[0]`, which
        is an arbitrary pick: an org admin who is also listed as an advisor
        resolved to 'advisor' and lost the org_admin branch below, so she was
        refused a class in her own organization (Sentry OPTIO-WEB-F). Both
        shapes are accepted so no call site can silently keep the old
        one-role-wins behaviour.
        """
        if user_role is None:
            return set()
        if isinstance(user_role, str):
            return {user_role}
        return {r for r in user_role if r}

    def can_user_access_class(self, class_id: str, user_id: str, user_role, user_org_id: Optional[str]) -> bool:
        """Check if a user can access a class.

        `user_role` may be a single role or an iterable of every role the caller
        holds; each branch below is checked against all of them.
        """
        roles = self._role_set(user_role)

        # Superadmin can access everything
        if 'superadmin' in roles:
            return True

        # Get class
        cls = self.find_by_id(class_id)
        if not cls:
            return False

        # Org admins (and campus coordinators, who run the campus) can access
        # classes in their org -- class management is operational, not financial
        # (sis_roles.ADMIN_ROLES). Tested against the whole role set, never a
        # single collapsed role: see routes/classes/_caller.py.
        if roles & {'org_admin', 'campus_coordinator'} and user_org_id == cls.get('organization_id'):
            return True

        # Advisors can access classes they're assigned to
        if self.is_class_advisor(class_id, user_id):
            return True

        # Students can access classes they're enrolled in
        if 'student' in roles and self.is_enrolled_student(class_id, user_id):
            return True

        return False

    def can_user_manage_class(self, class_id: str, user_id: str, user_role, user_org_id: Optional[str]) -> bool:
        """Check if a user can manage (modify) a class"""
        # Same as access for now - advisors have full management of their classes
        return self.can_user_access_class(class_id, user_id, user_role, user_org_id)
