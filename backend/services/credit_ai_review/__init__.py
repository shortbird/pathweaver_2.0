"""The AI credit reviewer.

A student requests diploma credit; this reads the Definition of Done on the task
and every piece of evidence they attached -- typed text, photos, PDFs, Word
documents, Google Docs, links, YouTube, uploaded video -- and proposes a verdict,
an XP figure and two drafts of feedback. A superadmin reads the proposal and
decides. Nothing here approves anything or moves a single point of XP.

Read in this order:

  ``store``            the row's lifecycle, and the claim that stops two workers
                       reviewing the same submission
  ``trigger``          what starts a review: a submission, the cron sweep, a button
  ``evidence_loader``  turning stored evidence into something a model can read
  ``prompt``           what we actually ask
  ``normalize``        what we refuse to believe about the answer
  ``service``          the orchestration that ties those together
"""

from services.credit_ai_review.service import CreditAIReviewService  # noqa: F401

__all__ = ['CreditAIReviewService']
