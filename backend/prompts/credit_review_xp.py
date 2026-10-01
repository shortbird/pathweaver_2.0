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

from prompts.xp_scale import XP_SCALE

# The scale itself is shared with every AI that writes tasks
# (prompts/xp_scale.py), so a task and its review measure the same way.
CREDIT_REVIEW_XP_GUIDE = f"""Size the work by what the evidence shows the student actually did. Do not size it by the XP they claimed or by how important the task title sounds.
{XP_SCALE}
A few sentences of writing is 25 XP unless the evidence shows much more work behind it."""
