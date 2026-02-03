import React, { useMemo, useCallback, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import TopicCluster from './TopicCluster';
import QuestNode from './QuestNode';

// Custom node types
const nodeTypes = {
  topicCluster: TopicCluster,
  questNode: QuestNode
};

// Topic position mapping (arranged in a circle)
const TOPIC_POSITIONS = {
  Creative: { x: 400, y: 100 },
  Science: { x: 700, y: 150 },
  Building: { x: 850, y: 350 },
  Nature: { x: 700, y: 550 },
  Business: { x: 400, y: 600 },
  Personal: { x: 150, y: 550 },
  Academic: { x: 0, y: 350 },
  Food: { x: 150, y: 150 },
  Games: { x: 400, y: 350 }
};

// Topic colors for nodes
const TOPIC_COLORS = {
  Creative: '#A855F7',
  Science: '#3B82F6',
  Building: '#F97316',
  Nature: '#22C55E',
  Business: '#64748B',
  Personal: '#EC4899',
  Academic: '#6366F1',
  Food: '#F59E0B',
  Games: '#06B6D4'
};

/**
 * QuestMap - Interactive visual quest explorer using React Flow
 */
const QuestMap = ({
  quests = [],
  topics = [],
  selectedTopic,
  onTopicClick,
  onQuestClick
}) => {
  const [expandedTopic, setExpandedTopic] = useState(null);

  // Generate nodes from topics and quests
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const nodes = [];
    const edges = [];

    // Create topic cluster nodes
    topics.forEach((topic, index) => {
      const position = TOPIC_POSITIONS[topic.name] || { x: index * 200, y: 200 };
      const color = TOPIC_COLORS[topic.name] || '#6B7280';

      nodes.push({
        id: `topic-${topic.name}`,
        type: 'topicCluster',
        position,
        data: {
          label: topic.name,
          count: topic.count,
          color,
          isSelected: selectedTopic === topic.name,
          isExpanded: expandedTopic === topic.name,
          onClick: () => {
            if (expandedTopic === topic.name) {
              setExpandedTopic(null);
            } else {
              setExpandedTopic(topic.name);
              onTopicClick?.(topic.name);
            }
          }
        }
      });
    });

    // If a topic is expanded, show quest nodes for that topic
    if (expandedTopic) {
      const topicQuests = quests.filter(
        q => q.topic_primary === expandedTopic
      ).slice(0, 12); // Limit to 12 quests

      const topicPosition = TOPIC_POSITIONS[expandedTopic] || { x: 400, y: 300 };
      const radius = 180;

      topicQuests.forEach((quest, index) => {
        const angle = (index / topicQuests.length) * 2 * Math.PI - Math.PI / 2;
        const x = topicPosition.x + Math.cos(angle) * radius;
        const y = topicPosition.y + Math.sin(angle) * radius;

        nodes.push({
          id: `quest-${quest.id}`,
          type: 'questNode',
          position: { x, y },
          data: {
            quest,
            color: TOPIC_COLORS[expandedTopic] || '#6B7280',
            onClick: () => onQuestClick?.(quest)
          }
        });

        // Add edge from topic to quest
        edges.push({
          id: `edge-${expandedTopic}-${quest.id}`,
          source: `topic-${expandedTopic}`,
          target: `quest-${quest.id}`,
          type: 'straight',
          style: {
            stroke: TOPIC_COLORS[expandedTopic] || '#6B7280',
            strokeWidth: 1,
            opacity: 0.3
          }
        });
      });
    }

    return { nodes, edges };
  }, [topics, quests, selectedTopic, expandedTopic, onTopicClick, onQuestClick]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Update nodes when data changes
  React.useEffect(() => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  }, [initialNodes, initialEdges, setNodes, setEdges]);

  // Handle background click to deselect
  const onPaneClick = useCallback(() => {
    setExpandedTopic(null);
    onTopicClick?.(null);
  }, [onTopicClick]);

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#E5E7EB" gap={20} size={1} />
        <Controls
          showZoom={true}
          showFitView={true}
          showInteractive={false}
          className="bg-white rounded-lg shadow-md"
        />
        <MiniMap
          nodeColor={(node) => {
            if (node.type === 'topicCluster') {
              return node.data.color || '#6B7280';
            }
            return '#E5E7EB';
          }}
          className="bg-white rounded-lg shadow-md"
        />
      </ReactFlow>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 bg-white/90 backdrop-blur rounded-lg p-3 shadow-md">
        <p className="text-xs text-gray-600 mb-2 font-medium">Click a topic to explore quests</p>
        <div className="flex flex-wrap gap-2">
          {topics.slice(0, 5).map((topic) => (
            <div key={topic.name} className="flex items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: TOPIC_COLORS[topic.name] || '#6B7280' }}
              />
              <span className="text-xs text-gray-700">{topic.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default QuestMap;
