# Sequence Analytics Feature Plan

## Goal
Track how many times each sequence has been triggered and display the count on sequence cards in the CRM dashboard.

---

## Backend Implementation

### 1. Database Schema Addition

**Option A: Add column to `automation_sequences` table**
```sql
ALTER TABLE automation_sequences
ADD COLUMN execution_count INTEGER DEFAULT 0;
```
- **Pros**: Simple, fast queries
- **Cons**: No historical data, can't track individual executions

**Option B: Create `sequence_executions` tracking table** (RECOMMENDED)
```sql
CREATE TABLE sequence_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sequence_id UUID REFERENCES automation_sequences(id) ON DELETE CASCADE,
  recipient_email TEXT NOT NULL,
  recipient_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  context JSONB,  -- Store the variables passed to sequence
  executed_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT,  -- 'promo', 'event_trigger', 'manual', etc.

  -- Index for fast counting
  INDEX idx_sequence_executions_sequence_id ON sequence_executions(sequence_id),
  INDEX idx_sequence_executions_executed_at ON sequence_executions(executed_at)
);
```
- **Pros**: Full audit trail, can generate analytics over time, can see who received what
- **Cons**: Extra table to maintain

**RECOMMENDATION: Option B** - More valuable for marketing analytics

---

### 2. Service Layer Changes

**Update `CampaignAutomationService`:**

```python
# In _process_sequence_step_by_email()
def _process_sequence_step_by_email(self, sequence_id, email, step, context):
    # ... existing email sending logic ...

    # After successful send, log execution
    if success:
        self._log_sequence_execution(
            sequence_id=sequence_id,
            recipient_email=email,
            context=context,
            source='promo'  # or pass as parameter
        )

    return success

def _log_sequence_execution(
    self,
    sequence_id: str,
    recipient_email: str,
    context: Optional[Dict] = None,
    source: str = 'manual',
    recipient_user_id: Optional[str] = None
):
    """Log sequence execution for analytics"""
    try:
        self.admin_client.table('sequence_executions').insert({
            'sequence_id': sequence_id,
            'recipient_email': recipient_email,
            'recipient_user_id': recipient_user_id,
            'context': context,
            'source': source,
            'executed_at': datetime.utcnow().isoformat()
        }).execute()
    except Exception as e:
        logger.error(f"Failed to log sequence execution: {e}")
        # Don't fail email send if logging fails
```

---

### 3. API Endpoint for Analytics

**New endpoint in `backend/routes/admin/crm.py`:**

```python
@crm_bp.route('/sequences/<sequence_id>/analytics', methods=['GET'])
@require_admin
def get_sequence_analytics(user_id, sequence_id):
    """
    Get analytics for a specific sequence

    Query params:
    - time_range: '7d', '30d', '90d', 'all' (default: '30d')
    """
    time_range = request.args.get('time_range', '30d')

    # Calculate date filter
    if time_range != 'all':
        days = int(time_range[:-1])  # Strip 'd' suffix
        start_date = (datetime.utcnow() - timedelta(days=days)).isoformat()

    # Get execution count
    query = supabase.table('sequence_executions').select('*', count='exact')
    query = query.eq('sequence_id', sequence_id)

    if time_range != 'all':
        query = query.gte('executed_at', start_date)

    result = query.execute()

    return jsonify({
        'sequence_id': sequence_id,
        'time_range': time_range,
        'total_executions': result.count,
        'executions': result.data,  # For detailed view
        'unique_recipients': len(set(e['recipient_email'] for e in result.data))
    })

@crm_bp.route('/sequences/analytics/summary', methods=['GET'])
@require_admin
def get_all_sequences_analytics(user_id):
    """
    Get execution counts for all sequences (for dashboard cards)
    """
    # Get all sequences
    sequences = supabase.table('automation_sequences').select('id, name').execute()

    # Get execution counts for each
    analytics = []
    for seq in sequences.data:
        count_result = (
            supabase.table('sequence_executions')
            .select('id', count='exact')
            .eq('sequence_id', seq['id'])
            .execute()
        )

        analytics.append({
            'sequence_id': seq['id'],
            'sequence_name': seq['name'],
            'execution_count': count_result.count or 0
        })

    return jsonify({'sequences': analytics})
```

---

## Frontend Implementation

### 1. Update Sequence Card Component

**File: `frontend/src/components/admin/crm/SequenceCard.jsx`** (or similar)

```jsx
// Add execution count badge to sequence card
<div className="sequence-card">
  <h3>{sequence.name}</h3>
  <p>{sequence.description}</p>

  {/* NEW: Execution count badge */}
  <div className="flex items-center gap-2 mt-2">
    <span className="text-sm text-gray-600">
      Sent to <strong>{sequence.execution_count || 0}</strong> recipients
    </span>
  </div>

  {/* Existing buttons */}
  <button onClick={() => viewDetails(sequence.id)}>View Details</button>
</div>
```

### 2. Fetch Analytics Data

**Update CRM dashboard to fetch counts:**

```jsx
// In CRMPage.jsx or wherever sequences are loaded
useEffect(() => {
  const fetchSequencesWithAnalytics = async () => {
    // Get sequences
    const sequences = await crmAPI.getSequences();

    // Get analytics summary
    const analytics = await crmAPI.getSequencesAnalyticsSummary();

    // Merge data
    const sequencesWithCounts = sequences.map(seq => ({
      ...seq,
      execution_count: analytics.find(a => a.sequence_id === seq.id)?.execution_count || 0
    }));

    setSequences(sequencesWithCounts);
  };

  fetchSequencesWithAnalytics();
}, []);
```

### 3. Detailed Analytics View (Optional Enhancement)

**New component: `SequenceAnalyticsModal.jsx`**

Shows:
- Total executions
- Unique recipients
- Chart of executions over time (using Recharts)
- List of recent recipients
- Time range selector (7d, 30d, 90d, all)

---

## Implementation Phases

### Phase 1: Basic Tracking (Quick Win)
1. Create `sequence_executions` table
2. Add `_log_sequence_execution()` to service
3. Update all sequence trigger points to log executions
4. Test with promo pages

### Phase 2: API & Display
1. Add analytics API endpoints
2. Update frontend to fetch and display counts
3. Show count badge on sequence cards

### Phase 3: Enhanced Analytics (Future)
1. Add time-series chart
2. Add recipient details view
3. Add filters (by source, date range)
4. Export to CSV

---

## Data Retention Policy

**Recommendation:** Keep execution logs for 90 days, then archive or delete

```sql
-- Cleanup job (run daily via cron)
DELETE FROM sequence_executions
WHERE executed_at < NOW() - INTERVAL '90 days';
```

Or better: Archive to separate table for compliance/reporting.

---

## Performance Considerations

1. **Indexing**: Already included in schema (sequence_id, executed_at)
2. **Caching**: Cache execution counts for 5 minutes (Redis or in-memory)
3. **Pagination**: If showing execution list, paginate results
4. **Aggregation**: Use COUNT() queries instead of fetching all rows

---

## Testing Strategy

1. **Unit tests**: Test `_log_sequence_execution()` method
2. **Integration tests**: Verify logging happens on sequence trigger
3. **Load tests**: Ensure logging doesn't slow down email sends
4. **Manual tests**:
   - Trigger promo sequence
   - Check `sequence_executions` table has new row
   - Verify count displays on frontend

---

## Estimated Effort

- **Phase 1 (Tracking)**: 2-3 hours
- **Phase 2 (API & UI)**: 3-4 hours
- **Phase 3 (Enhanced)**: 4-6 hours
- **Total**: ~10-13 hours

---

## Alternative: Log-Based Analytics (No DB Changes)

Instead of database table, parse application logs:
- **Pros**: No schema changes, leverage existing logs
- **Cons**: Slower queries, less structured data, harder to aggregate
- **Not recommended** for production analytics

---

## Current Implementation Status

**Completed:**
- ✅ Promo sequences created and activated
- ✅ Sequences triggered from promo pages
- ✅ Basic email sending working

**TODO (from this plan):**
- ⬜ Phase 1: Database table + logging
- ⬜ Phase 2: API endpoints + UI display
- ⬜ Phase 3: Enhanced analytics dashboard

---

This plan gives you full visibility into sequence performance while maintaining good data hygiene and performance. The `sequence_executions` table becomes a valuable asset for marketing analytics and conversion tracking.
