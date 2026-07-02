"""
Unit tests for the iCreate registration funnel's public config — specifically
the paperwork single-source-of-truth rule: a paperwork item's doc_url comes
from its linked org_resource when one exists, else the configured doc_url.
"""

import pytest

from routes.icreate_registration import _public_config

ORG = {'id': 'org1', 'name': 'iCreate', 'slug': 'icreate', 'branding_config': {}}
CFG = {
    'fee_mode': 'flat',
    'paperwork': [
        {'key': 'guidebook', 'label': 'Family Guidebook', 'doc_url': 'https://x/old-guide.pdf'},
        {'key': 'contract', 'label': 'Student Contract'},
    ],
}


@pytest.mark.unit
class TestPaperworkSourceOfTruth:
    def _paperwork(self, urls=None):
        return {p['key']: p for p in _public_config(ORG, CFG, urls)['paperwork']}

    def test_linked_resource_overrides_configured_doc_url(self):
        pw = self._paperwork({'guidebook': 'https://x/new-guide-v2.pdf'})
        assert pw['guidebook']['doc_url'] == 'https://x/new-guide-v2.pdf'

    def test_unlinked_items_keep_configured_doc_url(self):
        pw = self._paperwork({'guidebook': 'https://x/new-guide-v2.pdf'})
        assert pw['contract']['doc_url'] == ''

    def test_no_links_falls_back_to_config(self):
        pw = self._paperwork(None)
        assert pw['guidebook']['doc_url'] == 'https://x/old-guide.pdf'
