"""A display name or a bio cannot carry a way off the platform."""

import pytest

from utils.validation.profile_text import contact_detail_violation, contact_detail_error


@pytest.mark.parametrize('value,what', [
    ('Sam 801-555-0199', 'phone number'),
    ('sam@example.com', 'email address'),
    ('find me at www.example.com/sam', 'link'),
    ('i live at 12 Maple Street', 'street address'),
])
def test_a_contact_detail_in_a_name_or_bio_is_named_and_refused(value, what):
    error = contact_detail_error(value, 'display name')
    assert error == f'Your display name cannot include a {what}. Keep contact details off the platform.'
    assert what in contact_detail_violation({'display_name': value})


@pytest.mark.parametrize('value', ['Sam', "O'Brien-Lee", 'I love Roblox and my 2 dogs', ''])
def test_an_ordinary_name_or_bio_passes(value):
    assert contact_detail_error(value, 'bio') is None
    assert contact_detail_violation({'bio': value, 'display_name': 'Sam'}) is None


def test_fields_not_in_the_update_are_not_checked():
    assert contact_detail_violation({'avatar_url': 'https://x/y.jpg', 'bio': None}) is None
