import React, { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import toast from 'react-hot-toast'
import RichTextEditor from '../../components/course/outline/RichTextEditor'
import {
  fetchAdminNodes,
  fetchAdminEdges,
  createNode,
  updateNode,
  deleteNode,
  updateNodePositions,
  createEdge,
  updateEdge,
  deleteEdge,
} from '../../services/philosophyService'

const MindMap = lazy(() => import('../../components/philosophy/MindMap'))

const NODE_TYPE_MAP = { 0: 'centerNode', 1: 'majorNode', 2: 'childNode' }

// Transform raw DB node -> React Flow format
function toFlowNode(node) {
  return {
    id: node.id,
    type: NODE_TYPE_MAP[node.level] || 'majorNode',
    position: { x: node.position_x, y: node.position_y },
    hidden: node.level === 2,
    data: {
      slug: node.slug,
      label: node.label,
      summary: node.summary,
      detailContent: node.detail_content,
      imageUrl: node.image_url,
      color: node.color,
      level: node.level,
      parentNodeId: node.parent_node_id,
      sortOrder: node.sort_order,
      isVisible: node.is_visible,
    },
  }
}

function getBestHandles(sourceNode, targetNode) {
  const dx = targetNode.position_x - sourceNode.position_x
  const dy = targetNode.position_y - sourceNode.position_y
  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0
      ? { sourceHandle: 'right-src', targetHandle: 'left-tgt' }
      : { sourceHandle: 'left-src', targetHandle: 'right-tgt' }
  }
  return dy > 0
    ? { sourceHandle: 'bottom-src', targetHandle: 'top-tgt' }
    : { sourceHandle: 'top-src', targetHandle: 'bottom-tgt' }
}

function toFlowEdge(edge, nodeMap) {
  const src = nodeMap?.[edge.source_node_id]
  const tgt = nodeMap?.[edge.target_node_id]
  const handles = src && tgt
    ? getBestHandles(src, tgt)
    : { sourceHandle: 'bottom-src', targetHandle: 'top-tgt' }
  return {
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    sourceHandle: handles.sourceHandle,
    targetHandle: handles.targetHandle,
    type: edge.edge_type,
    hidden: false,
    data: { edgeType: edge.edge_type, labelText: edge.label_text },
  }
}

const EMPTY_NODE = {
  label: '',
  slug: '',
  summary: '',
  detail_content: '',
  image_url: '',
  color: '#6D469B',
  level: 1,
  parent_node_id: null,
  position_x: 400,
  position_y: 400,
  sort_order: 0,
  is_visible: true,
}

const EMPTY_EDGE = {
  source_node_id: '',
  target_node_id: '',
  edge_type: 'includes',
  label_text: '',
  is_visible: true,
}

const PhilosophyEditor = () => {
  const [rawNodes, setRawNodes] = useState([])
  const [rawEdges, setRawEdges] = useState([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState('node') // 'node' | 'edge'
  const [selectedId, setSelectedId] = useState(null)
  const [formData, setFormData] = useState(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const positionBuffer = useRef({})
  const positionTimer = useRef(null)

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [nodes, edges] = await Promise.all([fetchAdminNodes(), fetchAdminEdges()])
      setRawNodes(nodes)
      setRawEdges(edges)
    } catch (err) {
      toast.error('Failed to load philosophy data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  // Derived: React Flow format
  const nodeMap = {}
  rawNodes.forEach((n) => { nodeMap[n.id] = n })
  const flowNodes = rawNodes.map(toFlowNode)
  const flowEdges = rawEdges.map((e) => toFlowEdge(e, nodeMap))

  // Level 0, 1, and 2 nodes for lists
  const centerNodes = rawNodes.filter((n) => n.level === 0)
  const level1Nodes = rawNodes.filter((n) => n.level === 1).sort((a, b) => a.sort_order - b.sort_order)
  const level2Nodes = rawNodes.filter((n) => n.level === 2)

  // Select a node for editing
  const selectNode = (node) => {
    setEditMode('node')
    setSelectedId(node.id)
    setFormData({ ...node })
    setIsNew(false)
  }

  // Select an edge for editing
  const selectEdge = (edge) => {
    setEditMode('edge')
    setSelectedId(edge.id)
    setFormData({ ...edge })
    setIsNew(false)
  }

  // Start creating a new node
  const startNewNode = () => {
    setEditMode('node')
    setSelectedId(null)
    setFormData({ ...EMPTY_NODE })
    setIsNew(true)
  }

  // Start creating a new edge
  const startNewEdge = () => {
    setEditMode('edge')
    setSelectedId(null)
    setFormData({ ...EMPTY_EDGE })
    setIsNew(true)
  }

  // Save node
  const handleSaveNode = async () => {
    if (!formData.label) {
      toast.error('Label is required')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        await createNode(formData)
        toast.success('Node created')
      } else {
        await updateNode(selectedId, formData)
        toast.success('Node updated')
      }
      await loadData()
      setFormData(null)
      setSelectedId(null)
    } catch (err) {
      toast.error('Failed to save node')
    } finally {
      setSaving(false)
    }
  }

  // Save edge
  const handleSaveEdge = async () => {
    if (!formData.source_node_id || !formData.target_node_id) {
      toast.error('Source and target are required')
      return
    }
    setSaving(true)
    try {
      if (isNew) {
        await createEdge(formData)
        toast.success('Edge created')
      } else {
        await updateEdge(selectedId, formData)
        toast.success('Edge updated')
      }
      await loadData()
      setFormData(null)
      setSelectedId(null)
    } catch (err) {
      toast.error('Failed to save edge')
    } finally {
      setSaving(false)
    }
  }

  // Delete node
  const handleDeleteNode = async () => {
    if (!selectedId || !confirm('Delete this node? Connected edges will also be removed.')) return
    try {
      await deleteNode(selectedId)
      toast.success('Node deleted')
      await loadData()
      setFormData(null)
      setSelectedId(null)
    } catch (err) {
      toast.error('Failed to delete node')
    }
  }

  // Delete edge
  const handleDeleteEdge = async () => {
    if (!selectedId || !confirm('Delete this edge?')) return
    try {
      await deleteEdge(selectedId)
      toast.success('Edge deleted')
      await loadData()
      setFormData(null)
      setSelectedId(null)
    } catch (err) {
      toast.error('Failed to delete edge')
    }
  }

  // Handle drag-to-reposition (debounced)
  const handleNodeDragStop = useCallback((nodeId, position) => {
    positionBuffer.current[nodeId] = {
      id: nodeId,
      position_x: Math.round(position.x),
      position_y: Math.round(position.y),
    }

    if (positionTimer.current) clearTimeout(positionTimer.current)
    positionTimer.current = setTimeout(async () => {
      const positions = Object.values(positionBuffer.current)
      positionBuffer.current = {}
      try {
        await updateNodePositions(positions)
      } catch (err) {
        toast.error('Failed to save positions')
      }
    }, 800)
  }, [])

  // Update form field
  const setField = (key, value) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-200px)] gap-0 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* ========== LEFT PANEL: Editor ========== */}
      <div className="w-[400px] flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
        <div className="p-4">
          <h2 className="text-lg font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins' }}>
            Philosophy Editor
          </h2>

          {/* Tab: Nodes vs Edges */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => { setEditMode('node'); setFormData(null); setSelectedId(null) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                editMode === 'node'
                  ? 'bg-optio-purple text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Nodes ({rawNodes.length})
            </button>
            <button
              onClick={() => { setEditMode('edge'); setFormData(null); setSelectedId(null) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                editMode === 'edge'
                  ? 'bg-optio-purple text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              Edges ({rawEdges.length})
            </button>
          </div>

          {/* Node list */}
          {editMode === 'node' && !formData && (
            <>
              <button
                onClick={startNewNode}
                className="w-full mb-3 px-3 py-2 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-optio-purple hover:text-optio-purple transition-colors"
              >
                + Add Node
              </button>
              <div className="space-y-1">
                {centerNodes.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => selectNode(node)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                      selectedId === node.id
                        ? 'bg-optio-purple/10 text-optio-purple'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <div className="w-3 h-3 rounded-full flex-shrink-0 bg-gradient-to-br from-optio-purple to-optio-pink" />
                    <span className="font-bold truncate">{node.label}</span>
                    <span className="text-[10px] text-gray-400 ml-auto">(center)</span>
                  </button>
                ))}
                {centerNodes.length > 0 && level1Nodes.length > 0 && (
                  <div className="border-t border-gray-100 my-2" />
                )}
                {level1Nodes.map((node) => {
                  const children = level2Nodes.filter((c) => c.parent_node_id === node.id)
                  return (
                    <div key={node.id}>
                      <button
                        onClick={() => selectNode(node)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                          selectedId === node.id
                            ? 'bg-optio-purple/10 text-optio-purple'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: node.color }} />
                        <span className="font-medium truncate">{node.label}</span>
                        {!node.is_visible && <span className="text-[10px] text-gray-400 ml-auto">(hidden)</span>}
                      </button>
                      {children.map((child) => (
                        <button
                          key={child.id}
                          onClick={() => selectNode(child)}
                          className={`w-full text-left pl-8 pr-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                            selectedId === child.id
                              ? 'bg-optio-purple/10 text-optio-purple'
                              : 'hover:bg-gray-50 text-gray-500'
                          }`}
                        >
                          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: child.color }} />
                          <span className="truncate">{child.label}</span>
                        </button>
                      ))}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* Edge list */}
          {editMode === 'edge' && !formData && (
            <>
              <button
                onClick={startNewEdge}
                className="w-full mb-3 px-3 py-2 rounded-lg border-2 border-dashed border-gray-300 text-sm text-gray-500 hover:border-optio-purple hover:text-optio-purple transition-colors"
              >
                + Add Edge
              </button>
              <div className="space-y-1">
                {rawEdges.map((edge) => {
                  const source = rawNodes.find((n) => n.id === edge.source_node_id)
                  const target = rawNodes.find((n) => n.id === edge.target_node_id)
                  return (
                    <button
                      key={edge.id}
                      onClick={() => selectEdge(edge)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                        selectedId === edge.id
                          ? 'bg-optio-purple/10 text-optio-purple'
                          : 'hover:bg-gray-50 text-gray-600'
                      }`}
                    >
                      <span className="font-medium">{source?.label || '?'}</span>
                      <span className="text-gray-400 mx-1">{edge.edge_type === 'includes' ? '-->' : '- - ->'}</span>
                      <span className="font-medium">{target?.label || '?'}</span>
                      {edge.label_text && (
                        <span className="text-gray-400 ml-1">"{edge.label_text}"</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Node edit form */}
          {editMode === 'node' && formData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm text-gray-900">
                  {isNew ? 'New Node' : 'Edit Node'}
                </h3>
                <button
                  onClick={() => { setFormData(null); setSelectedId(null) }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>

              {/* Label */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                <input
                  type="text"
                  value={formData.label || ''}
                  onChange={(e) => setField('label', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-optio-purple/30 focus:border-optio-purple"
                />
              </div>

              {/* Summary */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Summary</label>
                <textarea
                  value={formData.summary || ''}
                  onChange={(e) => setField('summary', e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm focus:ring-2 focus:ring-optio-purple/30 focus:border-optio-purple resize-none"
                />
              </div>

              {/* Color + Level row */}
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={formData.color || '#6D469B'}
                      onChange={(e) => setField('color', e.target.value)}
                      className="w-8 h-8 rounded border border-gray-300 cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.color || '#6D469B'}
                      onChange={(e) => setField('color', e.target.value)}
                      className="flex-1 px-2 py-1.5 rounded border border-gray-300 text-xs font-mono"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Level</label>
                  <div className="flex gap-2 mt-1">
                    {[0, 1, 2].map((l) => (
                      <button
                        key={l}
                        onClick={() => setField('level', l)}
                        className={`px-3 py-1.5 rounded text-xs font-medium ${
                          formData.level === l
                            ? 'bg-optio-purple text-white'
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        {l === 0 ? 'Center' : l === 1 ? 'Major' : 'Child'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Parent (for level 2) */}
              {formData.level === 2 && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Parent Node</label>
                  <select
                    value={formData.parent_node_id || ''}
                    onChange={(e) => setField('parent_node_id', e.target.value || null)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  >
                    <option value="">None</option>
                    {[...centerNodes, ...level1Nodes].map((n) => (
                      <option key={n.id} value={n.id}>{n.label}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Image URL */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Image URL</label>
                <input
                  type="text"
                  value={formData.image_url || ''}
                  onChange={(e) => setField('image_url', e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                />
              </div>

              {/* Visibility + Sort */}
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
                  <input
                    type="number"
                    value={formData.sort_order || 0}
                    onChange={(e) => setField('sort_order', parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  />
                </div>
                <label className="flex items-center gap-2 pb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.is_visible !== false}
                    onChange={(e) => setField('is_visible', e.target.checked)}
                    className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                  />
                  <span className="text-xs text-gray-600">Visible</span>
                </label>
              </div>

              {/* Detail Content (Rich Text) */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Detail Content</label>
                <RichTextEditor
                  value={formData.detail_content || ''}
                  onChange={(html) => setField('detail_content', html)}
                  placeholder="Full content shown in detail panel..."
                  minHeight="150px"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveNode}
                  disabled={saving}
                  className="flex-1 px-4 py-2 rounded-lg bg-optio-purple text-white text-sm font-medium hover:bg-optio-purple-dark transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : isNew ? 'Create' : 'Save'}
                </button>
                {!isNew && (
                  <button
                    onClick={handleDeleteNode}
                    className="px-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Edge edit form */}
          {editMode === 'edge' && formData && (
            <div className="space-y-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold text-sm text-gray-900">
                  {isNew ? 'New Edge' : 'Edit Edge'}
                </h3>
                <button
                  onClick={() => { setFormData(null); setSelectedId(null) }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Cancel
                </button>
              </div>

              {/* Source */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Source Node</label>
                <select
                  value={formData.source_node_id || ''}
                  onChange={(e) => setField('source_node_id', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  <option value="">Select...</option>
                  {rawNodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.label}</option>
                  ))}
                </select>
              </div>

              {/* Target */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Target Node</label>
                <select
                  value={formData.target_node_id || ''}
                  onChange={(e) => setField('target_node_id', e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                >
                  <option value="">Select...</option>
                  {rawNodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.label}</option>
                  ))}
                </select>
              </div>

              {/* Edge type */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <div className="flex gap-2">
                  {['includes', 'connects_to'].map((t) => (
                    <button
                      key={t}
                      onClick={() => setField('edge_type', t)}
                      className={`px-3 py-1.5 rounded text-xs font-medium ${
                        formData.edge_type === t
                          ? 'bg-optio-purple text-white'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {t === 'includes' ? 'Includes (solid)' : 'Connects to (dashed)'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Label (for connects_to) */}
              {formData.edge_type === 'connects_to' && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Label</label>
                  <input
                    type="text"
                    value={formData.label_text || ''}
                    onChange={(e) => setField('label_text', e.target.value)}
                    placeholder="e.g. 'the missing ingredient'"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 text-sm"
                  />
                </div>
              )}

              {/* Visibility */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.is_visible !== false}
                  onChange={(e) => setField('is_visible', e.target.checked)}
                  className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                />
                <span className="text-xs text-gray-600">Visible</span>
              </label>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSaveEdge}
                  disabled={saving}
                  className="flex-1 px-4 py-2 rounded-lg bg-optio-purple text-white text-sm font-medium hover:bg-optio-purple-dark transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : isNew ? 'Create' : 'Save'}
                </button>
                {!isNew && (
                  <button
                    onClick={handleDeleteEdge}
                    className="px-4 py-2 rounded-lg bg-red-50 text-red-600 text-sm font-medium hover:bg-red-100 transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========== RIGHT PANEL: Live Preview ========== */}
      <div className="flex-1 bg-gray-50">
        <Suspense
          fallback={
            <div className="flex justify-center items-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
            </div>
          }
        >
          <MindMap
            initialNodes={flowNodes}
            initialEdges={flowEdges}
            isAdmin={true}
            onNodeDragStop={handleNodeDragStop}
          />
        </Suspense>
      </div>
    </div>
  )
}

export default PhilosophyEditor
