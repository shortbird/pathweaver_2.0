"""Test suite for OptioQuest backend"""

import os
from urllib.parse import urlparse

# The unit suite never talks to a real database. backend/.env points at the
# PRODUCTION project on a dev machine, and load_dotenv fills SUPABASE_URL from
# it on the first import of config. A test that forgot a mock then read
# production through the admin client, and the code under test swallowed any
# error, so nobody saw it (found 2026-09-24: running the suite against a dead
# URL failed only 2 tests, yet other runs had read production).
#
# Setting the URL here wins over .env, because load_dotenv does not override a
# variable that is already set. It has to be HERE, not in conftest.py: this
# package's __init__ runs before conftest.py, and the logger import below
# already loads config. An unmocked read now fails fast against a port nothing
# listens on instead of reaching a live project.
#
# Integration runs (RUN_DB_INTEGRATION_TESTS=1) keep their URL; the
# live_supabase fixtures in conftest.py still refuse anything that is not a local stack.
_LOCAL_DB_HOSTS = ('localhost', '127.0.0.1', '0.0.0.0', 'host.docker.internal')
if os.getenv('RUN_DB_INTEGRATION_TESTS', '').lower() not in ('1', 'true', 'yes'):
    if (urlparse(os.getenv('SUPABASE_URL') or '').hostname or '') not in _LOCAL_DB_HOSTS:
        os.environ['SUPABASE_URL'] = 'http://127.0.0.1:9'

from utils.logger import get_logger  # noqa: E402

logger = get_logger(__name__)
