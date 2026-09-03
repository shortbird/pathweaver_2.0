"""The org-neutral registration flag: reads prefer feature_flags.registration,
fall back to the legacy icreate_registration key, and writes mirror both keys
until the rename is deployed (see utils/registration_config.py)."""

from utils.org_secrets import strip_secrets_from_feature_flags
from utils.registration_config import (
    get_registration_config,
    with_registration_config,
)


class TestGetRegistrationConfig:
    def test_prefers_the_new_key(self):
        flags = {'registration': {'enabled': True, 'fee_mode': 'flat'},
                 'icreate_registration': {'enabled': False}}
        assert get_registration_config(flags) == {'enabled': True, 'fee_mode': 'flat'}

    def test_falls_back_to_the_legacy_key(self):
        flags = {'icreate_registration': {'enabled': True}}
        assert get_registration_config(flags) == {'enabled': True}

    def test_empty_when_absent_or_malformed(self):
        assert get_registration_config(None) == {}
        assert get_registration_config({}) == {}
        assert get_registration_config({'registration': 'oops'}) == {}
        assert get_registration_config('not-a-dict') == {}

    def test_malformed_new_key_still_falls_back(self):
        flags = {'registration': 'oops', 'icreate_registration': {'enabled': True}}
        assert get_registration_config(flags) == {'enabled': True}


class TestWithRegistrationConfig:
    def test_writes_only_the_canonical_key_and_keeps_other_flags(self):
        """Blocks P4: the write mirror is gone — a row without the legacy key
        never gains one."""
        cfg = {'enabled': True, 'questions': []}
        flags = with_registration_config({'sis_enabled': True}, cfg)
        assert flags['registration'] == cfg
        assert 'icreate_registration' not in flags
        assert flags['sis_enabled'] is True

    def test_refreshes_a_legacy_key_a_row_still_carries(self):
        """Until the scrub, a stale legacy key must not disagree with the
        canonical one (the read fallback would serve the stale copy to any
        reader that lost the canonical key)."""
        cfg = {'enabled': True}
        flags = with_registration_config(
            {'icreate_registration': {'enabled': False}}, cfg)
        assert flags['registration'] == cfg
        assert flags['icreate_registration'] == cfg

    def test_does_not_mutate_the_input(self):
        original = {'sis_enabled': True}
        with_registration_config(original, {'enabled': True})
        assert original == {'sis_enabled': True}


class TestSecretStrippingCoversBothKeys:
    def test_stripe_key_is_stripped_from_the_new_key_too(self):
        flags = {'registration': {'enabled': True, 'stripe_secret_key': 'sk_live_x'},
                 'icreate_registration': {'enabled': True, 'stripe_secret_key': 'sk_live_x'}}
        cleaned = strip_secrets_from_feature_flags(flags)
        assert 'stripe_secret_key' not in cleaned['registration']
        assert 'stripe_secret_key' not in cleaned['icreate_registration']
        assert cleaned['registration']['enabled'] is True
