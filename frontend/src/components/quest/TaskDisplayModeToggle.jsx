;

const TaskDisplayModeToggle = ({ mode, onModeChange }) => {
  return (
    <div className="px-4 pt-4 pb-2">
      {/* Segmented Control */}
      <div className="flex bg-gray-200 rounded-lg p-1">
        <button
          onClick={() => onModeChange('timeline')}
          className={`
            flex-1 py-2 px-3 rounded-md font-semibold text-sm transition-all flex items-center justify-center gap-2
            ${mode === 'timeline'
              ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
            }
          `}
          style={{ fontFamily: 'Poppins' }}
        >
          <ArrowDownUp className="w-4 h-4" />
          <span>Timeline</span>
        </button>
        <button
          onClick={() => onModeChange('flexible')}
          className={`
            flex-1 py-2 px-3 rounded-md font-semibold text-sm transition-all flex items-center justify-center gap-2
            ${mode === 'flexible'
              ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
            }
          `}
          style={{ fontFamily: 'Poppins' }}
        >
          <Grid3x3 className="w-4 h-4" />
          <span>Flexible</span>
        </button>
      </div>

      {/* Mode Description */}
      <p className="text-xs text-gray-500 mt-2 text-center" style={{ fontFamily: 'Poppins' }}>
        {mode === 'timeline'
          ? 'Tasks in sequential order'
          : 'Pick any task you want'
        }
      </p>
    </div>
  );
};

export default TaskDisplayModeToggle;
