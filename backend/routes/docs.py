"""
Documentation Routes
Public and admin API endpoints for the help center / docs system.

Public endpoints (no auth):
- GET /api/public/docs/categories         - list published categories with article counts
- GET /api/public/docs/categories/:slug   - category detail + published articles
- GET /api/public/docs/articles/:slug     - single article (increments view_count)
- GET /api/public/docs/search?q=term      - full-text search

Admin endpoints (superadmin only):
- GET    /api/admin/docs/categories       - all categories (including unpublished)
- POST   /api/admin/docs/categories       - create category
- PUT    /api/admin/docs/categories/:id   - update category
- DELETE /api/admin/docs/categories/:id   - delete category
- GET    /api/admin/docs/articles         - all articles (including unpublished)
- POST   /api/admin/docs/articles         - create article
- PUT    /api/admin/docs/articles/:id     - update article
- DELETE /api/admin/docs/articles/:id     - delete article
- GET    /api/admin/docs/analytics        - view counts, popular articles
"""

from flask import Blueprint, request, jsonify
import re
from database import get_supabase_admin_client
from utils.auth.decorators import require_superadmin
from utils.logger import get_logger

logger = get_logger(__name__)

# Two blueprints: one public, one admin
public_docs_bp = Blueprint('public_docs', __name__, url_prefix='/api/public/docs')
admin_docs_bp = Blueprint('admin_docs', __name__, url_prefix='/api/admin/docs')


def generate_slug(title):
    """Generate a URL-friendly slug from a title."""
    slug = title.lower().strip()
    slug = re.sub(r'[^a-z0-9\s-]', '', slug)
    slug = re.sub(r'[\s]+', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    return slug.strip('-')


# ============================================================
# PUBLIC ENDPOINTS (no auth required)
# ============================================================

@public_docs_bp.route('/categories', methods=['GET'])
def list_public_categories():
    """List published categories with article counts."""
    try:
        client = get_supabase_admin_client()

        result = client.table('docs_categories').select(
            'id, title, slug, description, icon, sort_order'
        ).eq('is_published', True).order('sort_order').execute()

        categories = result.data or []

        # Get article counts per category (only published articles)
        if categories:
            cat_ids = [c['id'] for c in categories]
            articles_result = client.table('docs_articles').select(
                'category_id'
            ).in_('category_id', cat_ids).eq('is_published', True).execute()

            count_map = {}
            for a in (articles_result.data or []):
                cid = a['category_id']
                count_map[cid] = count_map.get(cid, 0) + 1

            for cat in categories:
                cat['article_count'] = count_map.get(cat['id'], 0)

        return jsonify({'success': True, 'categories': categories}), 200

    except Exception as e:
        logger.error(f"Error listing public docs categories: {str(e)}")
        return jsonify({'error': 'Failed to load categories'}), 500


@public_docs_bp.route('/categories/<slug>', methods=['GET'])
def get_public_category(slug):
    """Get a category and its published articles by slug."""
    try:
        client = get_supabase_admin_client()

        cat_result = client.table('docs_categories').select(
            'id, title, slug, description, icon'
        ).eq('slug', slug).eq('is_published', True).execute()

        if not cat_result.data:
            return jsonify({'error': 'Category not found'}), 404

        category = cat_result.data[0]

        articles_result = client.table('docs_articles').select(
            'id, title, slug, summary, target_roles, sort_order'
        ).eq('category_id', category['id']).eq(
            'is_published', True
        ).order('sort_order').execute()

        category['articles'] = articles_result.data or []

        return jsonify({'success': True, 'category': category}), 200

    except Exception as e:
        logger.error(f"Error getting public category '{slug}': {str(e)}")
        return jsonify({'error': 'Failed to load category'}), 500


@public_docs_bp.route('/articles/<slug>', methods=['GET'])
def get_public_article(slug):
    """Get a single published article by slug. Increments view count."""
    try:
        client = get_supabase_admin_client()

        result = client.table('docs_articles').select(
            'id, title, slug, content, summary, target_roles, '
            'category_id, view_count, created_at, updated_at'
        ).eq('slug', slug).eq('is_published', True).execute()

        if not result.data:
            return jsonify({'error': 'Article not found'}), 404

        article = result.data[0]

        # Increment view count
        new_count = (article.get('view_count') or 0) + 1
        client.table('docs_articles').update(
            {'view_count': new_count}
        ).eq('id', article['id']).execute()
        article['view_count'] = new_count

        # Get category info
        if article.get('category_id'):
            cat_result = client.table('docs_categories').select(
                'title, slug'
            ).eq('id', article['category_id']).execute()
            if cat_result.data:
                article['category'] = cat_result.data[0]

        return jsonify({'success': True, 'article': article}), 200

    except Exception as e:
        logger.error(f"Error getting public article '{slug}': {str(e)}")
        return jsonify({'error': 'Failed to load article'}), 500


@public_docs_bp.route('/search', methods=['GET'])
def search_docs():
    """Full-text search across articles."""
    try:
        q = request.args.get('q', '').strip()
        if not q or len(q) < 2:
            return jsonify({'success': True, 'results': []}), 200

        client = get_supabase_admin_client()

        # Use PostgreSQL full-text search with ts_rank
        search_query = ' & '.join(q.split())
        result = client.rpc('search_docs_articles', {
            'search_query': search_query
        }).execute()

        # Fallback: if RPC doesn't exist, use ILIKE search
        if result.data is None:
            result = client.table('docs_articles').select(
                'id, title, slug, summary, category_id'
            ).eq('is_published', True).or_(
                f"title.ilike.%{q}%,summary.ilike.%{q}%,content.ilike.%{q}%"
            ).limit(20).execute()

        results = result.data or []

        # Enrich with category info
        if results:
            cat_ids = list(set(r.get('category_id') for r in results if r.get('category_id')))
            if cat_ids:
                cats = client.table('docs_categories').select(
                    'id, title, slug'
                ).in_('id', cat_ids).execute()
                cat_map = {c['id']: c for c in (cats.data or [])}
                for r in results:
                    r['category'] = cat_map.get(r.get('category_id'))

        return jsonify({'success': True, 'results': results}), 200

    except Exception as e:
        logger.error(f"Error searching docs: {str(e)}")
        # Fallback to simple ILIKE if RPC fails
        try:
            q = request.args.get('q', '').strip()
            client = get_supabase_admin_client()
            result = client.table('docs_articles').select(
                'id, title, slug, summary, category_id'
            ).eq('is_published', True).or_(
                f"title.ilike.%{q}%,summary.ilike.%{q}%"
            ).limit(20).execute()
            return jsonify({'success': True, 'results': result.data or []}), 200
        except Exception as e2:
            logger.error(f"Fallback search also failed: {str(e2)}")
            return jsonify({'error': 'Search failed'}), 500


# ============================================================
# ADMIN ENDPOINTS (superadmin only)
# ============================================================

@admin_docs_bp.route('/categories', methods=['GET'])
@require_superadmin
def admin_list_categories(user_id):
    """List all categories including unpublished."""
    try:
        client = get_supabase_admin_client()

        result = client.table('docs_categories').select('*').order('sort_order').execute()
        categories = result.data or []

        # Get article counts per category
        if categories:
            cat_ids = [c['id'] for c in categories]
            articles_result = client.table('docs_articles').select(
                'category_id'
            ).in_('category_id', cat_ids).execute()

            count_map = {}
            for a in (articles_result.data or []):
                cid = a['category_id']
                count_map[cid] = count_map.get(cid, 0) + 1

            for cat in categories:
                cat['article_count'] = count_map.get(cat['id'], 0)

        return jsonify({'success': True, 'categories': categories}), 200

    except Exception as e:
        logger.error(f"Error listing admin docs categories: {str(e)}")
        return jsonify({'error': 'Failed to load categories'}), 500


@admin_docs_bp.route('/categories', methods=['POST'])
@require_superadmin
def admin_create_category(user_id):
    """Create a new category."""
    try:
        data = request.get_json() or {}
        title = data.get('title', '').strip()
        if not title:
            return jsonify({'error': 'Title is required'}), 400

        slug = data.get('slug') or generate_slug(title)

        client = get_supabase_admin_client()

        result = client.table('docs_categories').insert({
            'title': title,
            'slug': slug,
            'description': data.get('description', ''),
            'icon': data.get('icon', ''),
            'sort_order': data.get('sort_order', 0),
            'is_published': data.get('is_published', True)
        }).execute()

        return jsonify({'success': True, 'category': result.data[0]}), 201

    except Exception as e:
        logger.error(f"Error creating docs category: {str(e)}")
        if 'duplicate key' in str(e).lower() or 'unique' in str(e).lower():
            return jsonify({'error': 'A category with this slug already exists'}), 409
        return jsonify({'error': 'Failed to create category'}), 500


@admin_docs_bp.route('/categories/<category_id>', methods=['PUT'])
@require_superadmin
def admin_update_category(user_id, category_id):
    """Update a category."""
    try:
        data = request.get_json() or {}
        client = get_supabase_admin_client()

        update_data = {}
        if 'title' in data:
            update_data['title'] = data['title'].strip()
        if 'slug' in data:
            update_data['slug'] = data['slug'].strip()
        if 'description' in data:
            update_data['description'] = data['description']
        if 'icon' in data:
            update_data['icon'] = data['icon']
        if 'sort_order' in data:
            update_data['sort_order'] = data['sort_order']
        if 'is_published' in data:
            update_data['is_published'] = data['is_published']

        if not update_data:
            return jsonify({'error': 'No fields to update'}), 400

        result = client.table('docs_categories').update(
            update_data
        ).eq('id', category_id).execute()

        if not result.data:
            return jsonify({'error': 'Category not found'}), 404

        return jsonify({'success': True, 'category': result.data[0]}), 200

    except Exception as e:
        logger.error(f"Error updating docs category: {str(e)}")
        if 'duplicate key' in str(e).lower() or 'unique' in str(e).lower():
            return jsonify({'error': 'A category with this slug already exists'}), 409
        return jsonify({'error': 'Failed to update category'}), 500


@admin_docs_bp.route('/categories/<category_id>', methods=['DELETE'])
@require_superadmin
def admin_delete_category(user_id, category_id):
    """Delete a category and its articles (CASCADE)."""
    try:
        client = get_supabase_admin_client()

        result = client.table('docs_categories').delete().eq(
            'id', category_id
        ).execute()

        if not result.data:
            return jsonify({'error': 'Category not found'}), 404

        return jsonify({'success': True, 'message': 'Category deleted'}), 200

    except Exception as e:
        logger.error(f"Error deleting docs category: {str(e)}")
        return jsonify({'error': 'Failed to delete category'}), 500


@admin_docs_bp.route('/articles', methods=['GET'])
@require_superadmin
def admin_list_articles(user_id):
    """List all articles including unpublished."""
    try:
        client = get_supabase_admin_client()

        result = client.table('docs_articles').select(
            'id, title, slug, summary, category_id, target_roles, '
            'sort_order, is_published, view_count, created_at, updated_at'
        ).order('updated_at', desc=True).execute()

        articles = result.data or []

        # Enrich with category names
        if articles:
            cat_ids = list(set(a.get('category_id') for a in articles if a.get('category_id')))
            if cat_ids:
                cats = client.table('docs_categories').select(
                    'id, title, slug'
                ).in_('id', cat_ids).execute()
                cat_map = {c['id']: c for c in (cats.data or [])}
                for a in articles:
                    a['category'] = cat_map.get(a.get('category_id'))

        return jsonify({'success': True, 'articles': articles}), 200

    except Exception as e:
        logger.error(f"Error listing admin docs articles: {str(e)}")
        return jsonify({'error': 'Failed to load articles'}), 500


@admin_docs_bp.route('/articles', methods=['POST'])
@require_superadmin
def admin_create_article(user_id):
    """Create a new article."""
    try:
        data = request.get_json() or {}
        title = data.get('title', '').strip()
        content = data.get('content', '').strip()

        if not title:
            return jsonify({'error': 'Title is required'}), 400
        if not content:
            return jsonify({'error': 'Content is required'}), 400

        slug = data.get('slug') or generate_slug(title)

        client = get_supabase_admin_client()

        insert_data = {
            'title': title,
            'slug': slug,
            'content': content,
            'summary': data.get('summary', ''),
            'category_id': data.get('category_id'),
            'target_roles': data.get('target_roles', []),
            'sort_order': data.get('sort_order', 0),
            'is_published': data.get('is_published', True),
            'created_by': user_id
        }

        result = client.table('docs_articles').insert(insert_data).execute()

        return jsonify({'success': True, 'article': result.data[0]}), 201

    except Exception as e:
        logger.error(f"Error creating docs article: {str(e)}")
        if 'duplicate key' in str(e).lower() or 'unique' in str(e).lower():
            return jsonify({'error': 'An article with this slug already exists'}), 409
        return jsonify({'error': 'Failed to create article'}), 500


@admin_docs_bp.route('/articles/<article_id>', methods=['GET'])
@require_superadmin
def admin_get_article(user_id, article_id):
    """Get a single article by ID (including content, for editing)."""
    try:
        client = get_supabase_admin_client()

        result = client.table('docs_articles').select('*').eq(
            'id', article_id
        ).execute()

        if not result.data:
            return jsonify({'error': 'Article not found'}), 404

        return jsonify({'success': True, 'article': result.data[0]}), 200

    except Exception as e:
        logger.error(f"Error getting admin article: {str(e)}")
        return jsonify({'error': 'Failed to load article'}), 500


@admin_docs_bp.route('/articles/<article_id>', methods=['PUT'])
@require_superadmin
def admin_update_article(user_id, article_id):
    """Update an article."""
    try:
        data = request.get_json() or {}
        client = get_supabase_admin_client()

        update_data = {}
        for field in ['title', 'slug', 'content', 'summary', 'category_id',
                       'target_roles', 'sort_order', 'is_published']:
            if field in data:
                val = data[field]
                if isinstance(val, str):
                    val = val.strip()
                update_data[field] = val

        if not update_data:
            return jsonify({'error': 'No fields to update'}), 400

        result = client.table('docs_articles').update(
            update_data
        ).eq('id', article_id).execute()

        if not result.data:
            return jsonify({'error': 'Article not found'}), 404

        return jsonify({'success': True, 'article': result.data[0]}), 200

    except Exception as e:
        logger.error(f"Error updating docs article: {str(e)}")
        if 'duplicate key' in str(e).lower() or 'unique' in str(e).lower():
            return jsonify({'error': 'An article with this slug already exists'}), 409
        return jsonify({'error': 'Failed to update article'}), 500


@admin_docs_bp.route('/articles/<article_id>', methods=['DELETE'])
@require_superadmin
def admin_delete_article(user_id, article_id):
    """Delete an article."""
    try:
        client = get_supabase_admin_client()

        result = client.table('docs_articles').delete().eq(
            'id', article_id
        ).execute()

        if not result.data:
            return jsonify({'error': 'Article not found'}), 404

        return jsonify({'success': True, 'message': 'Article deleted'}), 200

    except Exception as e:
        logger.error(f"Error deleting docs article: {str(e)}")
        return jsonify({'error': 'Failed to delete article'}), 500


@admin_docs_bp.route('/analytics', methods=['GET'])
@require_superadmin
def admin_docs_analytics(user_id):
    """Get docs analytics: popular articles, total views, etc."""
    try:
        client = get_supabase_admin_client()

        # Top articles by views
        top_result = client.table('docs_articles').select(
            'id, title, slug, view_count, category_id'
        ).order('view_count', desc=True).limit(20).execute()

        # Total counts
        all_articles = client.table('docs_articles').select('id, is_published, view_count').execute()
        articles_data = all_articles.data or []

        total_articles = len(articles_data)
        published_articles = sum(1 for a in articles_data if a.get('is_published'))
        total_views = sum(a.get('view_count', 0) for a in articles_data)

        cats = client.table('docs_categories').select('id').execute()
        total_categories = len(cats.data or [])

        return jsonify({
            'success': True,
            'analytics': {
                'total_articles': total_articles,
                'published_articles': published_articles,
                'total_categories': total_categories,
                'total_views': total_views,
                'top_articles': top_result.data or []
            }
        }), 200

    except Exception as e:
        logger.error(f"Error getting docs analytics: {str(e)}")
        return jsonify({'error': 'Failed to load analytics'}), 500
