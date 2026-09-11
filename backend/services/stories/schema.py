"""The shape of a drafted story, declared to the model.

SDK dialect (UPPERCASE types, `enum` for closed sets, no `$ref`), same as
credit_ai_review/schema.py and for the same reason: with a response_schema the
model cannot answer with prose around the JSON or a missing field.

Everything the model decides is here. Everything it does NOT decide -- the
student label, the subject, the XP, the credit, the grade band, the criteria
and the rounds -- is copied from the source in drafter.assemble, so the model
cannot get it wrong.
"""

from services.stories.activities import RECEIPT_ICONS, STORY_ACTIVITY_SLUGS

RESPONSE_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'title': {
            'type': 'STRING',
            'description': 'The headline. Plain text, under 70 characters, no name.',
        },
        'title_options': {
            'type': 'ARRAY',
            'description': 'Three alternative headlines, for the editor.',
            'items': {'type': 'STRING'},
        },
        'dek': {
            'type': 'STRING',
            'description': 'One or two sentences under the headline. Plain text.',
        },
        'activity_slug': {
            'type': 'STRING',
            'enum': list(STORY_ACTIVITY_SLUGS),
            'description': 'The lander this story belongs with, or other.',
        },
        'activity_label': {
            'type': 'STRING',
            'description': 'The activity in three to six words, e.g. "A season of club soccer".',
        },
        'receipt': {
            'type': 'OBJECT',
            'properties': {
                'activity': {'type': 'STRING',
                             'description': 'The real-life activity, under 40 characters.'},
                'course': {'type': 'STRING',
                           'description': 'The transcript course name it became.'},
                'credit': {'type': 'STRING',
                           'description': 'The credit line, e.g. "0.5 credit".'},
                'icon': {'type': 'STRING', 'enum': list(RECEIPT_ICONS)},
            },
            'required': ['activity', 'course', 'credit', 'icon'],
        },
        'what_they_did': {
            'type': 'STRING',
            'description': 'Two to four short paragraphs of markdown. What the student did, '
                           'in plain concrete sentences.',
        },
        'tasks': {
            'type': 'ARRAY',
            'description': 'Quest stories only: one entry per [T<n>] task, in order.',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'index': {'type': 'INTEGER'},
                    'summary': {'type': 'STRING',
                                'description': 'One sentence on what this task involved.'},
                },
                'required': ['index', 'summary'],
            },
        },
        'what_it_counted_for': {
            'type': 'STRING',
            'description': 'One or two paragraphs of markdown: how this work became transcript '
                           'credit, and what that means for a family.',
        },
        'faq': {
            'type': 'ARRAY',
            'description': 'Exactly three questions a parent searching for this would ask, '
                           'each with a two or three sentence answer.',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'q': {'type': 'STRING'},
                    'a': {'type': 'STRING'},
                },
                'required': ['q', 'a'],
            },
        },
        'images': {
            'type': 'ARRAY',
            'description': 'One entry per [I<n>] offered: image, video or document. Only '
                           'entries marked use=true appear on the page.',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'index': {'type': 'INTEGER'},
                    'use': {'type': 'BOOLEAN'},
                    'alt': {'type': 'STRING',
                            'description': 'Alt text: what is in the image, one sentence, no name.'},
                    'caption': {'type': 'STRING',
                                'description': 'A caption under the image. Plain text, no name.'},
                },
                'required': ['index', 'use', 'alt', 'caption'],
            },
        },
        'hero_index': {
            'type': 'INTEGER',
            'description': 'The [I<n>] to use as the hero image, or 0 for none.',
        },
        'search_phrases': {
            'type': 'ARRAY',
            'description': 'Three to six phrases a parent might type into a search engine '
                           'that this story answers.',
            'items': {'type': 'STRING'},
        },
        'concerns': {
            'type': 'ARRAY',
            'description': 'Anything a human should read before this goes live. Empty when '
                           'there is nothing.',
            'items': {'type': 'STRING'},
        },
    },
    'required': ['title', 'title_options', 'dek', 'activity_slug', 'activity_label', 'receipt',
                 'what_they_did', 'tasks', 'what_it_counted_for', 'faq', 'images',
                 'hero_index', 'search_phrases', 'concerns'],
}

JSON_EXAMPLE = """{
  "title": "Plain headline under 70 characters",
  "title_options": ["...", "...", "..."],
  "dek": "One or two sentences.",
  "activity_slug": "soccer | piano | camp | art | coding | volunteering | other",
  "activity_label": "A season of club soccer",
  "receipt": {"activity": "Fall club soccer season", "course": "Physical Education",
              "credit": "0.5 credit", "icon": "ball"},
  "what_they_did": "Two to four short markdown paragraphs.",
  "tasks": [{"index": 1, "summary": "One sentence."}],
  "what_it_counted_for": "One or two markdown paragraphs.",
  "faq": [{"q": "...", "a": "..."}, {"q": "...", "a": "..."}, {"q": "...", "a": "..."}],
  "images": [{"index": 1, "use": true, "alt": "...", "caption": "..."}],
  "hero_index": 1,
  "search_phrases": ["..."],
  "concerns": []
}"""
