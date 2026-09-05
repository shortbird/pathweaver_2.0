"""
Telling a class's teachers who has joined it.

iCreate, 2026-09-02: "can a teacher be notified when they get a new student
added to their class?" Students arrive by several different routes -- the office
enrolling one by hand, a family adding a class in the schedule builder,
registration completing, a waitlist offer being taken -- and none of them told
the person who has to teach the child. Teachers found out by noticing an
unfamiliar name on the register.

Best-effort and never fatal: a notification failure must not roll back an
enrollment. The actor is never notified about their own action, so a teacher who
enrolls a student on their own class page is not told about it.
"""

from typing import Optional

from database import get_supabase_admin_client
from repositories.sis_class_repository import SisClassRepository
from repositories.user_repository import UserRepository
from services import sis_notifications
from utils import class_membership as membership
from utils import person_name
from utils.logger import get_logger

logger = get_logger(__name__)


def _admin():
    # admin client justified: reads the class row and the joining student's name
    #   to address a notification to that class's teachers; reached only from
    #   enrollment write paths that have already authorized the enrollment
    return get_supabase_admin_client()


def notify_teachers_of_new_student(class_id: str, student_id: str,
                                   actor_id: Optional[str] = None) -> None:
    """Tell everyone who teaches this class that `student_id` has joined it."""
    try:
        client = _admin()
        cls = SisClassRepository(client=client).find_by_id(class_id)
        if not cls:
            return

        teachers = membership.class_teacher_ids(class_id, class_row=cls) - {actor_id}
        # A student enrolling themselves, or a teacher adding to their own class,
        # leaves nobody to tell.
        if not teachers:
            return

        profiles = UserRepository(client=client).find_by_ids(
            [student_id], select_fields='id, first_name, last_name, display_name')
        student = person_name.full_name(profiles.get(student_id), fallback='A student')
        class_name = cls.get('name') or 'your class'

        # One NotificationService for the fan-out: its constructor builds a fresh
        # Supabase client each time, and this runs inside the request the family
        # is waiting on.
        service = sis_notifications.shared_service()
        for teacher_id in teachers:
            sis_notifications.notify(
                teacher_id,
                'New student in your class',
                f'{student} joined {class_name}.',
                link=f'/my-classes/{class_id}',
                organization_id=cls.get('organization_id'),
                metadata={'class_id': class_id, 'student_id': student_id,
                          'event': 'class_enrollment'},
                service=service,
            )
    except Exception as e:  # noqa: BLE001 — never break an enrollment over a notice
        logger.warning(f'Could not alert teachers of enrollment in {class_id}: {e}')
