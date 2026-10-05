"""The Bloomy Customer Data API v1 (bloomylearning.com), read-only.

Bloomy publishes no developer portal; the contract is the guide its teacher
dashboard links from the school's Data API tab
(https://app.bloomylearning.com/assets/customer-api/guide.html). What matters
here:

  - Bearer auth. A key is limited to one school and read-only progress; names
    come only when the key was made with student_names:read.
  - GET /students: the roster with lifetime learning_hours and skill counts.
  - GET /student-progress?date=YYYY-MM-DD: one record per skill a student
    worked on that Pacific day (task_mastered_on_date says whether it was
    earned that day), plus a coverage record with task_id null when they did
    nothing. Only today and the seven Pacific days before it are served.
  - Every list pages by pagination.next_cursor; follow it until null.
  - 429/500/503 are temporary; 413 means "ask for fewer students per page".

Never log the key or a response body: both carry student data.
"""

import time
from typing import Any, Dict, List, Optional
from urllib.parse import quote

import requests

from utils.logger import get_logger

logger = get_logger(__name__)

BASE_URL = 'https://api.bloomylearning.com/functions/v1/customer-api-v1'
PAGE_LIMIT = 200
TIMEOUT_SECONDS = 30
RETRY_STATUSES = (429, 500, 503)
MAX_ATTEMPTS = 3
MAX_PAGES = 50  # 200 students a page; a school past 10,000 is not this API's case


class BloomyError(Exception):
    """A request Bloomy refused or that never completed. `status` is the HTTP
    status (None for a network failure); 401/403 mean the key is wrong,
    expired or revoked."""

    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.status = status


class BloomyClient:
    def __init__(self, api_key: str, session: Optional[requests.Session] = None):
        if not api_key:
            raise BloomyError('No Bloomy API key')
        self._key = api_key
        self._http = session or requests.Session()

    def _get(self, path: str, params: Dict[str, Any]) -> Dict[str, Any]:
        for attempt in range(MAX_ATTEMPTS):
            try:
                resp = self._http.get(f'{BASE_URL}{path}', params=params,
                                      headers={'Authorization': f'Bearer {self._key}'},
                                      timeout=TIMEOUT_SECONDS)
            except requests.RequestException as e:
                if attempt < MAX_ATTEMPTS - 1:
                    time.sleep(2 ** attempt)
                    continue
                raise BloomyError(f'Bloomy did not answer: {type(e).__name__}') from e
            if resp.status_code in RETRY_STATUSES and attempt < MAX_ATTEMPTS - 1:
                try:
                    wait = min(max(int(resp.headers.get('Retry-After') or 0), 1), 60)
                except ValueError:
                    wait = 2 ** attempt
                time.sleep(wait)
                continue
            if not 200 <= resp.status_code < 300:
                request_id = resp.headers.get('X-Request-Id') or 'unavailable'
                raise BloomyError(f'Bloomy answered {resp.status_code} (request {request_id})',
                                  status=resp.status_code)
            try:
                return resp.json()
            except ValueError as e:
                raise BloomyError('Bloomy returned something that is not JSON',
                                  status=resp.status_code) from e
        raise BloomyError('Bloomy kept failing; retries exhausted')

    def _all_pages(self, path: str, params: Dict[str, Any]) -> List[Dict[str, Any]]:
        records: List[Dict[str, Any]] = []
        cursor = None
        seen = set()
        limit = PAGE_LIMIT
        for _ in range(MAX_PAGES):
            query = {**params, 'limit': limit}
            if cursor:
                query['cursor'] = cursor
            try:
                payload = self._get(path, query)
            except BloomyError as e:
                if e.status == 413 and limit > 1:
                    limit = max(1, limit // 2)
                    continue
                raise
            page = payload.get('records')
            pagination = payload.get('pagination') or {}
            if not isinstance(page, list):
                raise BloomyError('Bloomy returned an unexpected response shape')
            records.extend(page)
            next_cursor = pagination.get('next_cursor')
            if not next_cursor:
                return records
            if next_cursor in seen:
                raise BloomyError('Bloomy repeated a pagination cursor')
            seen.add(next_cursor)
            cursor = next_cursor
        raise BloomyError('Bloomy returned more pages than expected')

    def students(self) -> List[Dict[str, Any]]:
        """The school's current roster (Reading and Math classes)."""
        return self._all_pages('/students', {})

    def student_progress(self, activity_date: str) -> List[Dict[str, Any]]:
        """Every record for one Pacific calendar day (YYYY-MM-DD)."""
        return self._all_pages('/student-progress', {'date': activity_date})

    def skills(self, student_id: str) -> List[Dict[str, Any]]:
        """One student's skill progress records (placed, completed, in
        progress, paused). Not the catalog: a missing skill was never touched."""
        return self._all_pages(f'/students/{quote(student_id, safe="")}/skills', {})

    def assessment_attempts(self, student_id: str) -> List[Dict[str, Any]]:
        """One student's Climb and Summit attempts at this school."""
        return self._all_pages(f'/students/{quote(student_id, safe="")}/assessment-attempts', {})
