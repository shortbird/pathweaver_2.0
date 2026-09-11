"""What an anonymized story may say, and what the scrubber removes.

The label never carries a last initial, the grade band never guesses, and the
scrubber errs toward removing too much. Each of those is a rule a published
child would otherwise pay for.
"""

from __future__ import annotations

import io
from datetime import date

import pytest
from PIL import Image

from services.stories.anonymize import (
    ANONYMIZED_LABELS,
    NEVER_PUBLISHED,
    Scrubber,
    age_at,
    grade_band,
    grade_band_from_dob,
    grade_band_from_grade_level,
    is_generic_label,
    prepare_public_image,
    student_label,
)

pytestmark = pytest.mark.unit

AT = date(2026, 9, 11)


class TestGradeBand:
    @pytest.mark.parametrize('dob, expected', [
        ('2018-01-01', 'elementary'),   # 8
        ('2016-01-01', 'elementary'),   # 10
        ('2015-09-01', 'middle'),       # 11
        ('2013-01-01', 'middle'),       # 13
        ('2012-09-01', 'high'),         # 14
        ('2008-01-01', 'high'),         # 18
        ('2007-01-01', None),           # 19: not a K-12 band
    ])
    def test_bands_by_age(self, dob, expected):
        assert grade_band_from_dob(dob, AT) == expected

    def test_unknown_dob_never_guesses(self):
        assert grade_band_from_dob(None, AT) is None
        assert grade_band_from_dob('not a date', AT) is None

    @pytest.mark.parametrize('level, expected', [
        ('K', 'elementary'), ('3', 'elementary'), ('5th', 'elementary'),
        ('6', 'middle'), ('Grade 8', 'middle'),
        ('9', 'high'), ('12', 'high'), ('college', None), (None, None),
    ])
    def test_bands_by_grade_level(self, level, expected):
        assert grade_band_from_grade_level(level) == expected

    def test_dob_wins_over_grade_level(self):
        assert grade_band('2012-09-01', '3', AT) == 'high'
        assert grade_band(None, '3', AT) == 'elementary'

    def test_age_at(self):
        assert age_at('2012-09-11', AT) == 14
        assert age_at('2012-09-12', AT) == 13
        assert age_at(None, AT) is None


class TestStudentLabel:
    def test_anonymized_is_generic_by_band(self):
        assert student_label('anonymized', {}, 'Anna', 'elementary') == 'An elementary student'
        assert student_label('anonymized', {}, 'Anna', 'middle') == 'A middle schooler'
        assert student_label('anonymized', {}, 'Anna', 'high') == 'A high school student'
        assert student_label('anonymized', {}, 'Anna', None) == 'A student'

    def test_anonymized_ignores_a_consent_scope(self):
        """The tier decides, not the scope: no consent row means no name."""
        assert student_label('anonymized', {'first_name': True, 'age': True},
                             'Anna', 'high', 15) == 'A high school student'

    def test_named_uses_first_name_only_with_scope(self):
        assert student_label('named', {'first_name': True}, 'Anna', 'high', 15) == 'Anna'
        assert student_label('named', {'first_name': False}, 'Anna', 'high', 15) == 'A high school student'

    def test_named_age_only_with_scope_age(self):
        assert student_label('named', {'first_name': True, 'age': True}, 'Anna', 'high', 15) == 'Anna, 15'
        assert student_label('named', {'first_name': True, 'age': False}, 'Anna', 'high', 15) == 'Anna'

    def test_no_last_initial_anywhere(self):
        label = student_label('named', {'first_name': True}, 'Anna', 'high')
        assert label == 'Anna'
        assert '.' not in label

    def test_generic_labels_are_recognised(self):
        for label in ANONYMIZED_LABELS.values():
            assert is_generic_label(label)
        assert not is_generic_label('Anna')
        assert not is_generic_label('A student from Boise')


class TestScrubber:
    def test_removes_every_name_token_whole_word(self):
        s = Scrubber(['Anna Lindqvist', 'Erik Lindqvist'], ['Hearthwood Academy'])
        text = 'Anna showed Erik her bridge. Annabelle was not there. Lindqvist family.'
        out = s.scrub(text)
        assert 'Anna ' not in out and 'Erik' not in out and 'Lindqvist' not in out
        # Whole words: the longer name that merely CONTAINS a token survives.
        assert 'Annabelle' in out

    def test_possessives_go_with_the_name(self):
        s = Scrubber(['Anna Lindqvist'])
        assert s.scrub("Anna's bridge held Anna’s books") == '[name] bridge held [name] books'

    def test_case_sensitive_for_common_word_names(self):
        s = Scrubber(['Will Turner'])
        out = s.scrub('Will said it will hold. WILL agreed.')
        assert out == '[name] said it will hold. [name] agreed.'

    def test_org_names_are_phrases_case_insensitive(self):
        s = Scrubber([], ['Hearthwood Academy'])
        assert s.scrub('at hearthwood academy and Hearthwood Academy') == 'at [school] and [school]'

    def test_emails_phones_handles(self):
        s = Scrubber([])
        out = s.scrub('mail anna@example.com or call (208) 555-0134 or @anna_l')
        assert out == 'mail [email] or call [phone] or [handle]'

    def test_storage_urls_are_removed_external_links_stay(self):
        s = Scrubber([])
        private = ('https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/'
                   'quest-evidence/task-evidence/abc/photo.jpg')
        text = f'see {private} and https://www.youtube.com/watch?v=xyz'
        out = s.scrub(text)
        assert 'quest-evidence' not in out
        assert 'youtube.com' in out
        assert s.find_leaks(text) == [private]

    def test_find_leaks_lists_every_hit(self):
        s = Scrubber(['Anna Lindqvist'], ['Hearthwood'])
        hits = s.find_leaks('Anna went to Hearthwood with anna@x.io')
        assert set(hits) == {'Anna', 'Hearthwood', 'anna@x.io'}
        assert s.find_leaks('nothing here') == []

    def test_scrub_structure_reaches_nested_strings(self):
        s = Scrubber(['Anna'])
        out = s.scrub_structure({'title': 'Anna builds', 'faq': [{'q': 'Who is Anna?', 'n': 3}]})
        assert out == {'title': '[name] builds', 'faq': [{'q': 'Who is [name]?', 'n': 3}]}
        assert s.find_leaks_in(out) == []

    @pytest.mark.parametrize('phone', ['(208) 555-0134', '208-555-0134', '208.555.0134',
                                       '2085550134', '+1 208 555 0134', '+12085550134'])
    def test_phone_shapes(self, phone):
        assert Scrubber([]).scrub(f'call {phone} now') == 'call [phone] now'

    @pytest.mark.parametrize('not_phone', [
        '11111111-1111-1111-1111-111111111111', '5d2e8f10-2233-4455-6677-889900112233',
        '889900112233', '2026-09-11T00:00:00+00:00', '150 XP in 2026', '12345',
    ])
    def test_uuids_dates_and_numbers_are_not_phones(self, not_phone):
        s = Scrubber([])
        assert s.scrub(not_phone) == not_phone
        assert s.find_leaks(not_phone) == []

    def test_identifier_keys_are_never_rewritten(self):
        s = Scrubber(['Anna'])
        value = {'asset_id': 'Anna-2085550134', 'alt': 'Anna at 2085550134',
                 'items': [{'id': 'Anna', 'caption': 'Anna'}]}
        out = s.scrub_structure(value)
        assert out == {'asset_id': 'Anna-2085550134', 'alt': '[name] at [phone]',
                       'items': [{'id': 'Anna', 'caption': '[name]'}]}
        assert s.find_leaks_in(out) == []

    def test_short_and_stop_tokens_are_ignored(self):
        s = Scrubber(['J de la Cruz'])
        assert s.tokens == ['Cruz']

    def test_empty_scrubber_leaves_text_alone(self):
        s = Scrubber([])
        assert s.scrub('Nothing to see') == 'Nothing to see'
        assert s.scrub(None) is None


class TestNeverPublished:
    def test_the_list_names_the_private_columns(self):
        for column in ('student_user_id', 'consent_id', 'source_id', 'source_ref',
                       'ai_draft', 'safety', 'blockers', 'created_by', 'recorded_by'):
            assert column in NEVER_PUBLISHED


class TestPreparePublicImage:
    def _jpeg_with_exif(self, size=(2400, 1200)):
        img = Image.new('RGB', size, (200, 40, 90))
        exif = Image.Exif()
        exif[0x010F] = 'Apple'                 # Make
        exif[0x9003] = '2026:09:11 10:00:00'   # DateTimeOriginal
        exif[0x0112] = 6                       # Orientation: rotate 90
        out = io.BytesIO()
        img.save(out, format='JPEG', exif=exif.tobytes())
        return out.getvalue()

    def test_strips_metadata_transposes_and_resizes(self):
        jpeg, width, height = prepare_public_image(self._jpeg_with_exif())
        opened = Image.open(io.BytesIO(jpeg))
        assert opened.format == 'JPEG'
        assert not opened.getexif()
        assert 'exif' not in opened.info
        # Orientation 6 turns a 2400x1200 landscape into a portrait, then the
        # long side is capped at 1600.
        assert (width, height) == (opened.width, opened.height)
        assert max(width, height) <= 1600
        assert height > width

    def test_png_becomes_rgb_jpeg(self):
        img = Image.new('RGBA', (300, 200), (10, 20, 30, 255))
        out = io.BytesIO()
        img.save(out, format='PNG')
        jpeg, width, height = prepare_public_image(out.getvalue())
        assert Image.open(io.BytesIO(jpeg)).mode == 'RGB'
        assert (width, height) == (300, 200)

    def test_refuses_non_images(self):
        with pytest.raises(ValueError):
            prepare_public_image(b'%PDF-1.4 not an image')
