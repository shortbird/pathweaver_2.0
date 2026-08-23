"""
Seed the CRM funnels from the archived Brevo nurture content (CRM plan PR3/PR6).

Reads docs/marketing/brevo_email_html/*.html, normalizes Brevo template tokens
to the CRM's ({{ contact.FIRSTNAME | default : "there" }} -> {{first_name}},
{{ unsubscribe }} -> {{unsubscribe_url}}), rewrites the two Brevo-hosted badge
images to self-hosted copies (frontend/public/email-assets/, deployed at
www.optioeducation.com/email-assets/), and upserts funnels + steps.

Idempotent: funnels upsert on key, steps on (funnel key, step_order); step
CONTENT is only written when the step is new or --overwrite is passed, so
console edits survive re-runs. All funnels seed as status='paused' — activation
is a deliberate admin/API action after the cutover checklist clears.

Cadences and subjects mirror docs/marketing/brevo_email_copy.md (the actual
live cadence, not the original plan).

Usage:
    cd backend && python scripts/seed_crm_funnels.py [--overwrite]
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

HTML_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(
    os.path.abspath(__file__)))), 'docs', 'marketing', 'brevo_email_html')

IMAGE_REWRITES = {
    'https://img.mailinblue.com/11613506/images/rnb/original/6a4d5b9a3cb1d1ad25463b47.png':
        'https://www.optioeducation.com/email-assets/badge-app-store.png',
    'https://img.mailinblue.com/11613506/images/rnb/original/6a4d5b9b2adfaedf2a9521f7.png':
        'https://www.optioeducation.com/email-assets/badge-google-play.png',
}

FIRSTNAME_TOKEN = re.compile(r'\{\{\s*contact\.FIRSTNAME[^}]*\}\}')
UNSUB_TOKEN = re.compile(r'\{\{\s*unsubscribe\s*\}\}')

# (funnel key, name, type, entry_types, [(file, subject, name, delay_hours)])
FUNNELS = [
    ('free_class_nurture', 'Free Class Nurture', 'nurture', ['claim_free_class'], [
        ('01-nurture-1-getting-set-up.html', 'Getting your free class set up', 'Getting set up', 1),
        ('02-nurture-2-already-doing-the-work.html', "You're probably already doing the work", 'Already doing the work', 48),
        ('03-nurture-3-will-your-school-accept-it.html', 'Will your school actually accept it?', 'Will your school accept it', 96),
        ('49-nurture-3b-diploma-pathways.html', 'This can go all the way to a diploma', 'Diploma pathways', 120),
        ('04-nurture-4-what-a-class-looks-like.html', 'What an Optio class actually looks like', 'What a class looks like', 168),
        ('05-nurture-5-details-for-parents.html', 'The details your parents will ask about', 'Details for parents', 240),
        ('06-nurture-6-keep-it-open.html', 'Should I keep your free class open?', 'Keep it open', 336),
    ]),
    ('families_nurture', 'Families Nurture', 'nurture', ['families'], [
        ('08-families-welcome.html', 'Your questions about Optio, answered directly', 'Questions answered', 1),
        ('33-families-2-day-to-day.html', 'What Optio looks like day to day', 'Day to day', 96),
        ('34-families-3-first-class-free.html', 'The first class is free', 'First class free', 192),
    ]),
    ('general_interest_nurture', 'General Interest Nurture', 'nurture',
     ['demo', 'general', 'course_purchase'], [
        ('24-general-interest-1-info-you-asked-for.html', 'The info you asked for', 'Info you asked for', 1),
        ('25-general-interest-2-already-doing-the-work.html', "They're probably already doing the work", 'Already doing the work', 72),
        ('26-general-interest-3-does-it-count.html', 'Does it actually count?', 'Does it count', 144),
        ('27-general-interest-4-worth-trying.html', "Worth trying while it's free", 'Worth trying', 240),
    ]),
    ('new_account_welcome', 'New Account Welcome', 'onboarding', [], [
        ('35-welcome-1-how-to-start.html', "You're in. Here's how to start.", 'How to start', 1),
        ('36-welcome-2-one-task-at-a-time.html', 'One task at a time', 'One task at a time', 72),
        ('37-welcome-3-what-your-work-adds-up-to.html', 'What your work adds up to', 'What it adds up to', 168),
    ]),
    ('course_student_onboarding', 'Course Student Onboarding', 'onboarding', [], [
        ('45-course-onboarding-1-it-works-differently.html', 'Welcome to Optio. It works a little differently.', 'It works differently', 24),
        ('46-course-onboarding-2-how-your-course-works.html', 'How your course works', 'How your course works', 72),
        ('47-course-onboarding-3-why-lessons-are-short.html', 'Why the lessons are so short', 'Why lessons are short', 144),
        ('48-course-onboarding-4-what-tasks-add-up-to.html', 'What all your tasks add up to', 'What tasks add up to', 240),
    ]),
]


def normalize(html: str) -> str:
    html = FIRSTNAME_TOKEN.sub('{{first_name}}', html)
    html = UNSUB_TOKEN.sub('{{unsubscribe_url}}', html)
    for old, new in IMAGE_REWRITES.items():
        html = html.replace(old, new)
    return html


def _client():
    """Direct service-role client (standalone-script pattern: importing the
    app's database module drags in the whole Flask import graph)."""
    from dotenv import load_dotenv
    from supabase import create_client
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(
        os.path.abspath(__file__))), '.env'))
    url = os.getenv('SUPABASE_URL')
    key = os.getenv('SUPABASE_SERVICE_ROLE_KEY') or os.getenv('SUPABASE_SERVICE_KEY')
    if not url or not key:
        print('ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
        sys.exit(1)
    return create_client(url, key)


def main():
    overwrite = '--overwrite' in sys.argv
    db = _client()

    leftover = re.compile(r'img\.mailinblue\.com')
    for key, name, funnel_type, entry_types, steps in FUNNELS:
        existing = (db.table('crm_funnels').select('id')
                    .eq('key', key).limit(1).execute()).data
        if existing:
            funnel_id = existing[0]['id']
            db.table('crm_funnels').update({
                'name': name, 'funnel_type': funnel_type,
                'entry_types': entry_types,
            }).eq('id', funnel_id).execute()
            print(f'= funnel {key} (exists)')
        else:
            funnel_id = (db.table('crm_funnels').insert({
                'key': key, 'name': name, 'funnel_type': funnel_type,
                'entry_types': entry_types, 'status': 'paused',
            }).execute()).data[0]['id']
            print(f'+ funnel {key} (paused)')

        for order, (filename, subject, step_name, delay_hours) in enumerate(steps, start=1):
            path = os.path.join(HTML_DIR, filename)
            with open(path, encoding='utf-8') as f:
                html = normalize(f.read())
            if leftover.search(html):
                print(f'  WARNING: {filename} still references img.mailinblue.com')
            row = (db.table('crm_funnel_steps').select('id')
                   .eq('funnel_id', funnel_id).eq('step_order', order)
                   .limit(1).execute()).data
            if row and not overwrite:
                db.table('crm_funnel_steps').update({
                    'delay_hours': delay_hours, 'name': step_name,
                }).eq('id', row[0]['id']).execute()
                print(f'  = step {order} {step_name} (content kept)')
                continue
            payload = {
                'funnel_id': funnel_id, 'step_order': order, 'name': step_name,
                'subject': subject, 'html_body': html, 'delay_hours': delay_hours,
            }
            if row:
                db.table('crm_funnel_steps').update(payload).eq('id', row[0]['id']).execute()
                print(f'  ~ step {order} {step_name} (content overwritten)')
            else:
                db.table('crm_funnel_steps').insert(payload).execute()
                print(f'  + step {order} {step_name} ({delay_hours}h)')

    print('\nDone. All funnels are paused until activated via the admin console.')


if __name__ == '__main__':
    main()
