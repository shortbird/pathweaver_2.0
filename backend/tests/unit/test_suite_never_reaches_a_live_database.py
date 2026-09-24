"""The unit suite cannot reach a real Supabase project.

tests/conftest.py points SUPABASE_URL at a dead local port before anything
imports config, because backend/.env on a dev machine points at PRODUCTION and
an unmocked read used to go there without anybody noticing (2026-09-24). This
pins that guard: if it is removed or moved below the first config import, the
URL the app reads is the .env one again and this fails.
"""

import os
from urllib.parse import urlparse

import pytest


@pytest.mark.unit
@pytest.mark.skipif(os.getenv('RUN_DB_INTEGRATION_TESTS', '').lower() in ('1', 'true', 'yes'),
                    reason='integration runs use their own local stack')
def test_the_app_config_points_at_a_local_address():
    from app_config import Config

    host = urlparse(Config.SUPABASE_URL or '').hostname
    assert host in ('localhost', '127.0.0.1', '0.0.0.0', 'host.docker.internal'), (
        f'The unit suite would talk to {host}. Keep the SUPABASE_URL guard at '
        'the top of tests/conftest.py, above every import that loads config.'
    )
