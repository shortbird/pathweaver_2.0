"""The FERPA disclosure notice on a public portfolio.

A page that publishes a student's educational records to the open internet
should say so on the page, and say who authorised it. `PublicNoticeBanner` has
existed in the web app since it was written and had never rendered once,
because it is gated on `diploma.public_consent_info.opted_in` and no backend
response has ever carried that key -- `get_diploma_data()` returned nine keys
and this was not among them. The condition was `undefined` on every route, on
every request, for the life of the component.

These tests are on `_public_consent_info` directly rather than on the whole
payload. That function IS the finding: everything else about the diploma
response already worked, and driving `get_diploma_data` end to end would need
eight collaborators mocked to assert one dict.

The gate that matters most here is `is_public`. Consent is a durable record and
publication is a toggle, so they come apart -- production held 5 consent
records against 3 public portfolios when this was written. Announcing "shared
publicly" on a portfolio that has been un-published would be false about the
single fact the notice exists to state, and it would be shown to the parent or
advisor who can still read it.
"""

import pytest

from services.portfolio_service import PortfolioService


STUDENT = '11111111-1111-1111-1111-111111111111'
PARENT = '22222222-2222-2222-2222-222222222222'

info = PortfolioService._public_consent_info


def diploma(**overrides):
    """A diplomas row, public and self-consented unless told otherwise."""
    row = {
        'user_id': STUDENT,
        'is_public': True,
        'public_consent_given': True,
        'public_consent_given_at': '2026-04-02T10:00:00Z',
        'public_consent_given_by': STUDENT,
    }
    row.update(overrides)
    return row


class TestWhenTheNoticeAppears:
    def test_a_published_portfolio_with_consent_announces_itself(self):
        result = info(diploma(), is_public=True, user_id=STUDENT)
        assert result is not None
        assert result['opted_in'] is True
        assert result['consent_given_at'] == '2026-04-02T10:00:00Z'

    def test_a_private_portfolio_announces_nothing(self):
        # A parent or advisor can still read this page. Telling them it has
        # been shared publicly would be false.
        result = info(diploma(is_public=False), is_public=False, user_id=STUDENT)
        assert result is None

    def test_consent_without_publication_announces_nothing(self):
        """The case the production data proves is real, not hypothetical.

        Consent is durable and publication is a toggle. A student who consented
        in April and un-published in May keeps the consent record; the portfolio
        is not public, and the notice must not claim it is."""
        row = diploma(is_public=False, public_consent_given=True)
        assert info(row, is_public=False, user_id=STUDENT) is None

    def test_publication_without_a_consent_record_announces_nothing(self):
        # Nothing to attest to. Better silent than asserting a consent that
        # was never recorded -- the notice is a compliance claim.
        row = diploma(public_consent_given=False)
        assert info(row, is_public=True, user_id=STUDENT) is None

    def test_a_student_with_no_diploma_row_announces_nothing(self):
        assert info(None, is_public=True, user_id=STUDENT) is None


class TestWhoGaveConsent:
    def test_consent_from_someone_else_reads_as_approved(self):
        """`with_parent_approval` is derived, not stored.

        Consent granted by anybody other than the student is an approver's
        consent, and it cannot be a minor's self-consent: the database refuses
        that outright (trg_publication_consent_provenance, added under H5 after
        4 of 6 consent records turned out to be self-granted by minors)."""
        result = info(
            diploma(public_consent_given_by=PARENT), is_public=True, user_id=STUDENT
        )
        assert result['with_parent_approval'] is True

    def test_a_student_consenting_for_themselves_is_not_parent_approval(self):
        result = info(diploma(), is_public=True, user_id=STUDENT)
        assert result['with_parent_approval'] is False

    def test_an_unrecorded_grantor_is_not_claimed_as_parent_approval(self):
        # Legacy rows predate the column. Absent evidence of an approver, the
        # notice must not assert one -- it says "with parental consent" on the
        # page, which is a claim about a real person having agreed.
        result = info(
            diploma(public_consent_given_by=None), is_public=True, user_id=STUDENT
        )
        assert result['with_parent_approval'] is False

    def test_ids_are_compared_as_text(self):
        # user_id arrives as a str from the route and the column comes back as
        # a str from PostgREST, but a UUID object from either side must not
        # silently read as "somebody else" and invent an approver.
        import uuid as _uuid
        as_uuid = _uuid.UUID(STUDENT)
        result = info(
            diploma(public_consent_given_by=as_uuid), is_public=True, user_id=STUDENT
        )
        assert result['with_parent_approval'] is False


class TestTheShapeTheFrontendReads:
    """DiplomaPage renders on `diploma?.public_consent_info?.opted_in`, and
    PublicNoticeBanner takes exactly three props off this dict. If a key is
    renamed here the banner silently stops rendering again -- which is the
    failure this whole test file exists because of."""

    def test_it_carries_the_three_keys_the_banner_reads(self):
        result = info(diploma(), is_public=True, user_id=STUDENT)
        assert set(result) == {'opted_in', 'with_parent_approval', 'consent_given_at'}

    def test_absence_is_none_rather_than_a_falsy_dict(self):
        # `{'opted_in': False}` would also work for the banner today, but it
        # reads as "we know there is no consent" where None reads as "there is
        # nothing to announce". Only one of those survives someone later
        # writing `if 'public_consent_info' in payload`.
        assert info(diploma(public_consent_given=False), is_public=True, user_id=STUDENT) is None


@pytest.mark.parametrize('is_public,consent,expected', [
    (True, True, True),
    (True, False, False),
    (False, True, False),
    (False, False, False),
])
def test_the_notice_needs_both_publication_and_consent(is_public, consent, expected):
    row = diploma(is_public=is_public, public_consent_given=consent)
    assert (info(row, is_public=is_public, user_id=STUDENT) is not None) is expected
