"""Stories: one-click case studies from the credit review dashboard.

A superadmin presses Publish on a finalized submission (or a completed quest);
this package drafts an anonymized story, runs an AI safety pass over the images
and the text, publishes it to www.optioeducation.com/stories, rebuilds the
static site, and emails the founder the URL with the drafter's concerns.

Read in this order:

  ``anonymize``          the label, the grade band, the scrubber, the image scrub
  ``source``             the dataclass every story is drafted from
  ``source_completion``  one submission -> StorySource
  ``source_quest``       a whole quest -> StorySource
  ``safety``             the AI safety pass: detection by the model, decision here
  ``prompt`` / ``schema`` what we ask for and the shape of the answer
  ``drafter``            the model call, and assembling the row around it
  ``publish``            the gate (blockers), publish, unpublish, the public view
  ``generate``           the orchestration on a background thread
  ``consent_service``    who may say yes, and recording that they did
  ``assets``             private bucket -> public bucket, and back
"""
