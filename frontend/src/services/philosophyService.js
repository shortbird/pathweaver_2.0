import api from './api'

/**
 * Transform API node data into React Flow node format.
 */
const NODE_TYPE_MAP = { 0: 'centerNode', 1: 'majorNode', 2: 'childNode' }

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

/**
 * Pick the closest handle pair (top/bottom/left/right) based on node positions.
 */
function getBestHandles(sourceNode, targetNode) {
  const sx = sourceNode.position_x
  const sy = sourceNode.position_y
  const tx = targetNode.position_x
  const ty = targetNode.position_y
  const dx = tx - sx
  const dy = ty - sy

  // Pick based on which axis has the greater delta
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal: source-right -> target-left, or source-left -> target-right
    if (dx > 0) {
      return { sourceHandle: 'right-src', targetHandle: 'left-tgt' }
    }
    return { sourceHandle: 'left-src', targetHandle: 'right-tgt' }
  }
  // Vertical: source-bottom -> target-top, or source-top -> target-bottom
  if (dy > 0) {
    return { sourceHandle: 'bottom-src', targetHandle: 'top-tgt' }
  }
  return { sourceHandle: 'top-src', targetHandle: 'bottom-tgt' }
}

/**
 * Transform API edge data into React Flow edge format.
 * Requires nodeMap to compute best handle positions.
 */
function toFlowEdge(edge, nodeMap) {
  const sourceNode = nodeMap[edge.source_node_id]
  const targetNode = nodeMap[edge.target_node_id]

  const handles = sourceNode && targetNode
    ? getBestHandles(sourceNode, targetNode)
    : { sourceHandle: 'bottom-src', targetHandle: 'top-tgt' }

  return {
    id: edge.id,
    source: edge.source_node_id,
    target: edge.target_node_id,
    sourceHandle: handles.sourceHandle,
    targetHandle: handles.targetHandle,
    type: edge.edge_type,
    hidden: false,
    data: {
      edgeType: edge.edge_type,
      labelText: edge.label_text,
    },
  }
}

// ============================================================
// Public
// ============================================================

export async function fetchPhilosophyMap() {
  const response = await api.get('/api/public/philosophy/map')
  const { nodes: rawNodes, edges: rawEdges } = response.data

  // Build lookup for edge handle computation
  const nodeMap = {}
  rawNodes.forEach((n) => { nodeMap[n.id] = n })

  return {
    nodes: rawNodes.map(toFlowNode),
    edges: rawEdges.map((e) => toFlowEdge(e, nodeMap)),
  }
}

// ============================================================
// Admin CRUD
// ============================================================

export async function fetchAdminNodes() {
  const response = await api.get('/api/admin/philosophy/nodes')
  return response.data.nodes || []
}

export async function fetchAdminEdges() {
  const response = await api.get('/api/admin/philosophy/edges')
  return response.data.edges || []
}

export async function createNode(data) {
  const response = await api.post('/api/admin/philosophy/nodes', data)
  return response.data.node
}

export async function updateNode(id, data) {
  const response = await api.put(`/api/admin/philosophy/nodes/${id}`, data)
  return response.data.node
}

export async function deleteNode(id) {
  await api.delete(`/api/admin/philosophy/nodes/${id}`)
}

export async function updateNodePositions(positions) {
  await api.put('/api/admin/philosophy/nodes/positions', { positions })
}

export async function createEdge(data) {
  const response = await api.post('/api/admin/philosophy/edges', data)
  return response.data.edge
}

export async function updateEdge(id, data) {
  const response = await api.put(`/api/admin/philosophy/edges/${id}`, data)
  return response.data.edge
}

export async function deleteEdge(id) {
  await api.delete(`/api/admin/philosophy/edges/${id}`)
}
