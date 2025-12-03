import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

/**
 * PickUpSetDownButton
 *
 * Unified quest action button that handles:
 * - Picking up new quests
 * - Picking up again (returning to quest)
 * - Setting down active quests
 *
 * Philosophy-aligned language: "pick up" / "set down" (not complete/abandon)
 */
const PickUpSetDownButton = ({
  questId,
  userQuestStatus = null,  // 'picked_up', 'set_down', or null (not started)
  timesPickedUp = 0,
  onPickUp,
  onSetDown,
  className = '',
  size = 'md'  // 'sm', 'md', 'lg'
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const handlePickUp = async () => {
    setIsLoading(true);
    try {
      const response = await api.post(`/quests/${questId}/pickup`, {});

      if (onPickUp) {
        onPickUp(response.data);
      }

      // Navigate to quest detail page
      navigate(`/quests/${questId}`);
    } catch (error) {
      console.error('Error picking up quest:', error);
      alert('Failed to pick up quest. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSetDown = () => {
    // Open reflection modal (handled by parent component)
    if (onSetDown) {
      onSetDown();
    }
  };

  // Button size classes
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg'
  };

  // Determine button state and text
  const getButtonConfig = () => {
    if (userQuestStatus === 'picked_up') {
      return {
        text: 'Set Down',
        onClick: handleSetDown,
        style: 'bg-purple-100 text-purple-700 hover:bg-purple-200 border-2 border-purple-300',
        icon: '⤵️'
      };
    } else if (userQuestStatus === 'set_down') {
      return {
        text: timesPickedUp > 1 ? `Pick Up Again (${timesPickedUp}x)` : 'Pick Up Again',
        onClick: handlePickUp,
        style: 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:from-purple-700 hover:to-pink-700',
        icon: '↻'
      };
    } else {
      return {
        text: 'Pick Up',
        onClick: handlePickUp,
        style: 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:from-purple-700 hover:to-pink-700',
        icon: '⤴️'
      };
    }
  };

  const config = getButtonConfig();

  return (
    <button
      onClick={config.onClick}
      disabled={isLoading}
      className={`
        ${sizeClasses[size]}
        ${config.style}
        font-semibold
        rounded-lg
        transition-all
        duration-200
        shadow-md
        hover:shadow-lg
        disabled:opacity-50
        disabled:cursor-not-allowed
        flex items-center gap-2
        ${className}
      `}
    >
      <span>{config.icon}</span>
      <span>{isLoading ? 'Loading...' : config.text}</span>
    </button>
  );
};

export default PickUpSetDownButton;
