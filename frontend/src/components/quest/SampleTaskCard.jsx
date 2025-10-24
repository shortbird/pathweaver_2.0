import React, { useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { getPillarData } from '../../utils/pillarMappings';
import toast from 'react-hot-toast';

const SampleTaskCard = ({ task, onAdd, disabled = false }) => {
  const [isAdding, setIsAdding] = useState(false);
  const pillarData = getPillarData(task.pillar);

  const handleAdd = async () => {
    if (disabled || isAdding) return;

    setIsAdding(true);
    try {
      await onAdd(task);
      toast.success('Task added to your quest!');
    } catch (error) {
      console.error('Failed to add task:', error);
      toast.error(error.response?.data?.error || 'Failed to add task');
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <div
      className="relative rounded-xl overflow-hidden transition-all hover:shadow-lg group border-2 border-gray-100 hover:border-gray-200"
      style={{
        background: `linear-gradient(135deg, ${pillarData.color}15 0%, ${pillarData.color}05 100%)`
      }}
    >
      {/* AI Generated Badge */}
      {task.ai_generated && (
        <div className="absolute top-2 right-2 z-10">
          <div
            className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold text-white"
            style={{ backgroundColor: pillarData.color }}
          >
            <Sparkles className="w-3 h-3" />
            AI
          </div>
        </div>
      )}

      {/* Card Content */}
      <div className="p-4">
        {/* Pillar Badge */}
        <div className="mb-3">
          <div
            className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: pillarData.color }}
          >
            <span>{pillarData.icon}</span>
            <span style={{ fontFamily: 'Poppins' }}>{pillarData.name}</span>
          </div>
        </div>

        {/* Task Title */}
        <h3
          className="text-lg font-bold text-gray-900 mb-2 leading-tight"
          style={{ fontFamily: 'Poppins' }}
        >
          {task.title}
        </h3>

        {/* Task Description */}
        {task.description && (
          <p
            className="text-sm text-gray-700 mb-3 line-clamp-3"
            style={{ fontFamily: 'Poppins' }}
          >
            {task.description}
          </p>
        )}

        {/* XP Badge */}
        <div className="flex items-center justify-between mb-3">
          <div
            className="px-3 py-1 rounded-full text-sm font-bold"
            style={{
              backgroundColor: `${pillarData.color}20`,
              color: pillarData.color
            }}
          >
            {task.xp_value} XP
          </div>
        </div>

        {/* Add Button */}
        <button
          onClick={handleAdd}
          disabled={disabled || isAdding}
          className="w-full py-2.5 rounded-full font-bold text-sm uppercase tracking-wide transition-all hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          style={{
            backgroundColor: pillarData.color,
            color: 'white',
            fontFamily: 'Poppins'
          }}
        >
          {isAdding ? (
            'Adding...'
          ) : (
            <>
              <Plus className="w-4 h-4" />
              Add to My Quest
            </>
          )}
        </button>

        {/* Tooltip Text */}
        <p className="text-xs text-gray-500 text-center mt-2" style={{ fontFamily: 'Poppins' }}>
          This is a suggested approach. Customize it to make it yours!
        </p>
      </div>
    </div>
  );
};

export default SampleTaskCard;
