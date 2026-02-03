# Pagination Standardization Guide

**Created:** December 26, 2025
**Status:** Pattern established, gradual migration in progress

## Overview

This guide documents the standardized pagination pattern for all Optio API endpoints. The pattern uses `page` and `per_page` parameters (not `limit`/`offset`) with consistent metadata in responses.

## Why Standardize Pagination?

**Current Problem:**
- 45% of endpoints use `page`/`per_page`
- 35% use `limit`/`offset`
- 20% have no pagination
- Response formats are inconsistent

**Benefits of Standardization:**
- Predictable API behavior for clients
- Consistent frontend pagination components
- Better LMS integration readiness
- Self-documenting through metadata

## Standard Pagination Pattern

### Request Parameters

```
GET /api/v1/quests?page=2&per_page=20
```

- **page**: Page number (1-indexed, default: 1)
- **per_page**: Items per page (default: 20, max: 100)

### Response Format

```json
{
  "data": [...],
  "meta": {
    "total": 156,
    "page": 2,
    "per_page": 20,
    "pages": 8
  },
  "links": {
    "self": "/api/v1/quests?page=2",
    "first": "/api/v1/quests?page=1",
    "last": "/api/v1/quests?page=8",
    "next": "/api/v1/quests?page=3",
    "prev": "/api/v1/quests?page=1"
  }
}
```

## Using the Pagination Helpers

### Helper Functions

Located in `backend/utils/pagination.py`:

1. **get_pagination_params()** - Extract and validate pagination params from request
2. **paginate()** - Apply pagination to Supabase query
3. **build_pagination_meta()** - Build pagination metadata with HATEOAS links
4. **paginate_list()** - Paginate an in-memory list

### Pattern 1: Database Query Pagination

**For Supabase queries that return large result sets:**

```python
from utils.pagination import get_pagination_params, paginate, build_pagination_meta
from utils.api_response_v1 import success_response

@bp.route('/quests', methods=['GET'])
def list_quests():
    # Get validated pagination params
    page, per_page = get_pagination_params(default_per_page=20)

    # Build base query
    query = supabase.table('quests').select('*', count='exact')

    # Apply pagination
    paginated_query, meta_info = paginate(query, page, per_page)

    # Execute query
    result = paginated_query.execute()

    # Build full pagination metadata
    meta, links = build_pagination_meta(
        total=result.count,
        page=page,
        per_page=per_page,
        base_url='/api/quests'
    )

    return success_response(
        data=result.data,
        meta=meta,
        links=links
    )
```

### Pattern 2: In-Memory List Pagination

**For lists already in memory (e.g., after filtering):**

```python
from utils.pagination import get_pagination_params, paginate_list
from utils.api_response_v1 import success_response

@bp.route('/quests/featured', methods=['GET'])
def get_featured_quests():
    # Get all quests and filter in memory
    all_quests = get_all_quests()
    featured = [q for q in all_quests if q['is_featured']]

    # Get pagination params
    page, per_page = get_pagination_params(default_per_page=12)

    # Paginate the list
    data, meta, links = paginate_list(
        items=featured,
        page=page,
        per_page=per_page,
        base_url='/api/quests/featured'
    )

    return success_response(
        data=data,
        meta=meta,
        links=links
    )
```

### Pattern 3: Service Layer with limit/offset

**When the service layer expects limit/offset:**

```python
from utils.pagination import get_pagination_params
from utils.api_response_v1 import success_response

@bp.route('/messages', methods=['GET'])
def get_messages():
    # Get pagination params
    page, per_page = get_pagination_params(default_per_page=50)

    # Convert to limit/offset for service call
    limit = per_page
    offset = (page - 1) * per_page

    # Call service with limit/offset
    messages = message_service.get_messages(limit=limit, offset=offset)

    # Return with page/per_page in response
    return success_response({
        'messages': messages,
        'page': page,
        'per_page': per_page,
        'count': len(messages)
    })
```

## Migration Strategy

### Pragmatic Approach (Current)

Following the codebase philosophy from CLAUDE.md:

1. ✅ **Established the pattern** - Created `backend/utils/pagination.py`
2. ✅ **Documented the pattern** - This guide
3. 🔄 **Gradual migration** - Update endpoints when touched for other work
4. ⚡ **Enforce for new code** - All NEW endpoints must use this pattern

### Do NOT:

- Mass-migrate all 30+ endpoints at once (risky, breaks things)
- Force migration on working endpoints that aren't being changed
- Use `limit`/`offset` in NEW endpoints

### DO:

- Use this pattern for all NEW endpoints
- Migrate existing endpoints when you touch them for other reasons
- Update endpoint when adding features/fixing bugs

## Files Using Pagination

### Already Using page/per_page (12 files)

These endpoints can be enhanced with metadata/links:

- `backend/routes/quest/listing.py`
- `backend/routes/users/completed_quests.py`
- `backend/routes/admin/quest_management.py`
- `backend/routes/admin/task_approval.py`
- `backend/routes/admin/badge_management.py`
- `backend/routes/admin/user_management.py`
- And 6 more...

### Using limit/offset (17 files)

These should be migrated when touched:

- `backend/routes/direct_messages.py`
- `backend/routes/learning_events.py`
- `backend/routes/tutor/chat.py`
- `backend/routes/admin/crm.py`
- `backend/routes/admin/masquerade.py`
- `backend/routes/admin/subject_backfill.py`
- `backend/routes/admin/task_flags.py`
- And 10 more...

## Testing Pagination

### Manual Testing

```bash
# Test first page
curl "https://optio-dev-backend.onrender.com/api/quests?page=1&per_page=5"

# Test second page
curl "https://optio-dev-backend.onrender.com/api/quests?page=2&per_page=5"

# Test last page
curl "https://optio-dev-backend.onrender.com/api/quests?page=10&per_page=5"

# Test invalid parameters
curl "https://optio-dev-backend.onrender.com/api/quests?page=0&per_page=1000"
# Should default to page=1 and cap per_page at 100
```

### Expected Behavior

- `page < 1` defaults to `1`
- `per_page > 100` caps at `100`
- `per_page < 1` defaults to endpoint default
- Out of range pages return empty data (not 404)

## Frontend Usage

### React Query with Pagination

```javascript
import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

function useQuestsList(page = 1, perPage = 12) {
  return useQuery({
    queryKey: ['quests', 'list', page, perPage],
    queryFn: async () => {
      const response = await api.get('/api/quests', {
        params: { page, per_page: perPage }
      });

      return {
        quests: response.data.data,
        pagination: {
          ...response.data.meta,
          links: response.data.links
        }
      };
    },
    keepPreviousData: true // Smooth pagination transitions
  });
}
```

### Pagination Component

```javascript
function QuestPagination({ currentPage, totalPages, onPageChange }) {
  return (
    <div className="flex gap-2">
      <button
        disabled={currentPage === 1}
        onClick={() => onPageChange(currentPage - 1)}
      >
        Previous
      </button>

      <span>Page {currentPage} of {totalPages}</span>

      <button
        disabled={currentPage === totalPages}
        onClick={() => onPageChange(currentPage + 1)}
      >
        Next
      </button>
    </div>
  );
}
```

## Performance Considerations

### Use Pagination for:

- Any endpoint that can return > 20 items
- Admin dashboards listing users/quests/tasks
- Message histories
- Activity logs
- Search results

### Don't Paginate:

- Dropdown/select options (<100 items)
- User's own badges (limited set)
- Single user's quest enrollments
- Static reference data

### Optimization Tips

1. **Add database indexes** on sorted columns
2. **Use count='exact'** only when you need total pages
3. **Consider cursor pagination** for real-time feeds
4. **Cache total counts** for expensive queries

## Related Documentation

- [API_DESIGN_AUDIT_2025.md](../../API_DESIGN_AUDIT_2025.md) - Identified pagination inconsistency issue
- [ACTIONABLE_PRIORITY_LIST.md](../../ACTIONABLE_PRIORITY_LIST.md) - Week 9 task checklist
- [API_VERSIONING_MIGRATION_PLAN.md](../../API_VERSIONING_MIGRATION_PLAN.md) - Future v2 API plans

## Status Tracking

**Completed:**
- ✅ Created pagination helper utilities
- ✅ Documented standard pattern
- ✅ Identified 30+ endpoints using pagination

**In Progress:**
- 🔄 Gradual migration as endpoints are touched

**Future:**
- ⏳ Add cursor-based pagination for real-time feeds (Month 6)
- ⏳ OpenAPI documentation with pagination examples (Week 11)

---

**Last Updated:** December 26, 2025
**Next Review:** January 26, 2025
**Owner:** Backend Team
