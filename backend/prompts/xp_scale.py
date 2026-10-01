"""The one XP scale: what every AI that writes a task and the AI that reviews
it both measure with.

Until 2026-09-30 each task generator had its own range -- "50-200, most should
be 100-150" for class suggestions, "100-150 XP: 30-60 minutes" for courses,
"25-150 based on complexity" elsewhere -- while the credit reviewer sized
evidence by time on the scale below. Jake Bingham's class, the first class
reviewed task by task, showed the result: eleven AI-suggested tasks claimed
1,025 XP, and the reviewer recommended 375 for the work they asked for (a
150 XP task that was three lines of product copy).

The fix is one scale on both sides:

  writing a task  size it on this scale, and make the description and the
                  Definition of Done ask for work that fits the size.
  reviewing it    a task done fully as written keeps its XP; less work than
                  the task asked for gets less.

The values match config.constants.TASK_XP_SIZES. The credit reviewer's copy is
editable in the grader's Tune AI XP popup (prompts/credit_review_xp.py); this
is the default it starts from.
"""

from config.constants import TASK_XP_SIZES

XP_SCALE = """- 25: a quick task, under 30 minutes. A short written reply, one worksheet, a few photos of one activity.
- 50: a small task, about an hour of work.
- 75: a light task, one or two sittings.
- 100: a medium task, a few hours across a couple of sessions.
- 150: a large task, several sessions over a week or so.
- 200: a major multi-session project with a substantial finished product."""

XP_SIZES_TEXT = ', '.join(str(x) for x in TASK_XP_SIZES)

# For every prompt that WRITES tasks. The last two rules are the alignment:
# the XP a task promises is XP a student who does the task as written keeps,
# because the reviewer measures with the same scale.
TASK_XP_RULES = f"""XP -- use exactly this scale. The credit reviewer uses the same scale, so a task must ask for work worth the XP it offers:
{XP_SCALE}
- xp_value must be one of {XP_SIZES_TEXT}.
- Size each task by the work its description asks for, not by how important the title sounds.
- The description must name what the student makes and roughly how much of it ("Write a one-page plan, about 400 words", "Try three versions and compare them"), so the work fits the XP. A task of 100 XP or more must clearly ask for a few hours of work or more.
- A few sentences of writing is a 25 XP task. Do not give a short task a large number."""
