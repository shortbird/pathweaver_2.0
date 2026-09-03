"""SEC-05: no student or parent email reaches a log sink in the clear.

utils/log_scrubber.py has had mask_email() since P1-SEC-4 and 34 log statements
never called it -- registration_funnel.py and contact.py logged the address a
family typed, verbatim, into stdout and from there into Render's log store and
Sentry. A helper nobody is obliged to call is not a control.

So the scrub happens at the logging.LogRecord factory, which is the only hook
that runs before EVERY consumer:

  Logger.info()
    -> factory()          <- here
    -> Logger.handle()
    -> Logger.callHandlers()   <- Sentry's LoggingIntegration patches THIS
    -> our console handler     <- a logging.Filter would only sit here

A filter on the handler would have left Sentry receiving the raw address, which
is the sink that leaves the building.
"""

import logging

import pytest


@pytest.fixture
def capture():
    """Emit through a real logger and return what a handler received."""
    from utils.logger import install_pii_scrubbing
    install_pii_scrubbing()

    records = []

    class Collector(logging.Handler):
        def emit(self, record):
            records.append(record)

    logger = logging.getLogger('optio.tests.pii')
    logger.handlers = [Collector()]
    logger.setLevel(logging.DEBUG)
    logger.propagate = False

    def _emit(*args, **kwargs):
        records.clear()
        logger.info(*args, **kwargs)
        return records[0]

    return _emit


@pytest.mark.unit
class TestEmailsNeverReachASink:
    def test_an_email_in_an_fstring_message_is_masked(self, capture):
        """The shape almost every call site in this codebase uses."""
        email = 'penny.hartz@example.org'
        record = capture(f'[Contact] new inquiry from {email}')
        assert email not in record.getMessage()
        assert 'pen***@example.org' in record.getMessage()

    def test_an_email_passed_as_a_percent_arg_is_masked(self, capture):
        record = capture('registration for %s failed', 'sam.chen@school.edu')
        assert 'sam.chen@school.edu' not in record.getMessage()
        assert 'sam***@school.edu' in record.getMessage()

    def test_the_template_survives_so_sentry_can_still_group(self, capture):
        """Scrubbing args individually instead of folding them into the message
        keeps %-style records groupable. Collapsing them would give every log
        line its own Sentry issue."""
        record = capture('registration for %s failed', 'sam.chen@school.edu')
        assert record.msg == 'registration for %s failed'

    def test_several_addresses_in_one_line_are_all_masked(self, capture):
        record = capture('linking parent a@x.com to student b@y.com')
        message = record.getMessage()
        assert 'a@x.com' not in message and 'b@y.com' not in message
        assert message.count('***@') == 2

    def test_structured_extra_fields_are_masked(self, capture):
        """JSONFormatter writes extra_fields straight into the log line, and
        `extra=` is merged onto the record after the factory has run -- so this
        half is caught at Logger.makeRecord instead."""
        record = capture('audit', extra={'extra_fields': {
            'email': 'observer@example.com', 'count': 3}})
        assert record.extra_fields['email'] == 'obs***@example.com'
        assert record.extra_fields['count'] == 3

    def test_nested_extra_context_is_masked(self, capture):
        """utils/access_logger.py logs FERPA disclosure context as a nested
        dict under extra=, which is the shape most likely to carry a real
        student address."""
        record = capture('[ACCESS] portfolio viewed', extra={'extra_fields': {
            'actor': {'email': 'advisor@school.edu'},
            'targets': ['kid@school.edu', 'other@school.edu'],
        }})
        assert record.extra_fields['actor']['email'] == 'adv***@school.edu'
        assert record.extra_fields['targets'] == ['kid***@school.edu',
                                                  'oth***@school.edu']

    def test_a_jwt_is_truncated(self, capture):
        token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIn0.sig-value'
        record = capture(f'refresh failed for {token}')
        assert token not in record.getMessage()
        assert 'eyJhbGci...' in record.getMessage()


@pytest.mark.unit
class TestWhatItDeliberatelyLeavesAlone:
    def test_uuids_stay_readable(self, capture):
        """Every quest, class and organization id is a UUID. Masking them
        platform-wide would cost the logs their only join key and buy no
        privacy the email masking has not already bought. mask_user_id() is
        called at the sites where a UUID is known to be a person."""
        quest_id = '550e8400-e29b-41d4-a716-446655440000'
        record = capture(f'quest {quest_id} published')
        assert quest_id in record.getMessage()

    def test_a_non_string_message_does_not_crash_the_logger(self, capture):
        record = capture({'event': 'dict-as-msg'})
        assert record.getMessage()


@pytest.mark.unit
class TestTheInstallItself:
    def test_the_record_sentry_reads_is_already_masked(self):
        """Sentry's LoggingIntegration patches logging.Logger.callHandlers and
        reads the record there -- outside every handler's filter chain. Stand
        in the same place and check what arrives."""
        from utils.logger import install_pii_scrubbing
        install_pii_scrubbing()

        seen = []
        original = logging.Logger.callHandlers

        def spy(self, record):
            seen.append(record.getMessage())
            return original(self, record)

        logging.Logger.callHandlers = spy
        try:
            logger = logging.getLogger('optio.tests.pii.sentry')
            logger.setLevel(logging.INFO)
            logger.error('payment failed for parent@family.test')
        finally:
            logging.Logger.callHandlers = original

        assert seen, 'callHandlers was not reached'
        assert 'parent@family.test' not in seen[0]
        assert 'par***@family.test' in seen[0]

    def test_installing_twice_does_not_stack_the_hooks(self):
        """setup_logging() runs again in tests and on a second import of
        app.py; wrapping twice would grow the chain on every call."""
        from utils.logger import install_pii_scrubbing
        first = install_pii_scrubbing()
        make_record = logging.Logger.makeRecord
        second = install_pii_scrubbing()
        assert first is second
        assert logging.getLogRecordFactory() is first
        assert logging.Logger.makeRecord is make_record

    def test_setup_logging_installs_it(self):
        """app.py calls setup_logging() before anything else can log."""
        from utils.logger import setup_logging
        setup_logging()
        assert getattr(logging.getLogRecordFactory(), '_optio_pii_scrubbing', False)
