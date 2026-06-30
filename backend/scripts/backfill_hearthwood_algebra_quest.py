"""One-off: backfill a course quest (with the org logo as header image) for
Sam Student's seeded Algebra I OEA credit. Mirrors routes/oea._ensure_course_quest."""
from database import get_supabase_admin_client
from repositories.oea_repository import OEARepository

STUDENT_ID = 'b20c68fe-1f3f-4301-ba87-fc2e991b8536'

client = get_supabase_admin_client()
repo = OEARepository(client=client)

rows = client.table('oea_credits').select('*') \
    .eq('student_id', STUDENT_ID).eq('course_name', 'Algebra I').execute().data or []
if not rows:
    raise SystemExit('Algebra I credit not found')
credit = rows[0]
if credit.get('quest_id'):
    print('already has quest', credit['quest_id'])
    raise SystemExit(0)

quest_id = repo.create_course_quest(STUDENT_ID, credit['course_name'], 'Math')
repo.update_credit(credit['id'], {'quest_id': quest_id})

q = client.table('quests').select('id, title, header_image_url, metadata') \
    .eq('id', quest_id).execute().data[0]
print('created quest', quest_id)
print('title:', q['title'])
print('header_image_url set:', bool(q.get('header_image_url')))
print('metadata:', q.get('metadata'))
