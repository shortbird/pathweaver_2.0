"""The family photo (/api/parent/family-cover) and the image-upload recipe it
shares with the child avatar route (utils.image_utils.store_image_upload)."""

import io
from unittest.mock import MagicMock, patch

import pytest
from flask import Flask
from werkzeug.datastructures import FileStorage

from middleware.error_handler import ValidationError
from routes.parent import family_cover
from utils.image_utils import store_image_upload


PARENT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'


def _innermost(view):
    while hasattr(view, '__wrapped__'):
        view = view.__wrapped__
    return view


def _file(name='family.jpg', content_type='image/jpeg', size=10):
    return FileStorage(stream=io.BytesIO(b'x' * size), filename=name, content_type=content_type)


@pytest.fixture
def app():
    return Flask(__name__)


class TestStoreImageUpload:
    def test_refuses_a_non_image(self):
        with pytest.raises(ValidationError, match='Invalid file type'):
            store_image_upload(MagicMock(), _file('notes.pdf', 'application/pdf'), 'x')

    def test_refuses_an_oversized_file(self):
        with pytest.raises(ValidationError, match='Maximum size is 1MB'):
            store_image_upload(MagicMock(), _file(size=1024 * 1024 + 1), 'x', max_bytes=1024 * 1024)

    def test_refuses_an_empty_upload(self):
        with pytest.raises(ValidationError, match='No file selected'):
            store_image_upload(MagicMock(), _file(name=''), 'x')

    def test_puts_the_image_in_the_private_bucket_and_returns_the_pointer(self):
        supabase = MagicMock()
        pointer = store_image_upload(supabase, _file(), 'family-covers/' + PARENT)
        supabase.storage.from_.assert_called_with('user-uploads')
        kwargs = supabase.storage.from_.return_value.upload.call_args.kwargs
        assert kwargs['path'].startswith(f'family-covers/{PARENT}/')
        assert kwargs['path'].endswith('.jpg')
        assert kwargs['file_options'] == {'content-type': 'image/jpeg'}
        assert pointer.endswith('/user-uploads/' + kwargs['path'])


class TestFamilyCoverRoutes:
    def _client(self):
        client = MagicMock()
        client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
            'family_cover_url': 'https://x.supabase.co/storage/v1/object/public/user-uploads/family-covers/p/1.jpg',
        }
        return client

    def test_get_signs_the_stored_pointer(self, app):
        client = self._client()
        with app.test_request_context('/api/parent/family-cover'), \
                patch.object(family_cover, 'get_supabase_admin_client', return_value=client), \
                patch.object(family_cover, 'sign_stored_url', side_effect=lambda v, b: f'signed:{v}' if v else None):
            body = _innermost(family_cover.get_family_cover)(PARENT).get_json()
        assert body['family_cover_url'].startswith('signed:')

    def test_post_stores_the_image_on_the_parent_row(self, app):
        client = self._client()
        data = {'cover': (io.BytesIO(b'jpegbytes'), 'us.jpg', 'image/jpeg')}
        with app.test_request_context('/api/parent/family-cover', method='POST', data=data,
                                      content_type='multipart/form-data'), \
                patch.object(family_cover, 'get_supabase_admin_client', return_value=client), \
                patch.object(family_cover, 'store_image_upload', return_value='pointer') as store, \
                patch.object(family_cover, 'sign_stored_url', side_effect=lambda v, b: f'signed:{v}'):
            body = _innermost(family_cover.upload_family_cover)(PARENT).get_json()
        assert store.call_args.args[2] == f'family-covers/{PARENT}'
        client.table.return_value.update.assert_called_with({'family_cover_url': 'pointer'})
        client.table.return_value.update.return_value.eq.assert_called_with('id', PARENT)
        assert body == {'success': True, 'family_cover_url': 'signed:pointer'}

    def test_post_without_a_file_is_a_validation_error(self, app):
        with app.test_request_context('/api/parent/family-cover', method='POST'), \
                patch.object(family_cover, 'get_supabase_admin_client', return_value=self._client()):
            with pytest.raises(ValidationError):
                _innermost(family_cover.upload_family_cover)(PARENT)

    def test_delete_clears_the_row(self, app):
        client = self._client()
        with app.test_request_context('/api/parent/family-cover', method='DELETE'), \
                patch.object(family_cover, 'get_supabase_admin_client', return_value=client):
            body = _innermost(family_cover.remove_family_cover)(PARENT).get_json()
        client.table.return_value.update.assert_called_with({'family_cover_url': None})
        assert body == {'success': True, 'family_cover_url': None}
