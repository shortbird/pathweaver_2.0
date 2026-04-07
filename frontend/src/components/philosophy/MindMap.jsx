import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import CenterNode from './CenterNode'
import MindMapNode from './MindMapNode'
import MindMapChildNode from './MindMapChildNode'
import IncludesEdge from './IncludesEdge'
import ConnectsToEdge from './ConnectsToEdge'
import NodeDetailPanel from './NodeDetailPanel'

const nodeTypes = {
  centerNode: CenterNode,
  majorNode: MindMapNode,
  childNode: MindMapChildNode,
}

const edgeTypes = {
  includes: IncludesEdge,
  connects_to: ConnectsToEdge,
}

/**
 * MindMapInner - The actual React Flow canvas (must be inside ReactFlowProvider).
 */
const MindMapInner = ({
  initialNodes,
  initialEdges,
  isAdmin = false,
  onNodeDragStop,
  onDetailOpen,
}) => {
  const { fitView } = useReactFlow()
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)
  const [expandedParent, setExpandedParent] = useState(null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [detailNode, setDetailNode] = useState(null)

  // Get child node IDs for a parent
  const childrenMap = useMemo(() => {
    const map = {}
    initialNodes.forEach((n) => {
      if (n.data.parentNodeId) {
        if (!map[n.data.parentNodeId]) map[n.data.parentNodeId] = []
        map[n.data.parentNodeId].push(n.id)
      }
    })
    return map
  }, [initialNodes])

  // Get edges connected to a node
  const getConnectedEdgeIds = useCallback(
    (nodeId) => {
      return edges
        .filter((e) => e.source === nodeId || e.target === nodeId)
        .map((e) => e.id)
    },
    [edges]
  )

  // Get nodes connected to a node via edges
  const getConnectedNodeIds = useCallback(
    (nodeId) => {
      const ids = new Set()
      edges.forEach((e) => {
        if (e.source === nodeId) ids.add(e.target)
        if (e.target === nodeId) ids.add(e.source)
      })
      return ids
    },
    [edges]
  )

  // Handle node click: zoom-in for major nodes, detail panel for child nodes
  const handleNodeClick = useCallback(
    (event, node) => {
      event.stopPropagation()

      if (node.data.level === 1) {
        const childIds = childrenMap[node.id] || []
        const hasChildren = childIds.length > 0

        if (expandedParent === node.id) {
          // Already expanded - open detail panel for this major node
          setDetailNode(node.data)
          onDetailOpen?.(node.data)
          return
        }

        // Collapse any previously expanded parent
        setNodes((nds) =>
          nds.map((n) => {
            if (n.data.level === 2) {
              return { ...n, hidden: true }
            }
            return n
          })
        )
        setEdges((eds) =>
          eds.map((e) => {
            if (e.type === 'includes') {
              return { ...e, hidden: true }
            }
            return e
          })
        )

        if (hasChildren) {
          // Expand children of clicked node
          setExpandedParent(node.id)
          setSelectedNodeId(node.id)

          setNodes((nds) =>
            nds.map((n) => {
              if (childIds.includes(n.id)) {
                return { ...n, hidden: false }
              }
              return n
            })
          )
          setEdges((eds) =>
            eds.map((e) => {
              if (
                e.type === 'includes' &&
                e.source === node.id &&
                childIds.includes(e.target)
              ) {
                return { ...e, hidden: false }
              }
              return e
            })
          )

          // Smooth zoom to the parent + children cluster
          setTimeout(() => {
            fitView({
              nodes: [{ id: node.id }, ...childIds.map((id) => ({ id }))],
              duration: 600,
              padding: 0.3,
            })
          }, 50)
        } else {
          // No children - open detail
          setExpandedParent(null)
          setSelectedNodeId(node.id)
          setDetailNode(node.data)
          onDetailOpen?.(node.data)
        }
      } else {
        // Child node - open detail panel
        setSelectedNodeId(node.id)
        setDetailNode(node.data)
        onDetailOpen?.(node.data)
      }

      // Kumu-style highlighting: dim non-connected nodes
      const connectedIds = getConnectedNodeIds(node.id)
      connectedIds.add(node.id)

      setNodes((nds) =>
        nds.map((n) => ({
          ...n,
          style: {
            ...n.style,
            opacity: connectedIds.has(n.id) ? 1 : 0.15,
            transition: 'opacity 0.3s ease',
          },
        }))
      )
      setEdges((eds) =>
        eds.map((e) => ({
          ...e,
          style: {
            ...e.style,
            opacity:
              e.source === node.id || e.target === node.id ? 1 : 0.1,
            transition: 'opacity 0.3s ease',
          },
        }))
      )
    },
    [
      expandedParent,
      childrenMap,
      setNodes,
      setEdges,
      fitView,
      getConnectedNodeIds,
      onDetailOpen,
    ]
  )

  // Click on empty canvas: reset zoom, hide children, clear highlighting
  const handlePaneClick = useCallback(() => {
    setSelectedNodeId(null)
    setDetailNode(null)
    setExpandedParent(null)

    // Reset all nodes: hide level 2, restore opacity
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        hidden: n.data.level === 2,
        style: { ...n.style, opacity: 1, transition: 'opacity 0.3s ease' },
      }))
    )
    // Reset all edges: hide includes, restore opacity
    setEdges((eds) =>
      eds.map((e) => ({
        ...e,
        hidden: e.type === 'includes',
        style: { ...e.style, opacity: 1, transition: 'opacity 0.3s ease' },
      }))
    )

    setTimeout(() => {
      fitView({ duration: 500, padding: 0.15 })
    }, 50)
  }, [setNodes, setEdges, fitView])

  // Handle node drag stop (admin only - for repositioning)
  const handleNodeDragStop = useCallback(
    (event, node) => {
      if (onNodeDragStop) {
        onNodeDragStop(node.id, node.position)
      }
    },
    [onNodeDragStop]
  )

  // Close detail panel
  const handleCloseDetail = useCallback(() => {
    setDetailNode(null)
  }, [])

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onPaneClick={handlePaneClick}
        onNodeDragStop={isAdmin ? handleNodeDragStop : undefined}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.2}
        maxZoom={2.5}
        panOnScroll={isAdmin}
        zoomOnScroll={isAdmin}
        zoomOnPinch={true}
        panOnDrag={true}
        preventScrolling={isAdmin}
        nodesDraggable={isAdmin}
        nodesConnectable={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant="dots" gap={24} size={1} color="#e5e7eb" />
        <Controls showInteractive={false} showFitView={false} position="bottom-left" />
        {isAdmin && <MiniMap position="bottom-right" />}
      </ReactFlow>

      {/* Back button when zoomed in */}
      {expandedParent && (
        <button
          onClick={handlePaneClick}
          className="absolute top-4 left-4 z-20 flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span className="text-sm font-medium text-gray-600">Back to overview</span>
        </button>
      )}

      {/* Detail panel */}
      <NodeDetailPanel node={detailNode} onClose={handleCloseDetail} />
    </div>
  )
}

/**
 * MindMap - Wrapped with ReactFlowProvider.
 * Shared by public page and admin editor.
 * Fullscreen logic lives here so the portal wraps the entire Provider.
 */
const MindMap = (props) => {
  const [isFullscreen, setIsFullscreen] = useState(false)

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'Escape' && isFullscreen) setIsFullscreen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isFullscreen])

  useEffect(() => {
    document.body.style.overflow = isFullscreen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isFullscreen])

  const fullscreenButton = !props.isAdmin && (
    <button
      onClick={() => setIsFullscreen((f) => !f)}
      style={{ position: 'absolute', top: 16, right: 16, zIndex: 20 }}
      className="flex items-center gap-2 px-3 py-2 bg-white rounded-full shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors"
      title={isFullscreen ? 'Exit fullscreen (Esc)' : 'Fullscreen'}
    >
      {isFullscreen ? (
        <>
          <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          <span className="text-xs font-medium text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Esc to exit
          </span>
        </>
      ) : (
        <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
        </svg>
      )}
    </button>
  )

  if (isFullscreen) {
    return createPortal(
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          zIndex: 99999,
          background: '#fff',
        }}
      >
        <ReactFlowProvider>
          <MindMapInner {...props} />
        </ReactFlowProvider>
        {fullscreenButton}
      </div>,
      document.body
    )
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <ReactFlowProvider>
        <MindMapInner {...props} />
      </ReactFlowProvider>
      {fullscreenButton}
    </div>
  )
}

export default MindMap
