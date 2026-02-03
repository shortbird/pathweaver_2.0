import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const ConstellationExit = ({ onExit }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const navigate = useNavigate();

  const handleExit = () => {
    if (onExit) {
      onExit();
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3, duration: 0.3 }}
      whileHover={{ scale: window.innerWidth >= 640 ? 1.1 : 1 }}
      whileTap={{ scale: 0.95 }}
      onClick={handleExit}
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      className="fixed top-4 right-4 z-[100]
                 min-w-[44px] min-h-[44px] w-12 h-12 rounded-full
                 bg-white/10 backdrop-blur-md
                 border border-white/20
                 flex items-center justify-center
                 sm:hover:bg-white/20 transition-all
                 group"
      aria-label="Exit constellation view"
    >
      {/* X Icon */}
      <svg
        className="w-6 h-6 text-white"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>

      {/* Tooltip */}
      {showTooltip && (
        <motion.span
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -bottom-12 right-0
                     bg-gray-900 text-white
                     px-3 py-2 rounded-lg text-sm whitespace-nowrap
                     border border-white/10
                     pointer-events-none"
          style={{ boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}
        >
          Exit Constellation
          <div className="absolute -top-1 right-4 w-2 h-2 bg-gray-900 transform rotate-45 border-l border-t border-white/10" />
        </motion.span>
      )}
    </motion.button>
  );
};

export default ConstellationExit;
