import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import ItemList from '../components/credit-dashboard/ItemList'
import CreditDataTable from '../components/credit-dashboard/CreditDataTable'
import BulkActionBar from '../components/credit-dashboard/BulkActionBar'
import MergeModal from '../components/credit-dashboard/MergeModal'
import ShortcutHelp from '../components/credit-dashboard/ShortcutHelp'
import ClassReviewsSection from '../components/credit-dashboard/ClassReviewsSection'
import GraderView from '../components/credit-dashboard/grader/GraderView'
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts'
import useAiReviewPolling from '../hooks/useAiReviewPolling'
import { useRerunAiReview } from '../hooks/api'
import GlassTabBar from '../components/ui/GlassTabBar'
import useIsMobile from '../hooks/useIsMobile'

/**
 * The credit review queue, and the grader that opens over it.
 *
 * This page owns the list, the filters, the fetches and the keyboard. Opening
 * an item puts the grader over the whole screen; deciding it drops the row and
 * moves to the next, so a reviewer can work a queue without touching the list.
 *
 * orgId is set when this page is embedded in the org management screen
 * (/admin/organizations/:orgId > Credit Review tab). It scopes the queue to
 * that org's students -- without it a superadmin sees the platform-wide queue.
 */
const CreditReviewDashboardPage = ({ orgId = null }) => {
  const { effectiveRole } = useAuth()
  const isMobile = useIsMobile()
  // Holistic class credit is a superadmin function (platform class submissions
  // route to superadmin); only they see the Classes tab.
  const canReviewClasses = effectiveRole === 'superadmin'
  const showAi = effectiveRole === 'superadmin'
  const [items, setItems] = useState([])
  const [selectedItem, setSelectedItem] = useState(null)
  const [selectedItems, setSelectedItems] = useState([])
  const [itemDetail, setItemDetail] = useState(null)
  const [studentContext, setStudentContext] = useState(null)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [filters, setFilters] = useState(() => ({
    status: '',
    student_id: '',
    subject: '',
    date_from: '',
    date_to: '',
    // Only superadmins get AI data back, so only they can filter on it.
    ai: ''
  }))
  const [filtersInitialized, setFiltersInitialized] = useState(false)

  // Set default filters based on role
  useEffect(() => {
    if (!effectiveRole || filtersInitialized) return
    if (effectiveRole === 'org_admin' || orgId) {
      // Org-scoped view: show all actionable items from org students (no
      // status filter), so pending_org_approval requests always appear
      setFilters(f => ({ ...f, status: '' }))
    } else {
      setFilters(f => ({ ...f, status: 'pending_review' }))
    }
    setFiltersInitialized(true)
  }, [effectiveRole, filtersInitialized, orgId])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)

  // 'tasks' = per-task credit queue (default); 'classes' = full class submissions
  const [mainTab, setMainTab] = useState('tasks')
  const [classPendingCount, setClassPendingCount] = useState(0)
  const [classRefreshKey, setClassRefreshKey] = useState(0)

  // Badge count of classes awaiting holistic review.
  useEffect(() => {
    if (!canReviewClasses) return
    let cancelled = false
    api.get('/api/admin/class-reviews', { params: { status: 'submitted_for_review' } })
      .then(res => {
        if (cancelled) return
        const data = res.data?.data || res.data
        setClassPendingCount((data.items || []).length)
      })
      .catch(() => { /* badge is best-effort */ })
    return () => { cancelled = true }
  }, [classRefreshKey, canReviewClasses])

  const perPage = 50

  // Refs for keyboard shortcut handlers (avoids stale closures / constant re-registration)
  const itemsRef = useRef(items)
  const selectedItemRef = useRef(selectedItem)
  const selectedItemsRef = useRef(selectedItems)
  const showMergeModalRef = useRef(showMergeModal)
  const showShortcutsRef = useRef(showShortcuts)
  const feedbackTextareaRef = useRef(null)
  // The grader registers its approve / grow-this / accept-AI handlers here, so
  // a keypress and a click go through one code path rather than two.
  const decisionRef = useRef(null)
  // Set when a decision empties the loaded page and more rows remain: the next
  // fetch opens its first row so the reviewer keeps going without a detour
  // through the queue.
  const continueOnLoadRef = useRef(false)

  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => { selectedItemRef.current = selectedItem }, [selectedItem])
  useEffect(() => { selectedItemsRef.current = selectedItems }, [selectedItems])
  useEffect(() => { showMergeModalRef.current = showMergeModal }, [showMergeModal])
  useEffect(() => { showShortcutsRef.current = showShortcuts }, [showShortcuts])

  // Filter changes reset to page 1. Without this, narrowing the filter while
  // holding page 2 asks the API for an offset past the end of the smaller
  // result set -- PostgREST answers 416, the endpoint 500s, and the dashboard
  // renders empty with no way back (Sentry OPTIO-WEB-T). The backend now
  // returns an empty page instead of failing; this keeps us from asking.
  // Takes the same argument FilterBar passes (an updater function), so it
  // forwards it untouched.
  const handleFiltersChange = useCallback((update) => {
    setFilters(update)
    setPage(1)
  }, [])

  const closeGrader = useCallback(() => {
    setSelectedItem(null)
    setItemDetail(null)
    setStudentContext(null)
  }, [])

  // The story editor opens in a new tab. The grader is a queue with a
  // position in it, and a reviewer who publishes a story mid-queue should
  // come back to the same item, not the top of the list. A router navigation
  // would unmount the grader and lose that.
  const openStory = useCallback((storyId) => {
    window.open(`/admin/stories/${storyId}`, '_blank', 'noopener,noreferrer')
  }, [])

  // Open an item in the grader. Responses are only applied if the item is
  // still the one on screen: a reviewer pressing j twice gets two fetches, and
  // the first must not land on top of the second.
  const selectItem = useCallback(async (item) => {
    if (!item) {
      closeGrader()
      return
    }
    setSelectedItem(item)
    selectedItemRef.current = item
    try {
      setDetailLoading(true)
      const [detailRes, contextRes] = await Promise.all([
        api.get(`/api/credit-dashboard/items/${item.completion_id}`),
        api.get(`/api/credit-dashboard/student-context/${item.student_id}`)
      ])
      if (selectedItemRef.current?.completion_id !== item.completion_id) return
      setItemDetail(detailRes.data?.data || detailRes.data)
      setStudentContext(contextRes.data?.data || contextRes.data)
    } catch (err) {
      console.error('Failed to fetch detail:', err)
    } finally {
      if (selectedItemRef.current?.completion_id === item.completion_id) {
        setDetailLoading(false)
      }
    }
  }, [closeGrader])

  // Fetch items. Bails until the role-based filter default has been applied
  // (filtersInitialized = true) so we don't fire a no-filter request on
  // initial render and overwrite the filtered results with everything.
  const fetchItems = useCallback(async () => {
    if (!filtersInitialized) return
    try {
      setLoading(true)
      const params = { page, per_page: perPage }
      if (orgId) params.org_id = orgId
      Object.entries(filters).forEach(([key, val]) => {
        if (val) params[key] = val
      })
      const res = await api.get('/api/credit-dashboard/items', { params })
      const data = res.data?.data || res.data
      const list = data.items || []
      setItems(list)
      setTotal(data.total || 0)
      if (continueOnLoadRef.current) {
        continueOnLoadRef.current = false
        if (list.length) selectItem(list[0])
      }
    } catch (err) {
      console.error('Failed to fetch items:', err)
    } finally {
      setLoading(false)
    }
  }, [filters, page, filtersInitialized, orgId, selectItem])

  const fetchStats = useCallback(async () => {
    if (!filtersInitialized) return
    try {
      const params = orgId ? { org_id: orgId } : {}
      const res = await api.get('/api/credit-dashboard/stats', { params })
      setStats(res.data?.data || res.data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }, [filtersInitialized, orgId])

  useEffect(() => {
    fetchItems()
    fetchStats()
  }, [fetchItems, fetchStats])

  const fetchDetail = useCallback(async (completionId) => {
    const res = await api.get(`/api/credit-dashboard/items/${completionId}`)
    return res.data?.data || res.data
  }, [])

  /**
   * Keep a queue row's AI badge in step with its detail.
   *
   * Without this the list still says "AI reading" after the panel has shown the
   * verdict, and the reviewer has to reload to trust either one.
   */
  const patchItemAi = useCallback((completionId, ai) => {
    if (!ai) return
    const review = ai.review || {}
    const patch = (item) => (
      item.completion_id === completionId
        ? {
            ...item,
            ai_status: ai.status,
            ai_recommendation: review.recommendation,
            ai_confidence: review.confidence,
            ai_xp_recommended: review.xp?.changed ? review.xp.recommended : null,
          }
        : item
    )
    setItems(prev => prev.map(patch))
    setSelectedItem(prev => (prev ? patch(prev) : prev))
  }, [])

  const handleRefresh = useCallback(() => {
    fetchItems()
    fetchStats()
  }, [fetchItems, fetchStats])

  // The 409-is-success case lives in the hook: a review already in flight is
  // what the reviewer asked for, not a failure to report.
  const rerunMutation = useRerunAiReview()
  const rerunAiReview = useCallback(async (completionId) => {
    if (!completionId) return
    try {
      const ai = await rerunMutation.mutateAsync(completionId)
      setItemDetail(prev => (prev ? { ...prev, ai } : prev))
      patchItemAi(completionId, ai)
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not start the AI review')
    }
  }, [patchItemAi, rerunMutation])

  useAiReviewPolling({
    completionId: selectedItem?.completion_id,
    status: itemDetail?.ai?.status,
    fetchDetail,
    onUpdate: (detail) => {
      setItemDetail(detail)
      patchItemAi(detail?.completion?.id, detail?.ai)
    },
    onTimeout: () => toast('The AI review is taking a while. Re-run it if it stays stuck.'),
  })

  // Drop a decided row and move the grader to its neighbour. When the loaded
  // page runs dry but the server has more, fetch again and open the first row
  // of what comes back. Returns the list as it was, so a failed request can
  // put it back.
  const optimisticRemove = useCallback((completionId) => {
    const curItems = itemsRef.current
    const idx = curItems.findIndex(i => i.completion_id === completionId)
    const prevItems = [...curItems]
    const nextItems = curItems.filter(i => i.completion_id !== completionId)
    setItems(nextItems)
    itemsRef.current = nextItems
    setTotal(t => Math.max(0, t - 1))
    const nextItem = nextItems[idx] || nextItems[idx - 1] || null
    if (nextItem) {
      selectItem(nextItem)
    } else if (total > prevItems.length) {
      // Clear the detail so the grader shows a loader, not the decided item,
      // while the next page is on its way.
      setItemDetail(null)
      continueOnLoadRef.current = true
      if (page === 1) fetchItems()
      else setPage(1)
    } else {
      closeGrader()
    }
    fetchStats()
    return prevItems
  }, [selectItem, fetchStats, fetchItems, closeGrader, total, page])

  const handleAdvance = useCallback((completionId) => {
    optimisticRemove(completionId)
  }, [optimisticRemove])

  const goTo = useCallback((offset) => {
    const list = itemsRef.current
    if (!list.length) return
    const idx = list.findIndex(i => i.completion_id === selectedItemRef.current?.completion_id)
    if (idx === -1) {
      selectItem(list[0])
      return
    }
    const next = list[idx + offset]
    if (next) selectItem(next)
  }, [selectItem])

  // Stable keyboard shortcuts object (never changes identity)
  const shortcuts = useMemo(() => ({
    'k': () => goTo(-1),
    'j': () => goTo(1),
    // Approve, Grow This and take-the-AI all belong to the grader, which
    // registers them on decisionRef. Nothing here decides anything itself.
    'a': () => decisionRef.current?.approve(),
    'g': () => decisionRef.current?.growThis(),
    'x': () => decisionRef.current?.acceptAi(),
    'm': () => { if (selectedItemsRef.current.length >= 2) setShowMergeModal(true) },
    'Escape': () => {
      if (showMergeModalRef.current) setShowMergeModal(false)
      else if (showShortcutsRef.current) setShowShortcuts(false)
      else closeGrader()
    },
    '?': () => setShowShortcuts(s => !s),
  }), [goTo, closeGrader])

  useKeyboardShortcuts(shortcuts)

  // Toggle selection for bulk ops
  const toggleItemSelection = useCallback((completionId) => {
    setSelectedItems(prev =>
      prev.includes(completionId)
        ? prev.filter(id => id !== completionId)
        : [...prev, completionId]
    )
  }, [])

  const selectedIndex = selectedItem
    ? items.findIndex(i => i.completion_id === selectedItem.completion_id)
    : -1

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-6 py-3 border-b border-gray-200 bg-white gap-3">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <h1 className="text-lg md:text-xl font-semibold text-gray-900 shrink-0">
            {isMobile ? 'Credit Review' : 'Credit Review Dashboard'}
          </h1>
          {/* Tasks vs full-class submissions (superadmin reviews classes) */}
          {canReviewClasses && (
          <div className="shrink-0">
            <GlassTabBar
              size="md"
              aria-label="Review queue"
              tabs={[
                { id: 'tasks', label: 'Tasks' },
                { id: 'classes', label: 'Classes', badge: classPendingCount > 0 ? classPendingCount : null },
              ]}
              active={mainTab}
              onSelect={setMainTab}
            />
          </div>
          )}
          {mainTab === 'tasks' && stats && (
            <div className="flex gap-2 text-sm overflow-x-auto no-scrollbar">
              {stats.pending_org_approval > 0 && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-optio-purple/10 text-optio-purple">
                  {stats.pending_org_approval} pending org
                </span>
              )}
              {stats.pending_review > 0 && (
                <span className="shrink-0 px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                  {stats.pending_review} pending review
                </span>
              )}
            </div>
          )}
        </div>
        {mainTab === 'tasks' && (
          <div className="flex items-center gap-2 shrink-0">
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => selectItem(items[0])}
                className="btn-primary"
              >
                Start grading
              </button>
            )}
            {!isMobile && (
              <button
                type="button"
                onClick={() => setShowShortcuts(true)}
                className="btn-quiet px-2.5 text-gray-500"
                title="Keyboard shortcuts (?)"
                aria-label="Keyboard shortcuts"
              >
                ?
              </button>
            )}
          </div>
        )}
      </div>

      {/* Full-class submissions — one card per class, not per task. */}
      {mainTab === 'classes' && (
        <div className="flex-1 overflow-y-auto p-3 md:p-6 bg-neutral-50">
          <ClassReviewsSection onReviewed={() => setClassRefreshKey(k => k + 1)} />
        </div>
      )}

      {/* The queue. A table with bulk selection on a desktop; a tappable list
          on a phone, where the table's width and the merge workflow assume a
          trackpad and a keyboard. Either way a row opens the grader. */}
      {mainTab === 'tasks' && isMobile && (
        <div className="flex flex-1 flex-col overflow-hidden bg-neutral-50 p-2">
          <div className="flex-1 overflow-y-auto bg-white rounded-lg shadow-sm">
            <ItemList
              items={items}
              selectedItem={selectedItem}
              selectedItems={selectedItems}
              onSelect={selectItem}
              onToggleSelection={toggleItemSelection}
              filters={filters}
              onFiltersChange={handleFiltersChange}
              loading={loading}
              total={total}
              page={page}
              perPage={perPage}
              onPageChange={setPage}
              showAi={showAi}
            />
          </div>
        </div>
      )}

      {mainTab === 'tasks' && !isMobile && (
        <CreditDataTable
          items={items}
          selectedItems={selectedItems}
          onToggleSelection={toggleItemSelection}
          onSelectAll={(ids) => setSelectedItems(ids)}
          onRowClick={selectItem}
          filters={filters}
          onFiltersChange={handleFiltersChange}
          loading={loading}
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={setPage}
          showAi={showAi}
        />
      )}

      {/* Bulk action bar — desktop only. Mobile users review one item at
          a time via the grader. */}
      {mainTab === 'tasks' && !isMobile && selectedItems.length > 0 && (
        <BulkActionBar
          selectedCount={selectedItems.length}
          items={items}
          selectedIds={selectedItems}
          effectiveRole={effectiveRole}
          onDeselectAll={() => setSelectedItems([])}
          onMerge={() => setShowMergeModal(true)}
          onRefresh={handleRefresh}
        />
      )}

      {/* The grader covers everything, app chrome included. */}
      {selectedItem && (
        <GraderView
          item={selectedItem}
          detail={itemDetail}
          loading={detailLoading}
          studentContext={studentContext}
          effectiveRole={effectiveRole}
          index={selectedIndex}
          total={items.length}
          onPrev={() => goTo(-1)}
          onNext={() => goTo(1)}
          onExit={closeGrader}
          onShowShortcuts={isMobile ? null : () => setShowShortcuts(true)}
          onAdvance={handleAdvance}
          onRefresh={handleRefresh}
          feedbackTextareaRef={feedbackTextareaRef}
          decisionRef={decisionRef}
          onRerunAi={rerunAiReview}
          rerunAiLoading={rerunMutation.isPending}
          onOpenStory={openStory}
        />
      )}

      {/* Merge modal */}
      {showMergeModal && (
        <MergeModal
          completionIds={selectedItems}
          items={items.filter(i => selectedItems.includes(i.completion_id))}
          onClose={() => setShowMergeModal(false)}
          onMerged={() => {
            setShowMergeModal(false)
            setSelectedItems([])
            handleRefresh()
          }}
        />
      )}

      {/* Shortcut help */}
      {showShortcuts && <ShortcutHelp onClose={() => setShowShortcuts(false)} />}
    </div>
  )
}

export default CreditReviewDashboardPage
