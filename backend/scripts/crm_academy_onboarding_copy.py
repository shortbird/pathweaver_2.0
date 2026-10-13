"""
Optio Academy onboarding emails (2026-10-12): the parent welcome and the
student welcome, as CRM funnel steps.

Funnels are data, edited in /admin/crm after they exist. This script is the
first draft and its record: it prints SQL that replaces the steps of
`academy_parent_welcome` and creates `academy_student_welcome` (paused).
Run it, read the SQL, apply it through the Supabase MCP or psql:

    python backend/scripts/crm_academy_onboarding_copy.py > /tmp/onboarding.sql

Blocks like {{#if high_school}}...{{/if}} vary with the family's registration
answers; crm_registration_segments.SEGMENTS lists the names. Apply only after
the engine that renders them is deployed: an older engine leaves the tags in
the email as text.
"""
import json
import sys

VIDEO_URL = 'https://www.youtube.com/watch?v=shFaO_tDBjQ'
VIDEO_THUMB = 'https://img.youtube.com/vi/shFaO_tDBjQ/hqdefault.jpg'
BOOKING_URL = 'https://calendar.app.google/nnJP1nZiDhHLp4Tq8'
APP = 'https://app.optioeducation.com'
DOCS = 'https://www.optioeducation.com/docs'
IOS = 'https://apps.apple.com/us/app/optio-education/id6773061928'
ANDROID = 'https://play.google.com/store/apps/details?id=com.optioeducation.optio'
SOCIAL = [
    ('YouTube', 'https://www.youtube.com/@OptioEducation'),
    ('Facebook', 'https://www.facebook.com/profile.php?id=61578980574451'),
    ('Instagram', 'https://www.instagram.com/optio_education/'),
    ('TikTok', 'https://www.tiktok.com/@optioeducation'),
]
PURPLE = '#6D469B'


def p(text):
    return f'<p>{text}</p>'


def link(text, url):
    return f'<a href="{url}" style="color:{PURPLE};">{text}</a>'


def button(text, url):
    return ('<p style="margin:28px 0;text-align:center;">'
            f'<a href="{url}" style="display:inline-block;background:{PURPLE};color:#ffffff;'
            'text-decoration:none;font-weight:600;font-size:17px;padding:14px 30px;'
            f'border-radius:8px;">{text}</a></p>')


def video(caption):
    return ('<p style="margin:24px 0;text-align:center;">'
            f'<a href="{VIDEO_URL}"><img src="{VIDEO_THUMB}" alt="Watch: how Optio works" '
            'width="480" style="max-width:100%;border-radius:8px;border:0;"></a><br>'
            f'<span style="font-size:14px;color:#6b7280;">{caption}</span></p>')


def only(segment, html, unless=False):
    tag = 'unless' if unless else 'if'
    return f'{{{{#{tag} {segment}}}}}{html}{{{{/{tag}}}}}'


def help_box(audience='parent'):
    """The same short help block on every email: where to ask, how fast I
    answer, and where Optio posts."""
    who = ('Message Optio Support in the app: click Messages, then Optio Support. '
           'Or reply to this email.')
    if audience == 'student':
        who = ('Message Optio Support in the app: click Messages, then Optio Support. '
               'Your parents can reply to this email too.')
    social = ' &middot; '.join(link(name, url) for name, url in SOCIAL)
    return ('<div style="margin-top:28px;padding:16px;background:#f5f3f8;border-radius:8px;font-size:15px;">'
            f'<p style="margin:0 0 8px;"><strong>Need help?</strong> {who} '
            'I answer within one school day.</p>'
            f'<p style="margin:0;">Follow Optio: {social}</p></div>')


def wrap(body, audience='parent'):
    return ('<div style="max-width:560px;margin:0 auto;font-family:-apple-system,\'Segoe UI\','
            'Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;padding:24px;">\n'
            + body + '\n<p>Dr. Bowman<br><span style="color:#6b7280;font-size:14px;">'
            'Head of School, Optio Academy</span></p>\n' + help_box(audience) + '\n</div>\n')


ACCREDITATION = ('Optio Academy is accredited by the Accrediting Commission for Schools, '
                 'Western Association of Schools and Colleges (ACS WASC), 533 Airport Blvd., '
                 'Suite 200, Burlingame, CA 94010, ' + link('www.acswasc.org', 'https://www.acswasc.org') + '.')

PARENT_STEPS = [
    {
        'name': 'Welcome', 'delay_hours': 0,
        'subject': 'Welcome to Optio Academy',
        'html': wrap('\n'.join([
            p('Hi {{first_name}}, this is Dr. Bowman, Head of School at Optio Academy. '
              'Your registration for {{student_names}} is complete. Welcome.'),
            p('This short video shows how Optio works. It is the best place to start.'),
            video('How Optio works'),
            p('<strong>Your first step.</strong> Sit down with {{student_names}} for twenty minutes this week. '
              'Start one class around something they already do, like cooking, a sport, a book, or a build. '
              'Add two or three small tasks, and finish one. A task is finished when it has evidence: '
              'a photo, a video, or a few sentences about what they did.'),
            button('Open your Family page', f'{APP}/family'),
            only('prior_school', p(
                'You listed a current or most recent school. If {{student_names}} earned high school credit '
                'there, it can count toward the Optio Academy diploma. Upload the transcript or report card on '
                'the ' + link('Prior Learning page', f'{APP}/family/prior-learning') + ': click Optio Academy '
                'in the left menu, then Prior Learning.')),
            only('teacher_interest', p(
                'You said you are interested in an Optio teacher. I sent you a separate email with how '
                'that works and what it costs.')),
            only('teacher_added', p(
                'You added an Optio teacher. I will email you this week to set up the first weekly video call.')),
            # OpenEd families buy through OpenEd and never see a price.
            only('opened', p('<strong>What you pay.</strong> If you pay for Optio Academy yourself, the program is {{price.academyTuitionMonthly}} a '
              'month for each student, and never more than {{price.academyFamilyCapMonthly}} a month for a family. '
              + only('teacher_added', 'A student with an Optio teacher is {{price.fullTimeMonthly}} a month, and that includes '
                     'their {{price.academyTuitionMonthly}}. ')
              + 'Stripe charges the payment method you entered once a month. To stop at any time, email me at '
              + link('tanner@optioeducation.com', 'mailto:tanner@optioeducation.com') + '.'), unless=True),
        ])),
    },
    {
        'name': 'Signing in', 'delay_hours': 24,
        'subject': 'How {{student_names}} signs in to Optio',
        'html': wrap('\n'.join([
            p('Hi {{first_name}}, Dr. Bowman again. Today is about getting set up.'),
            p('Optio works in a web browser at ' + link('app.optioeducation.com', APP)
              + ' and in the Optio app for ' + link('iPhone', IOS) + ' and ' + link('Android', ANDROID) + '.'),
            only('own_login', p(
                '<strong>Students with their own email.</strong> We sent them an email to set a password. '
                'If it did not arrive, check the spam folder, or message Optio Support and I will send a new one.')),
            only('managed_login', p(
                '<strong>Students without their own email.</strong> They do not have a sign-in yet, and that '
                'is fine for young students. You can add their work for them from your Family page. When they '
                'are ready for their own sign-in, open your Family page, click Family settings, choose the '
                'student, and add an email in the Login section.')),
            p('<strong>Your Family page</strong> is where you follow along. It shows what each student is '
              'working on, what they finished, and anything that needs your attention.'),
            button('Open your Family page', f'{APP}/family'),
            p('This guide shows where everything is: '
              + link('Getting started as a parent', f'{DOCS}/for-parents/getting-started-as-a-parent-on-optio') + '.'),
        ])),
    },
    {
        'name': 'How Optio works', 'delay_hours': 72,
        'subject': 'How Optio works',
        'html': wrap('\n'.join([
            p('Hi {{first_name}}, Dr. Bowman here. Here is how Optio works, in four parts.'),
            p('<strong>Tasks.</strong> Everything happens in tasks. A task is one real thing your student '
              'does: a lab, an essay, a practice session, a repair.'),
            p('<strong>Evidence.</strong> A task is finished when it has evidence of the work: a photo, a '
              'video, a file, or a few sentences.'),
            p('<strong>XP.</strong> Each finished task earns XP in a subject, like Math or Fine Arts. XP is '
              'how progress adds up.'),
            p('<strong>Portfolio.</strong> Every finished task goes into a portfolio, a record of what your '
              'student did, in their own words and pictures. It is private unless you choose to share it.'),
            p('We say "the process is the goal." Your student learns by doing real things, and the record '
              'builds itself while they work. Nobody grades them along the way.'),
            p('<strong>Safety.</strong> Only family, their teachers, school staff, and Optio Support can '
              'message your student. Messages between students are checked before they are delivered, and '
              'you hear about anything that is held back.'),
            p('More detail: ' + link('Tasks, evidence, and XP', f'{DOCS}/high-school-classes/tasks-evidence-and-xp') + '.'),
        ])),
    },
    {
        'name': 'Credit and records', 'delay_hours': 120,
        'subject': only('high_school', 'How the work becomes high school credit')
                   + only('high_school', 'How your student\'s progress is recorded', unless=True),
        'html': wrap('\n'.join([
            p('Hi {{first_name}}, Dr. Bowman again.'),
            only('high_school', '\n'.join([
                p('<strong>High school credit.</strong> Every 2,000 XP in a subject is one credit. An Optio '
                  'teacher reviews the work before the credit goes on the Optio Academy transcript. The '
                  'diploma takes 24 credits across subjects like Language Arts, Math, Science, and Social '
                  'Studies. About six credits a year is a normal pace.'),
                p('<strong>Credit from another school.</strong> If your student earned high school credit '
                  'somewhere else, it can count. Upload the transcript on the '
                  + link('Prior Learning page', f'{APP}/family/prior-learning')
                  + ': click Optio Academy in the left menu, then Prior Learning.'),
            ])),
            only('k8', p(
                '<strong>Kindergarten to 8th grade.</strong> Each finished task earns XP in a subject, and the '
                'portfolio keeps the work by subject. That gives you a clear record of what your student '
                'learned this year, with real examples, to show anyone who asks.')),
            p(ACCREDITATION),
            p('You can see all of it from your Family page: '
              + link('Portfolio, credits, and transcript',
                     f'{DOCS}/for-parents/your-childs-portfolio-credits-and-transcript') + '.'),
        ])),
    },
    {
        'name': 'First-week check-in', 'delay_hours': 192,
        'subject': 'How is the first week going?',
        'html': wrap('\n'.join([
            p('Hi {{first_name}}, Dr. Bowman here. {{student_names}} has had a week with Optio Academy, so I '
              'want to check in.'),
            p('If they finished a task, the hard part is done. Keep the pace small and steady.'),
            p('If they have not started yet, that is common. Pick the smallest real thing they did this week, '
              'like a recipe, a practice session, or a repair, and make it the first task.'),
            only('teacher_interest', p(
                'You asked about an Optio teacher. If you want to talk it over, book a call with me.')
                + button('Book a 30-minute call', BOOKING_URL)),
            only('teacher_added', p(
                'How are the calls with your Optio teacher going? If anything should change, reply and tell me.')),
            only('teacher_none', p(
                'Some families want more structure. An Optio teacher meets your student on a weekly video call '
                'and gives feedback on the work. '
                + only('opened', 'It is {{price.fullTimeMonthly}} a month, and that includes the '
                       '{{price.academyTuitionMonthly}} program fee. ', unless=True)
                + 'If you want to talk about it, or anything else, '
                + link('book a call with me', BOOKING_URL) + '.')),
        ])),
    },
    {
        'name': 'Bring the family in', 'delay_hours': 504,
        'subject': 'Let the grandparents see the work',
        'html': wrap('\n'.join([
            p('Hi {{first_name}}, Dr. Bowman here. Students do more when people they love see the work.'),
            p('You can invite grandparents, aunts, uncles, or friends as observers. They see what your '
              'student finishes. They cannot change anything.'),
            p('To invite one: open your Family page, click Family settings, then Observers, and create a '
              'link. Each link is for one person and works for seven days.'),
            button('Invite an observer', f'{APP}/family?settings=observers'),
            p('You can also follow Optio on '
              + link('YouTube', SOCIAL[0][1]) + ', ' + link('Instagram', SOCIAL[2][1]) + ', '
              + link('Facebook', SOCIAL[1][1]) + ', and ' + link('TikTok', SOCIAL[3][1]) + '. '
              'If you know a family who would like Optio, the video is an easy thing to send them: '
              + link('How Optio works', VIDEO_URL) + '.'),
        ])),
    },
    {
        'name': 'One month in', 'delay_hours': 720,
        'subject': 'One month at Optio Academy',
        'html': wrap('\n'.join([
            p('Hi {{first_name}}, Dr. Bowman here. {{student_names}} has been at Optio Academy for a month.'),
            p('I want to know how it is going. Reply with one sentence about what works and one about what '
              'does not. I read every reply, and families shape what I build next.'),
            p('If you would rather talk, book a call with me.'),
            button('Book a 30-minute call', BOOKING_URL),
        ])),
    },
]

STUDENT_STEPS = [
    {
        'name': 'Welcome', 'delay_hours': 0,
        'subject': 'Welcome to Optio Academy, {{first_name}}',
        'html': wrap('\n'.join([
            p('Hi {{first_name}}, I am Dr. Bowman, the Head of School at Optio Academy. Welcome.'),
            p('At Optio, the things you actually do count as school. Building, writing, cooking, coding, '
              'training, making music: when you capture it, it counts.'),
            video('How Optio works'),
            p('<strong>Do this today.</strong> Start a class about something you already care about. Add a '
              'few small tasks. Finish one by adding evidence: a photo, a video, or a few sentences about what '
              'you did.'),
            button('Open Optio', APP),
            p('Optio is also an app for ' + link('iPhone', IOS) + ' and ' + link('Android', ANDROID) + '.'),
        ]), audience='student'),
    },
    {
        'name': 'How your work adds up', 'delay_hours': 72,
        'subject': 'How your work adds up',
        'html': wrap('\n'.join([
            p('Hi {{first_name}}, Dr. Bowman again.'),
            p('Every task you finish earns XP in a subject, like Science or Fine Arts, and goes into your '
              'portfolio. Your portfolio is the record of what you did, in your own words and pictures.'),
            only('high_school', p(
                'Every 2,000 XP in a subject is one high school credit. An Optio teacher reviews your work, '
                'and the credit goes on your Optio Academy transcript. The diploma takes 24 credits.')),
            p('Small and steady wins. One finished task a day adds up fast.'),
        ]), audience='student'),
    },
    {
        'name': 'Stuck?', 'delay_hours': 240,
        'subject': 'Stuck on what to do next?',
        'html': wrap('\n'.join([
            p('Hi {{first_name}}, Dr. Bowman here. You have had Optio for over a week.'),
            p('If you do not know what tasks to add, reply and tell me one thing you like to do. I will send '
              'you a few task ideas myself.'),
            p('If you are already going, keep it up. Show your parents your portfolio this week.'),
        ]), audience='student'),
    },
]


def _sql_str(v):
    return "'" + str(v).replace("'", "''") + "'"


def steps_sql(funnel_key, steps):
    rows = []
    for i, s in enumerate(steps, start=1):
        rows.append(
            f"((select id from crm_funnels where key={_sql_str(funnel_key)}), {i}, {_sql_str(s['name'])}, "
            f"{_sql_str(s['subject'])}, {_sql_str(s['html'])}, NULL, {s['delay_hours']}, true)")
    # Upsert by step order: crm_sends points at step ids (no cascade), so
    # the steps that already sent keep their ids and their history.
    return ("insert into crm_funnel_steps (funnel_id, step_order, name, subject, html_body, text_body, delay_hours, is_active) values\n"
            + ',\n'.join(rows)
            + "\non conflict (funnel_id, step_order) do update set name=excluded.name, subject=excluded.subject, "
              "html_body=excluded.html_body, text_body=excluded.text_body, delay_hours=excluded.delay_hours, "
              "is_active=true, updated_at=now();\n")


def main():
    if '--json' in sys.argv:
        print(json.dumps({'academy_parent_welcome': PARENT_STEPS,
                          'academy_student_welcome': STUDENT_STEPS}, indent=2))
        return
    print('begin;')
    print("insert into crm_funnels (key, name, description, status, funnel_type, entry_types) values "
          "('academy_student_welcome', 'Optio Academy Student Welcome', "
          "'Students 13+ with their own email login, from a completed Optio Academy registration.', "
          "'paused', 'onboarding', '{}') on conflict (key) do nothing;")
    print(steps_sql('academy_parent_welcome', PARENT_STEPS))
    print(steps_sql('academy_student_welcome', STUDENT_STEPS))
    print('commit;')


if __name__ == '__main__':
    main()
