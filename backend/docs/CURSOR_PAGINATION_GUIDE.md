# Cursor Pagination Guide

**Created:** December 26, 2025
**Status:** Implemented for anonymous quest listing
**Reference:** ACTIONABLE_PRIORITY_LIST.md (Month 6)

## Overview

Cursor-based pagination provides consistent results even when data changes between requests, making it ideal for high-traffic endpoints and real-time data.

### Benefits

- **Consistent results**: No duplicate/missing items when data changes
- **Better performance**: No OFFSET queries (especially for large datasets)
- **Infinite scroll**: Natural fit for modern UIs
- **Real-time data**: Works well with frequently updated data

## Implementation Status

### Completed

- ✅ **Utility functions** (`backend/utils/pagination.py`)
  - `encode_cursor()` - Encode pagination position
  - `decode_cursor()` - Decode pagination position
  - `get_cursor_params()` - Extract cursor params from request
  - `paginate_cursor()` - Apply cursor pagination to Supabase query
  - `build_cursor_meta()` - Build response metadata

- ✅ **Quest listing endpoint** (`/api/quests` and `/api/v1/quests`)
  - Supports both cursor and page-based pagination
  - Automatic mode detection
  - Backward compatible with legacy clients

### TODO

- ⏳ **Task listing endpoint** (`/api/v1/tasks`)
  - Currently no GET endpoint for tasks exists
  - Tasks are retrieved via quest detail endpoint
  - Would need to create endpoint before adding cursor pagination

- ⏳ **Authenticated quest listing**
  - Repository method `QuestRepository.get_quests_for_user()` needs cursor support
  - Currently falls back to page-based pagination for authenticated users

## Usage

### Making Requests

#### First Request (No cursor)
```bash
GET /api/v1/quests?limit=20
```

#### Subsequent Requests (With cursor)
```bash
GET /api/v1/quests?limit=20&cursor=eyJpZCI6IjEyMyIsImNyZWF0ZWRfYXQiOiIyMDI1LTAxLTAxIn0=
```

### Response Format

```json
{
  "data": [
    {
      "id": "quest-id-1",
      "title": "Quest Title",
      "created_at": "2025-01-01T12:00:00Z",
      ...
    },
    ...
  ],
  "meta": {
    "has_more": true,
    "next_cursor": "eyJpZCI6IjQ1NiIsImNyZWF0ZWRfYXQiOiIyMDI1LTAxLTAyIn0="
  },
  "links": {
    "self": "/api/v1/quests?limit=20",
    "next": "/api/v1/quests?limit=20&cursor=eyJpZCI6IjQ1NiIsImNyZWF0ZWRfYXQiOiIyMDI1LTAxLTAyIn0="
  }
}
```

### Response Fields

- `data`: Array of items for current page
- `meta.has_more`: Boolean indicating if more results exist
- `meta.next_cursor`: Cursor string for next page (if `has_more` is true)
- `links.self`: Current page URL
- `links.next`: Next page URL (if `has_more` is true)

## Backward Compatibility

The quest listing endpoint automatically detects pagination mode:

### Cursor Mode (Recommended)
- Trigger: Request has `cursor` parameter OR `limit` parameter
- Example: `?limit=20` or `?limit=20&cursor=abc123`

### Legacy Mode (Page-based)
- Trigger: Request has `page` parameter OR neither `cursor` nor `limit`
- Example: `?page=2&per_page=20`

## Implementation Details

### Cursor Encoding

Cursors are base64-encoded JSON containing:
```json
{
  "id": "quest-uuid",
  "created_at": "2025-01-01T12:00:00Z"
}
```

This dual-key approach ensures stable ordering even when multiple items have the same timestamp.

### Query Strategy

The `paginate_cursor()` function:
1. Decodes cursor to get last item's position
2. Filters query to items after that position (`created_at < cursor.created_at`)
3. Orders by `created_at DESC, id DESC`
4. Fetches `limit + 1` items to detect if more exist
5. Returns only `limit` items + metadata

### Error Handling

- Invalid cursors are ignored (starts from beginning)
- Cursor decoding errors return 400 with error details
- Malformed cursors fall back to first page

## Frontend Integration

### React Query Example

```javascript
import { useInfiniteQuery } from '@tanstack/react-query';
import api from '@/services/api';

function useQuestsPaginated() {
  return useInfiniteQuery({
    queryKey: ['quests', 'infinite'],
    queryFn: async ({ pageParam = null }) => {
      const params = { limit: 20 };
      if (pageParam) params.cursor = pageParam;

      const response = await api.get('/api/v1/quests', { params });
      return response.data;
    },
    getNextPageParam: (lastPage) => {
      return lastPage.meta?.next_cursor || undefined;
    },
  });
}

// Usage in component
function QuestList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useQuestsPaginated();

  const allQuests = data?.pages.flatMap(page => page.data) ?? [];

  return (
    <>
      {allQuests.map(quest => <QuestCard key={quest.id} quest={quest} />)}
      {hasNextPage && (
        <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
          {isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </>
  );
}
```

## Performance Comparison

### Offset-based (Legacy)
```sql
-- Page 1: OFFSET 0
SELECT * FROM quests ORDER BY created_at DESC LIMIT 20 OFFSET 0;

-- Page 100: OFFSET 1980 (scans 1980 rows to skip them)
SELECT * FROM quests ORDER BY created_at DESC LIMIT 20 OFFSET 1980;
```

### Cursor-based (New)
```sql
-- Page 1: No filter
SELECT * FROM quests ORDER BY created_at DESC, id DESC LIMIT 21;

-- Page 100: Filter only (no row scanning)
SELECT * FROM quests
WHERE created_at < '2025-01-01T10:00:00Z'
ORDER BY created_at DESC, id DESC LIMIT 21;
```

**Performance gain:** O(n) vs O(1) for deep pagination

## Migration Plan

### Phase 1: Infrastructure (Complete)
- ✅ Create pagination utility functions
- ✅ Update quest listing endpoint
- ✅ Add backward compatibility

### Phase 2: Frontend Adoption (TODO)
- Update quest listing UI to use cursor pagination
- Test infinite scroll behavior
- Monitor performance improvements

### Phase 3: Full Migration (TODO)
- Add cursor support to QuestRepository
- Create `/api/v1/tasks` GET endpoint with cursor pagination
- Update other high-traffic endpoints
- Deprecate page-based pagination (6-month notice)

## Testing

### Manual Testing

```bash
# Test first page
curl "http://localhost:5000/api/v1/quests?limit=5"

# Test next page (copy cursor from previous response)
curl "http://localhost:5000/api/v1/quests?limit=5&cursor=<cursor_from_response>"

# Test backward compatibility
curl "http://localhost:5000/api/v1/quests?page=2&per_page=5"
```

### Expected Results

1. First request returns 5 quests + cursor
2. Second request returns next 5 quests + new cursor
3. Legacy request returns page 2 with page metadata

## References

- **API Design Audit:** `API_DESIGN_AUDIT_2025.md` (Section 3: Pagination)
- **Implementation:** `backend/utils/pagination.py`
- **Example Usage:** `backend/routes/quest/listing.py`
- **Priority List:** `ACTIONABLE_PRIORITY_LIST.md` (Month 6, Week 2)