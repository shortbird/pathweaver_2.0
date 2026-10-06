-- CRM funnel for parents who began an Optio Academy registration and stopped.
--
-- A new funnel_type, 'recovery': its members already hold an account (the
-- registration funnel creates the parent's account on its first step), so the
-- sweep's "has an account, so converted" safety net must not apply to them.
-- What ends a recovery membership is the registration reaching 'completed',
-- checked before every send (services/crm_registration_recovery.py).
--
-- Entry is not a form: the funnel sweep enrolls a parent once the
-- registration has sat untouched for a few hours. The funnel ships PAUSED so
-- the copy can be read in /admin CRM before anything sends; activating it
-- enrolls every open registration from the last 30 days.

ALTER TABLE public.crm_funnels DROP CONSTRAINT IF EXISTS crm_funnels_funnel_type_check;
ALTER TABLE public.crm_funnels ADD CONSTRAINT crm_funnels_funnel_type_check
    CHECK (funnel_type IN ('nurture', 'onboarding', 'recovery'));

INSERT INTO public.crm_funnels (key, name, description, status, funnel_type, entry_types)
VALUES (
    'academy_registration_recovery',
    'Optio Academy Registration Recovery',
    'Parents who started the Optio Academy registration (optioeducation.com/enroll/optio-academy) and have not finished it. The sweep enrolls them after 3 hours without progress; finishing the registration ends the sequence.',
    'paused',
    'recovery',
    '{}'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.crm_funnel_steps (funnel_id, step_order, name, subject, html_body, delay_hours)
SELECT f.id, s.step_order, s.name, s.subject, s.html_body, s.delay_hours
FROM public.crm_funnels f
CROSS JOIN (VALUES
(1, 'Progress is saved', 'Your Optio Academy registration is saved', 0,
$html$<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;padding:24px;">
<p>Hi {{first_name}}, this is Dr. Bowman from Optio Academy.</p>
<p>You started registering your family with Optio Academy. Everything you entered is saved, so you can pick up right where you stopped.</p>
<p style="margin:32px 0;text-align:center;"><a href="https://app.optioeducation.com/enroll/optio-academy?utm_source=crm&utm_medium=email&utm_campaign=academy_registration_recovery&utm_content=e1" style="display:inline-block;background:#6D469B;color:#ffffff;text-decoration:none;font-weight:600;font-size:17px;padding:14px 30px;border-radius:8px;">Finish registration</a></p>
<p>Sign in with the same email and password you used when you started. If you signed up with Google or Apple, use that button.</p>
<p>If something on the form stopped you, reply to this email and tell me what happened. I read every reply.</p>
<p>Dr. Bowman</p>
</div>
$html$),
(2, 'Questions first', 'Questions before you finish registering?', 72,
$html$<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;padding:24px;">
<p>Hi {{first_name}}, Dr. Bowman again from Optio Academy.</p>
<p>Your registration is still open. When a family stops partway, it is usually because of a question about cost, credit, or what a school week looks like.</p>
<p>If that is you, book a free 30-minute call with me. We will go through your kids and your questions, and you can finish the registration afterward.</p>
<p style="margin:32px 0;text-align:center;"><a href="https://calendar.app.google/nnJP1nZiDhHLp4Tq8" style="display:inline-block;background:#6D469B;color:#ffffff;text-decoration:none;font-weight:600;font-size:17px;padding:14px 30px;border-radius:8px;">Book a free 30-minute call</a></p>
<p>If you are ready now, your saved registration is <a href="https://app.optioeducation.com/enroll/optio-academy?utm_source=crm&utm_medium=email&utm_campaign=academy_registration_recovery&utm_content=e2" style="color:#6D469B;">here</a>.</p>
<p>Dr. Bowman</p>
</div>
$html$),
(3, 'Last note', 'One last note about your registration', 168,
$html$<div style="max-width:560px;margin:0 auto;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;padding:24px;">
<p>Hi {{first_name}}, this is Dr. Bowman. This is my last note about your Optio Academy registration.</p>
<p>It is still saved. When you are ready, it takes you back to the step where you stopped.</p>
<p style="margin:32px 0;text-align:center;"><a href="https://app.optioeducation.com/enroll/optio-academy?utm_source=crm&utm_medium=email&utm_campaign=academy_registration_recovery&utm_content=e3" style="display:inline-block;background:#6D469B;color:#ffffff;text-decoration:none;font-weight:600;font-size:17px;padding:14px 30px;border-radius:8px;">Finish registration</a></p>
<p>If the timing is wrong or Optio Academy is not the right fit, that is fine. The unsubscribe link below stops these emails.</p>
<p>Dr. Bowman</p>
</div>
$html$)
) AS s(step_order, name, subject, delay_hours, html_body)
WHERE f.key = 'academy_registration_recovery'
ON CONFLICT (funnel_id, step_order) DO NOTHING;
