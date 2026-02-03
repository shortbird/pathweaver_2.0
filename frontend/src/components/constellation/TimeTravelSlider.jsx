import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';

const TimeTravelSlider = ({ onTimeChange, currentTime, minTime, maxTime }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const handleSliderChange = (e) => {
    onTimeChange(parseInt(e.target.value));
  };

  // Calculate step size (progress through range in ~10 seconds at 60fps)
  const totalRange = maxTime - minTime;
  const stepSize = Math.max(totalRange / 600, 86400000); // At least 1 day per step

  // Auto-play effect
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      const next = currentTime + stepSize;
      if (next >= maxTime) {
        setIsPlaying(false);
        onTimeChange(maxTime);
      } else {
        onTimeChange(next);
      }
    }, 16); // ~60fps

    return () => clearInterval(interval);
  }, [isPlaying, currentTime, maxTime, stepSize, onTimeChange]);

  // Stop playing if user manually changes slider
  const handleManualChange = (e) => {
    setIsPlaying(false);
    handleSliderChange(e);
  };

  const togglePlay = () => {
    if (currentTime >= maxTime) {
      // If at the end, restart from beginning
      onTimeChange(minTime);
    }
    setIsPlaying(!isPlaying);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-[100]"
    >
      <div className="bg-gray-900/90 backdrop-blur-md border border-white/20 rounded-2xl px-4 sm:px-8 py-5 shadow-2xl">
        <div className="flex items-center gap-6">
          {/* Time Travel Icon */}
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-white/80"
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
            <span className="text-white/80 text-sm font-medium">Time Travel</span>
          </div>

          {/* Play/Pause Button */}
          <button
            onClick={togglePlay}
            className="w-10 h-10 flex items-center justify-center bg-white/10 hover:bg-white/20 rounded-full transition-all"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Date Display */}
          <div className="text-white font-semibold text-base min-w-[120px] text-center">
            {formatDate(currentTime)}
          </div>

          {/* Slider */}
          <div className="flex items-center gap-3">
            <span className="text-white/60 text-xs">{formatDate(minTime)}</span>
            <input
              type="range"
              min={minTime}
              max={maxTime}
              value={currentTime}
              onChange={handleManualChange}
              className="w-full max-w-[180px] sm:w-64 h-3 sm:h-2 bg-white/20 rounded-lg appearance-none cursor-pointer
                         focus:outline-none focus:ring-2 focus:ring-white/40
                         slider-thumb touch-manipulation"
              style={{
                background: `linear-gradient(to right,
                  #ef597b 0%,
                  #6d469b ${((currentTime - minTime) / (maxTime - minTime)) * 100}%,
                  rgba(255,255,255,0.2) ${((currentTime - minTime) / (maxTime - minTime)) * 100}%)`
              }}
            />
            <span className="text-white/60 text-xs">{formatDate(maxTime)}</span>
          </div>

          {/* Reset Button */}
          <button
            onClick={() => onTimeChange(maxTime)}
            className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium
                       rounded-lg transition-all"
          >
            Now
          </button>
        </div>
      </div>

      <style>
        {`
          .slider-thumb::-webkit-slider-thumb {
            appearance: none;
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: white;
            cursor: pointer;
            box-shadow: 0 0 10px rgba(239, 89, 123, 0.5);
            transition: all 0.15s ease;
          }

          .slider-thumb::-webkit-slider-thumb:hover {
            transform: scale(1.2);
            box-shadow: 0 0 15px rgba(239, 89, 123, 0.8);
          }

          .slider-thumb::-moz-range-thumb {
            width: 24px;
            height: 24px;
            border-radius: 50%;
            background: white;
            cursor: pointer;
            border: none;
            box-shadow: 0 0 10px rgba(239, 89, 123, 0.5);
            transition: all 0.15s ease;
          }

          .slider-thumb::-moz-range-thumb:hover {
            transform: scale(1.2);
            box-shadow: 0 0 15px rgba(239, 89, 123, 0.8);
          }

          @media (prefers-reduced-motion: reduce) {
            .slider-thumb::-webkit-slider-thumb,
            .slider-thumb::-moz-range-thumb {
              transition: none !important;
            }
          }
        `}
      </style>
    </motion.div>
  );
};

export default React.memo(TimeTravelSlider);
