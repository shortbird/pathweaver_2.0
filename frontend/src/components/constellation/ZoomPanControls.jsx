import React from 'react';
import { motion } from 'framer-motion';

const ZoomPanControls = ({ zoom, onZoomChange, onResetView, showTimeTravel, onToggleTimeTravel, hasMultipleQuests = false }) => {
  const handleZoomIn = () => {
    onZoomChange(Math.min(zoom + 0.2, 3));
  };

  const handleZoomOut = () => {
    onZoomChange(Math.max(zoom - 0.2, 0.5));
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed right-4 bottom-20 md:right-8 md:top-1/2 md:transform md:-translate-y-1/2 z-[100]"
    >
      <div className="bg-gray-900/90 backdrop-blur-md border border-white/20 rounded-2xl p-3 shadow-2xl">
        <div className="flex flex-col gap-3">
          {/* Zoom In Button */}
          <button
            onClick={handleZoomIn}
            disabled={zoom >= 3}
            className="min-w-[44px] min-h-[44px] w-12 h-12 flex items-center justify-center bg-white/10 sm:hover:bg-white/20
                       disabled:opacity-50 disabled:cursor-not-allowed
                       rounded-lg transition-all group"
            aria-label="Zoom in"
          >
            <svg
              className="w-6 h-6 text-white group-hover:scale-110 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7"
              />
            </svg>
          </button>

          {/* Zoom Level Indicator */}
          <div className="w-12 h-12 flex items-center justify-center">
            <span className="text-white font-semibold text-sm">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {/* Zoom Out Button */}
          <button
            onClick={handleZoomOut}
            disabled={zoom <= 0.5}
            className="min-w-[44px] min-h-[44px] w-12 h-12 flex items-center justify-center bg-white/10 sm:hover:bg-white/20
                       disabled:opacity-50 disabled:cursor-not-allowed
                       rounded-lg transition-all group"
            aria-label="Zoom out"
          >
            <svg
              className="w-6 h-6 text-white group-hover:scale-110 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"
              />
            </svg>
          </button>

          {/* Divider */}
          <div className="h-px bg-white/20 my-1" />

          {/* Reset View Button */}
          <button
            onClick={onResetView}
            className="min-w-[44px] min-h-[44px] w-12 h-12 flex items-center justify-center bg-white/10 sm:hover:bg-white/20
                       rounded-lg transition-all group"
            aria-label="Reset view"
            title="Reset zoom and pan"
          >
            <svg
              className="w-6 h-6 text-white group-hover:scale-110 transition-transform"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>

          {/* Time Travel Button - Only show if there are multiple quests */}
          {hasMultipleQuests && (
            <>
              {/* Divider */}
              <div className="h-px bg-white/20 my-1" />

              <button
                onClick={onToggleTimeTravel}
                className={`min-w-[44px] min-h-[44px] w-12 h-12 flex items-center justify-center rounded-lg transition-all group
                  ${showTimeTravel
                    ? 'bg-gradient-primary'
                    : 'bg-white/10 sm:hover:bg-white/20'}`}
                aria-label="Toggle time travel"
                title="Time Travel Mode"
              >
                <svg
                  className="w-6 h-6 text-white group-hover:scale-110 transition-transform"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Mini-map (optional, can be implemented later) */}
      {/* <div className="mt-4 bg-gray-900/90 backdrop-blur-md border border-white/20
                      rounded-2xl p-3 shadow-2xl">
        <div className="w-32 h-32 bg-gray-800/50 rounded-lg relative">
          // Mini-map content
        </div>
      </div> */}
    </motion.div>
  );
};

export default React.memo(ZoomPanControls);
