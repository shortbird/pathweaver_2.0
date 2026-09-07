"""What an AI failure is allowed to tell the caller.

Sentry OPTIO-WEB-W / OPTIO-BACKEND-86 (2026-09-07). Service methods catch
their own exceptions and hand routes back ``{'success': False,
'error': str(e)}``; routes then did ``jsonify(result), 500``. So when the
Gemini account ran out of prepay credit, Google's reply --

    "429 Your prepayment credits are depleted. Please go to AI Studio at
     https://ai.studio/projects to manage your project and billing."

-- was rendered in a student's browser, as a 500.
"""

import pytest

from utils.ai_errors import (
    ai_failure_response,
    is_credential_ai_error,
    is_credits_exhausted_error,
    is_transient_ai_error,
)

CREDITS_DEPLETED = (
    '429 Your prepayment credits are depleted. Please go to AI Studio at '
    'https://ai.studio/projects to manage your project and billing. Learn more '
    'at https://ai.google.dev/gemini-api/docs/billing#prepay.'
)

FALLBACK = 'Failed to generate tasks. Please try again.'

# Anything that would tell a student about the vendor or the invoice.
LEAKS = ('prepayment', 'credits are depleted', 'billing', 'ai studio', 'http',
         'google', 'gemini', 'quota', 'api key', '429', '503')


class TestClassification:
    def test_out_of_credit_is_not_transient(self):
        assert is_credits_exhausted_error(CREDITS_DEPLETED) is True
        # The bare '429' must not win over the billing wording.
        assert is_transient_ai_error(CREDITS_DEPLETED) is False

    @pytest.mark.parametrize('msg', [
        '503 This model is currently experiencing high demand.',
        '429 Resource exhausted',
        'The model is overloaded, try again later',
    ])
    def test_capacity_errors_stay_transient(self, msg):
        assert is_credits_exhausted_error(msg) is False
        assert is_transient_ai_error(msg) is True

    @pytest.mark.parametrize('msg', ['invalid api key', '403 permission denied'])
    def test_credential_errors_detected(self, msg):
        assert is_credential_ai_error(msg) is True

    def test_accepts_an_exception_or_a_string(self):
        assert is_credits_exhausted_error(Exception(CREDITS_DEPLETED)) is True
        assert is_credits_exhausted_error(CREDITS_DEPLETED) is True

    @pytest.mark.parametrize('value', [None, '', 0])
    def test_survives_an_empty_error(self, value):
        assert is_credits_exhausted_error(value) is False
        assert is_transient_ai_error(value) is False


class TestResponse:
    def test_out_of_credit_is_503_not_500(self):
        payload, status = ai_failure_response(CREDITS_DEPLETED, FALLBACK)
        assert status == 503
        assert payload['success'] is False

    def test_transient_is_429_not_500(self):
        payload, status = ai_failure_response('503 high demand', FALLBACK)
        assert status == 429

    def test_credential_failure_points_at_support(self):
        payload, status = ai_failure_response('invalid api key', FALLBACK)
        assert status == 500
        assert 'support' in payload['error'].lower()

    def test_unrecognized_failure_uses_the_caller_fallback(self):
        payload, status = ai_failure_response('database exploded', FALLBACK)
        assert (payload['error'], status) == (FALLBACK, 500)

    @pytest.mark.parametrize('error', [
        CREDITS_DEPLETED,
        Exception(CREDITS_DEPLETED),
        '503 This model is currently experiencing high demand.',
        'invalid api key AIzaSyEXAMPLE leaked',
        '429 You exceeded your current quota, check your plan and billing details',
    ])
    def test_never_echoes_vendor_or_billing_detail(self, error):
        payload, _ = ai_failure_response(error, FALLBACK)
        shown = payload['error'].lower()
        for leak in LEAKS:
            assert leak not in shown, f"user-facing error leaked {leak!r}: {payload['error']}"

    def test_the_caller_fallback_is_the_only_text_it_passes_through(self):
        """Guards against a future branch echoing str(error) again."""
        payload, _ = ai_failure_response(CREDITS_DEPLETED, FALLBACK)
        assert CREDITS_DEPLETED not in payload['error']
