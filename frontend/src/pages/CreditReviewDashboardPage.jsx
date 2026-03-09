import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { toast } from 'react-hot-toast'
import api from '../services/api'
import DashboardLayout from '../components/credit-dashboard/DashboardLayout'
import ItemList from '../components/credit-dashboard/ItemList'
import ItemDetail from '../components/credit-dashboard/ItemDetail'
import StudentContext from '../components/credit-dashboard/StudentContext'
import CreditDataTable from '../components/credit-dashboard/CreditDataTable'
import BulkActionBar from '../components/credit-dashboard/BulkActionBar'
import MergeModal from '../components/credit-dashboard/MergeModal'
import ShortcutHelp from '../components/credit-dashboard/ShortcutHelp'
import useKeyboardShortcuts from '../hooks/useKeyboardShortcuts'

const CreditReviewDashboardPage = () => {
  const { user, effectiveRole, logout } = useAuth()
  const [viewMode, setViewMode] = useState('split') // 'split' or 'table'
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
    accreditor_status: '',
    student_id: '',
    subject: '',
    date_from: '',
    date_to: ''
  }))
  const [filtersInitialized, setFiltersInitialized] = useState(false)

  // Set default filters based on role
  useEffect(() => {
    if (!effectiveRole || filtersInitialized) return
    if (effectiveRole === 'accreditor') {
      setFilters(f => ({ ...f, status: 'approved', accreditor_status: 'pending_accreditor' }))
    } else {
      setFilters(f => ({ ...f, status: 'pending_review' }))
    }
    setFiltersInitialized(true)
  }, [effectiveRole, filtersInitialized])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [showMergeModal, setShowMergeModal] = useState(false)
  const [showShortcuts, setShowShortcuts] = useState(false)


  const perPage = 50

  // Fetch items
  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      const params = { page, per_page: perPage }
      Object.entries(filters).forEach(([key, val]) => {
        if (val) params[key] = val
      })
      const res = await api.get('/api/credit-dashboard/items', { params })
      const data = res.data?.data || res.data
      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Failed to fetch items:', err)
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  // Fetch stats
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/api/credit-dashboard/stats')
      setStats(res.data?.data || res.data)
    } catch (err) {
      console.error('Failed to fetch stats:', err)
    }
  }, [])

  useEffect(() => {
    fetchItems()
    fetchStats()
  }, [fetchItems, fetchStats])

  // Fetch item detail
  const selectItem = useCallback(async (item) => {
    if (!item) {
      setSelectedItem(null)
      setItemDetail(null)
      setStudentContext(null)
      return
    }
    setSelectedItem(item)
    try {
      setDetailLoading(true)
      const [detailRes, contextRes] = await Promise.all([
        api.get(`/api/credit-dashboard/items/${item.completion_id}`),
        api.get(`/api/credit-dashboard/student-context/${item.student_id}`)
      ])
      setItemDetail(detailRes.data?.data || detailRes.data)
      setStudentContext(contextRes.data?.data || contextRes.data)
    } catch (err) {
      console.error('Failed to fetch detail:', err)
    } finally {
      setDetailLoading(false)
    }
  }, [])

  // Refs for keyboard shortcut handlers (avoids stale closures / constant re-registration)
  const itemsRef = useRef(items)
  const selectedItemRef = useRef(selectedItem)
  const selectedItemsRef = useRef(selectedItems)
  const showMergeModalRef = useRef(showMergeModal)
  const showShortcutsRef = useRef(showShortcuts)
  const feedbackRef = useRef('')
  const feedbackTextareaRef = useRef(null)

  useEffect(() => { itemsRef.current = items }, [items])
  useEffect(() => { selectedItemRef.current = selectedItem; feedbackRef.current = '' }, [selectedItem])
  useEffect(() => { selectedItemsRef.current = selectedItems }, [selectedItems])
  useEffect(() => { showMergeModalRef.current = showMergeModal }, [showMergeModal])
  useEffect(() => { showShortcutsRef.current = showShortcuts }, [showShortcuts])

  const handleRefresh = useCallback(() => {
    fetchItems()
    fetchStats()
  }, [fetchItems, fetchStats])

  // Stable keyboard shortcuts object (never changes identity)
  const shortcuts = useMemo(() => ({
    'k': () => {
      const idx = itemsRef.current.findIndex(i => i.completion_id === selectedItemRef.current?.completion_id)
      if (idx > 0) selectItem(itemsRef.current[idx - 1])
    },
    'j': () => {
      const idx = itemsRef.current.findIndex(i => i.completion_id === selectedItemRef.current?.completion_id)
      if (idx < itemsRef.current.length - 1) selectItem(itemsRef.current[idx + 1])
      else if (idx === -1 && itemsRef.current.length > 0) selectItem(itemsRef.current[0])
    },
    'a': async () => {
      const item = selectedItemRef.current
      if (!item) return
      const prevItems = itemsRef.current
      const idx = prevItems.findIndex(i => i.completion_id === item.completion_id)

      // Optimistic: remove item and advance selection
      const nextItems = prevItems.filter(i => i.completion_id !== item.completion_id)
      setItems(nextItems)
      itemsRef.current = nextItems
      const nextItem = nextItems[idx] || nextItems[idx - 1] || null
      if (nextItem) {
        selectItem(nextItem)
      } else {
        setSelectedItem(null)
        setItemDetail(null)
        setStudentContext(null)
      }

      try {
        if (effectiveRole === 'accreditor') {
          await api.post(`/api/credit-dashboard/items/${item.completion_id}/confirm`, {})
        } else {
          await api.post(`/api/advisor/credit-queue/${item.completion_id}/approve`, {})
        }
        fetchStats()
      } catch (err) {
        console.error('Action failed:', err)
        // Revert on failure
        setItems(prevItems)
        itemsRef.current = prevItems
        selectItem(item)
      }
    },
    'g': async () => {
      const item = selectedItemRef.current
      if (!item) return
      const fb = feedbackRef.current?.trim()
      if (!fb) {
        feedbackTextareaRef.current?.focus()
        return
      }
      const prevItems = itemsRef.current
      const idx = prevItems.findIndex(i => i.completion_id === item.completion_id)
      const nextItems = prevItems.filter(i => i.completion_id !== item.completion_id)
      setItems(nextItems)
      itemsRef.current = nextItems
      const nextItem = nextItems[idx] || nextItems[idx - 1] || null
      if (nextItem) {
        selectItem(nextItem)
      } else {
        setSelectedItem(null)
        setItemDetail(null)
        setStudentContext(null)
      }
      try {
        if (effectiveRole === 'accreditor') {
          await api.post(`/api/credit-dashboard/items/${item.completion_id}/return-to-advisor`, {
            feedback: fb
          })
          toast.success('Returned to advisor')
        } else {
          await api.post(`/api/advisor/credit-queue/${item.completion_id}/grow-this`, {
            feedback: fb
          })
          toast.success('Returned with feedback')
        }
        fetchStats()
      } catch (err) {
        toast.error(err.response?.data?.message || 'Failed to return')
        setItems(prevItems)
        itemsRef.current = prevItems
        selectItem(item)
      }
    },
    't': () => setViewMode(v => v === 'split' ? 'table' : 'split'),
    'm': () => { if (selectedItemsRef.current.length >= 2) setShowMergeModal(true) },
    'Escape': () => {
      if (showMergeModalRef.current) setShowMergeModal(false)
      else if (showShortcutsRef.current) setShowShortcuts(false)
      else { setSelectedItem(null); setItemDetail(null) }
    },
    '?': () => setShowShortcuts(s => !s),
  }), [selectItem, effectiveRole, fetchItems, fetchStats])

  useKeyboardShortcuts(shortcuts)

  // Optimistic advance: remove item from list and select next
  const optimisticRemove = useCallback((completionId) => {
    const curItems = itemsRef.current
    const idx = curItems.findIndex(i => i.completion_id === completionId)
    const prevItems = [...curItems]
    const nextItems = curItems.filter(i => i.completion_id !== completionId)
    setItems(nextItems)
    itemsRef.current = nextItems
    const nextItem = nextItems[idx] || nextItems[idx - 1] || null
    if (nextItem) {
      selectItem(nextItem)
    } else {
      setSelectedItem(null)
      setItemDetail(null)
      setStudentContext(null)
    }
    fetchStats()
    return prevItems
  }, [selectItem, fetchStats])

  const handleAdvance = useCallback((completionId) => {
    optimisticRemove(completionId)
  }, [optimisticRemove])

  // Grow this: optimistic advance + API call with feedback, revert on failure
  const handleGrowThis = useCallback(async (completionId, feedbackText) => {
    const prevItems = optimisticRemove(completionId)
    try {
      await api.post(`/api/advisor/credit-queue/${completionId}/grow-this`, {
        feedback: feedbackText
      })
      toast.success('Returned with feedback')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to return')
      setItems(prevItems)
      itemsRef.current = prevItems
    }
  }, [optimisticRemove])

  // Toggle selection for bulk ops
  const toggleItemSelection = useCallback((completionId) => {
    setSelectedItems(prev =>
      prev.includes(completionId)
        ? prev.filter(id => id !== completionId)
        : [...prev, completionId]
    )
  }, [])

  const isAccreditor = effectiveRole === 'accreditor'

  return (
    <div className={`${isAccreditor ? 'h-screen' : 'h-[calc(100vh-4rem)]'} flex flex-col`}>
      {/* Logo bar for accreditors */}
      {isAccreditor && (
        <div className="flex items-center justify-center py-3 border-b border-gray-200 bg-white">
          <img
            src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
            alt="Optio"
            className="h-8 w-auto"
          />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold text-gray-900">Credit Review Dashboard</h1>
          {stats && (
            <div className="flex gap-2 text-sm">
              {stats.pending_advisor > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800">
                  {stats.pending_advisor} pending advisor
                </span>
              )}
              {stats.pending_accreditor > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  {stats.pending_accreditor} pending accreditor
                </span>
              )}
              {stats.flagged > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-800">
                  {stats.flagged} flagged
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode(v => v === 'split' ? 'table' : 'split')}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50"
          >
            {viewMode === 'split' ? 'Table View' : 'Split View'}
          </button>
          <button
            onClick={() => setShowShortcuts(true)}
            className="px-2 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 text-gray-500"
            title="Keyboard shortcuts (?)"
          >
            ?
          </button>
          {isAccreditor && (
            <button
              onClick={logout}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 text-gray-600"
            >
              Log out
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      {viewMode === 'split' ? (
        <DashboardLayout>
          <ItemList
            items={items}
            selectedItem={selectedItem}
            selectedItems={selectedItems}
            onSelect={selectItem}
            onToggleSelection={toggleItemSelection}
            filters={filters}
            onFiltersChange={setFilters}
            loading={loading}
            total={total}
            page={page}
            perPage={perPage}
            onPageChange={setPage}
          />
          <ItemDetail
            item={selectedItem}
            detail={itemDetail}
            loading={detailLoading}
            effectiveRole={effectiveRole}
            onRefresh={handleRefresh}
            onAdvance={handleAdvance}
            onGrowThis={handleGrowThis}
            onFeedbackChange={(fb) => { feedbackRef.current = fb }}
            feedbackTextareaRef={feedbackTextareaRef}
          />
          <StudentContext context={studentContext} loading={detailLoading} />
        </DashboardLayout>
      ) : (
        <CreditDataTable
          items={items}
          selectedItems={selectedItems}
          onToggleSelection={toggleItemSelection}
          onSelectAll={(ids) => setSelectedItems(ids)}
          onRowClick={(item) => { setViewMode('split'); selectItem(item) }}
          filters={filters}
          onFiltersChange={setFilters}
          loading={loading}
          total={total}
          page={page}
          perPage={perPage}
          onPageChange={setPage}
        />
      )}

      {/* Bulk action bar */}
      {selectedItems.length > 0 && (
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
