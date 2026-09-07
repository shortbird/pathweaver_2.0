"""No route may hand a service's raw error string back to the caller.

Service methods flatten their own exceptions into
``{'success': False, 'error': str(e)}``. A route that answers with
``jsonify(result)`` therefore ships whatever the upstream said straight to the
browser -- which is how Google's "Your prepayment credits are depleted, go to
AI Studio to manage your project and billing" ended up in a student's face,
under a 500, on 2026-09-07 (Sentry OPTIO-WEB-W).

Route the failure through ``utils.ai_errors.ai_failure_response`` instead: it
picks a status that matches what happened, keeps the vendor detail in the logs,
and returns copy written for the person reading it.
"""

import re
from pathlib import Path

ROUTES = Path(__file__).resolve().parents[2] / 'routes'

# `jsonify(result)` where `result` is a service's {'success': False, ...} dict.
#
# 5xx only, deliberately. A service's 4xx is normally a validation message
# written FOR the user ("Quest not found"), and forbidding those would be
# noise. A 5xx is never that: it is always an internal failure escaping, which
# is the shape that leaked. Two 4xx passthroughs were reviewed and left alone
# when this guard landed -- quest_personalization's start-personalization and
# admin/course_import -- because neither goes near a model.
PASSTHROUGH = re.compile(r'return jsonify\(result\),\s*5\d\d')


def test_no_route_returns_a_service_result_dict_as_an_error():
    offenders = []
    for path in ROUTES.rglob('*.py'):
        for lineno, line in enumerate(path.read_text().splitlines(), 1):
            if PASSTHROUGH.search(line):
                offenders.append(f"{path.relative_to(ROUTES.parent)}:{lineno}: {line.strip()}")

    assert not offenders, (
        "These routes return a service's raw error dict to the caller:\n  "
        + "\n  ".join(offenders)
        + "\n\nUse utils.ai_errors.ai_failure_response(result.get('error'), <fallback>) "
          "for AI failures, or build an explicit payload -- never jsonify(result) on "
          "the failure branch."
    )
