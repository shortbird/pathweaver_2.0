"""How the AI credit reviewer sizes XP -- the default, editable rubric.

This is the Python default for the CREDIT_REVIEW_XP_GUIDE prompt component. A
superadmin edits it in the grader's Tune AI XP popup and the edit wins
(services/prompt_management_service.py); "Reset to default" comes back here.

Only the scale lives here. The rules that protect the student -- never raise the
claim, never go below the platform floor -- stay in
services/credit_ai_review/prompt.py, where no edit can remove them.

The scale matches the one hand-written tasks are sized with
(services/task_quality_service.py XP SIZE), so a task's ai_suggested_xp and the
review's XP line use the same yardstick. Until 2026-09-29 this said "a short
focused task is 50-100 XP" and told the model the claim was "the expected
answer", so a two-sentence discussion comment passed at 100 XP.
"""

CREDIT_REVIEW_XP_GUIDE = """Size the work by what the evidence shows the student actually did. Do not size it by the XP they claimed or by how important the task title sounds.
- 25: a quick piece of work, under 30 minutes. A short written reply or discussion comment, one worksheet, a few photos of one activity.
- 50: about an hour of work.
- 75: one or two sittings.
- 100: a few hours across a couple of sessions.
- 150: several sessions over a week or so.
- 200: a major multi-session project with a substantial finished product.
A few sentences of writing is 25 XP unless the evidence shows much more work behind it."""
