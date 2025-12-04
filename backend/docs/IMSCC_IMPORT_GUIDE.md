# IMSCC Course Import Feature

## Overview

The IMSCC import feature allows admins to upload Canvas course export files (.imscc format) and preview how they will be mapped to the Optio badge/quest system.

**Status**: Phase 1 Complete (Preview Only)
**Phase 2** (Not Yet Implemented): Actual database creation from preview data

## Architecture

### Backend Components

1. **IMSCCParserService** ([backend/services/imscc_parser_service.py](../services/imscc_parser_service.py))
   - Parses IMSCC zip files
   - Extracts course metadata from `imsmanifest.xml` and `course_settings.xml`
   - Parses assignment XML files
   - Generates badge and quest preview objects

2. **Course Import Routes** ([backend/routes/admin/course_import.py](../routes/admin/course_import.py))
   - `POST /api/admin/courses/import/preview` - Parse and preview IMSCC file
   - `POST /api/admin/courses/import/confirm` - (Not implemented) Create records
   - `POST /api/admin/courses/import/validate` - Quick validation check

### Frontend Components

1. **CourseImport Component** ([frontend/src/components/admin/CourseImport.jsx](../../frontend/src/components/admin/CourseImport.jsx))
   - Drag-and-drop file upload
   - File validation (type, size)
   - Preview display with badge and quest details
   - Accessible at `/admin/course-import`

## IMSCC File Structure

IMSCC files are zip archives with the following structure:

```
course_export.imscc
├── imsmanifest.xml              # Required - Course structure
├── course_settings/
│   └── course_settings.xml      # Course metadata
├── assignment_*/
│   └── assignment_*.xml         # Assignment details
├── web_resources/               # HTML content, images
└── wiki_content/                # Course pages
```

## Mapping Logic

### Course → Badge

```
Canvas Course          →  Optio Badge
-----------------      →  -----------
Course Title           →  Badge Name
Course Description     →  Badge Description
Course Code            →  course_code metadata
Total Assignments      →  min_quests
Assignments × 100 XP   →  min_xp (default)
Sum of Canvas Points   →  total_canvas_points (metadata)
```

**Badge Type**: `lms_course` (new enum value to be added to database)

### Assignment → Quest

```
Canvas Assignment      →  Optio Quest
-----------------      →  -----------
Assignment Title       →  Quest Title
Instructions           →  Quest Description
Assignment ID          →  lms_assignment_id
Points Possible        →  metadata.canvas_points
Submission Types       →  metadata.submission_types
Due Date               →  metadata.due_date
```

**Quest Type**: `course` (existing type)
**Platform**: `canvas`

### Quest → Badge Relationship

Uses existing `badge_quests` junction table:
```sql
badge_quests (
  badge_id → new badge UUID
  quest_id → new quest UUID
  is_required → TRUE (all assignments required)
  order_index → assignment position (1, 2, 3...)
)
```

## Testing

### Manual Testing Steps

1. **Get a Sample IMSCC File**
   - Go to a Canvas course
   - Settings → Export Course Content
   - Select "Export" and download the .imscc file

2. **Test Upload**
   - Navigate to https://optio-dev-frontend.onrender.com/admin/course-import
   - Upload the .imscc file
   - Click "Parse & Preview"

3. **Verify Preview Data**
   - Badge section should show course name, description, stats
   - Quests section should list all assignments
   - Each quest should show title, description, XP, Canvas points

### API Testing with curl

```bash
# Preview endpoint
curl -X POST https://optio-dev-backend.onrender.com/api/admin/courses/import/preview \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "imscc_file=@/path/to/course.imscc"

# Validation endpoint
curl -X POST https://optio-dev-backend.onrender.com/api/admin/courses/import/validate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "imscc_file=@/path/to/course.imscc"
```

### Expected Response Format

```json
{
  "success": true,
  "course": {
    "title": "Introduction to Biology",
    "description": "A comprehensive biology course",
    "course_code": "BIO101",
    "modules": [...],
    "assignment_refs": [...]
  },
  "badge_preview": {
    "name": "Introduction to Biology",
    "description": "A comprehensive biology course",
    "badge_type": "lms_course",
    "pillar_primary": "stem",
    "min_quests": 15,
    "min_xp": 1500,
    "total_canvas_points": 1000,
    "metadata": {...}
  },
  "quests_preview": [
    {
      "title": "Chapter 1 Quiz",
      "description": "Test your knowledge...",
      "quest_type": "course",
      "lms_platform": "canvas",
      "estimated_xp": 100,
      "metadata": {
        "canvas_points": 50,
        "submission_types": ["online_quiz"],
        "due_date": "2024-02-15T23:59:00Z"
      }
    }
  ],
  "stats": {
    "total_assignments": 15,
    "total_modules": 4,
    "has_course_settings": true
  },
  "upload_info": {
    "filename": "biology_101_export.imscc",
    "file_size_mb": 12.5,
    "uploaded_by": "user-uuid"
  }
}
```

## Limitations

### Current Implementation (Phase 1)
- Preview only - no database creation
- Does not handle embedded resources (images, files)
- Basic HTML cleaning (strips tags)
- No duplicate detection
- No pillar customization UI

### Known Issues
- Very large courses (100+ assignments) may be slow to parse
- Some Canvas export versions may have different XML structures
- Submission types are stored as strings (not validated)

## Future Enhancements (Phase 2)

1. **Import Confirmation**
   - Admin reviews and customizes preview
   - Select primary pillar for badge
   - Adjust XP values per quest
   - Mark quests as optional/required

2. **Pillar Mapping**
   - Use AI to suggest pillar assignments
   - Manual override per quest
   - Subject-based pillar inference

3. **Resource Handling**
   - Upload images to Supabase storage
   - Preserve embedded content in descriptions
   - Handle file attachments

4. **Duplicate Detection**
   - Check if course already imported (by course_code or lms_course_id)
   - Offer to update existing course vs create new

5. **Background Processing**
   - Queue large imports
   - Progress tracking
   - Email notification on completion

## Database Schema Changes Needed (Phase 2)

```sql
-- Add lms_course badge type
ALTER TYPE badge_type ADD VALUE IF NOT EXISTS 'lms_course';

-- Add course tracking table (optional)
CREATE TABLE course_imports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  badge_id UUID REFERENCES badges(id),
  canvas_course_id VARCHAR,
  canvas_course_code VARCHAR,
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by UUID REFERENCES users(id),
  assignment_count INTEGER,
  metadata JSONB
);
```

## Error Handling

The parser handles these error cases:

1. **Invalid file type** → 400 error with message
2. **File too large (>100MB)** → 400 error with message
3. **Missing imsmanifest.xml** → 400 error "Invalid IMSCC file"
4. **Malformed XML** → 400 error with parse details
5. **No assignments found** → Success with empty quests_preview array

## Security Considerations

- Admin-only endpoints (require_admin decorator)
- File size limit: 100MB
- File type validation: .imscc or .zip only
- No file persistence (parsed in-memory)
- XML parsing uses standard library (no XXE vulnerabilities)

## Related Files

- Parser Service: [backend/services/imscc_parser_service.py](../services/imscc_parser_service.py)
- API Routes: [backend/routes/admin/course_import.py](../routes/admin/course_import.py)
- Frontend Component: [frontend/src/components/admin/CourseImport.jsx](../../frontend/src/components/admin/CourseImport.jsx)
- Admin Page: [frontend/src/pages/AdminPage.jsx](../../frontend/src/pages/AdminPage.jsx)
- App Registration: [backend/app.py](../app.py) (line 129)

## Contact

For issues or questions about this feature, see project documentation or GitHub issues.
