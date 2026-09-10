"""The shape of an answer, declared to the model rather than only described.

google-generativeai 0.8.x accepts a ``response_schema`` alongside
``response_mime_type='application/json'``, and the model then cannot answer with
a fenced markdown block, prose around the JSON, or a missing field. That removes
most of what the repair chain in BaseAIService.extract_json exists to survive.

The dialect is the SDK's own: UPPERCASE type names, ``enum`` for closed sets, no
``$ref`` and no ``additionalProperties``. It is not JSON Schema, and writing it
as though it were produces a 400 that names nothing useful.

The schema is a floor, not a guarantee. Everything here is still checked in
normalize.py, because a well-formed answer can still be a wrong one.
"""

RESPONSE_SCHEMA = {
    'type': 'OBJECT',
    'properties': {
        'criteria': {
            'type': 'ARRAY',
            'description': 'One entry per numbered criterion, in order.',
            'items': {
                'type': 'OBJECT',
                'properties': {
                    'index': {
                        'type': 'INTEGER',
                        'description': 'The criterion number, e.g. 1 for [C1].',
                    },
                    'verdict': {
                        'type': 'STRING',
                        'enum': ['met', 'partial', 'not_met', 'cannot_verify'],
                    },
                    'evidence_refs': {
                        'type': 'ARRAY',
                        'description': 'Evidence numbers supporting this verdict, e.g. [1, 3].',
                        'items': {'type': 'INTEGER'},
                    },
                    'note': {
                        'type': 'STRING',
                        'description': 'One sentence naming what in the evidence decided this.',
                    },
                },
                'required': ['index', 'verdict', 'evidence_refs', 'note'],
            },
        },
        'recommendation': {
            'type': 'STRING',
            'enum': ['approve', 'grow_this', 'needs_human'],
        },
        'confidence': {
            'type': 'NUMBER',
            'description': '0 to 1. Use the low end freely.',
        },
        'summary': {
            'type': 'STRING',
            'description': 'One short paragraph for the reviewer, not the student.',
        },
        'xp': {
            'type': 'OBJECT',
            'properties': {
                'recommended': {
                    'type': 'INTEGER',
                    'description': 'Never above the requested amount. Never below 25.',
                },
                'proportionate': {
                    'type': 'BOOLEAN',
                    'description': 'True when the requested amount already fits the work.',
                },
                'rationale': {'type': 'STRING'},
            },
            'required': ['recommended', 'proportionate', 'rationale'],
        },
        'feedback': {
            'type': 'OBJECT',
            'properties': {
                'celebrate': {
                    'type': 'STRING',
                    'description': 'The note that goes out with credit. Plain prose.',
                },
                'grow_this': {
                    'type': 'STRING',
                    'description': 'The note that returns the work for more. Plain prose.',
                },
            },
            'required': ['celebrate', 'grow_this'],
        },
        'concerns': {
            'type': 'ARRAY',
            'description': 'Anything a human should look at directly.',
            'items': {'type': 'STRING'},
        },
    },
    'required': ['criteria', 'recommendation', 'confidence', 'summary', 'xp',
                 'feedback', 'concerns'],
}

# What the prompt shows as an example, and the only instruction available on the
# fallback path where a model refused the schema.
JSON_EXAMPLE = """{
  "criteria": [
    {"index": 1, "verdict": "met", "evidence_refs": [1, 2],
     "note": "One sentence naming what in the evidence decided this."}
  ],
  "recommendation": "approve | grow_this | needs_human",
  "confidence": 0.0,
  "summary": "One short paragraph for the reviewer.",
  "xp": {"recommended": 0, "proportionate": true, "rationale": "One sentence."},
  "feedback": {
    "celebrate": "Three to five short sentences, one paragraph, plain text.",
    "grow_this": "Three to five short sentences, one paragraph, plain text."
  },
  "concerns": []
}"""

VERDICTS = ('met', 'partial', 'not_met', 'cannot_verify')
RECOMMENDATIONS = ('approve', 'grow_this', 'needs_human')
