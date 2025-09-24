import React, { useState, useEffect } from 'react';
import { Bot, MessageSquare, X, HelpCircle } from 'lucide-react';
import ChatInterface from './ChatInterface';
import api from '../../services/api';

const TutorWidget = ({
  currentQuest = null,
  currentTask = null,
  position = 'bottom-right',
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewSuggestions, setHasNewSuggestions] = useState(false);
  const [usageStats, setUsageStats] = useState(null);
  const [contextHelp, setContextHelp] = useState([]);

  // Load usage stats and context help
  useEffect(() => {
    loadUsageStats();
    generateContextHelp();
  }, [currentQuest, currentTask]);

  const loadUsageStats = async () => {
    try {
      const response = await api.get('/tutor/usage');
      setUsageStats(response.data.usage);
    } catch (error) {
      console.error('Failed to load usage stats:', error);
    }
  };

  const generateContextHelp = () => {
    const help = [];

    if (currentTask) {
      help.push(`Need help with "${currentTask.title}"?`);
      help.push(`Ask about ${currentTask.pillar} concepts`);
    } else if (currentQuest) {
      help.push(`Questions about "${currentQuest.title}"?`);
      help.push('Ask for examples or explanations');
    } else {
      help.push('What are you curious about?');
      help.push('Ask me to explain any concept');
    }

    help.push('Need study tips?');
    setContextHelp(help);
    setHasNewSuggestions(true);
  };

  const toggleWidget = () => {
    setIsOpen(!isOpen);
    if (!isOpen) {
      setHasNewSuggestions(false);
    }
  };

  const getPositionClasses = () => {
    const positions = {
      'bottom-right': 'bottom-6 right-6',
      'bottom-left': 'bottom-6 left-6',
      'top-right': 'top-6 right-6',
      'top-left': 'top-6 left-6'
    };
    return positions[position] || positions['bottom-right'];
  };

  // Don't show widget if user has no messages left
  if (usageStats && usageStats.messages_remaining <= 0) {
    return (
      <div className={`fixed ${getPositionClasses()} z-40 ${className}`}>
        <div className="bg-white rounded-lg shadow-lg p-3 max-w-xs mb-4">
          <div className="flex items-center space-x-2">
            <Bot className="w-5 h-5 text-[#6d469b]" />
            <div className="flex-1">
              <p className="text-sm text-gray-600">Daily chat limit reached!</p>
              <button
                onClick={() => window.open('/subscription', '_blank')}
                className="text-xs text-[#6d469b] hover:underline"
              >
                Upgrade for unlimited chats
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`fixed ${getPositionClasses()} z-40 ${className}`}>
      {/* Context Help Popup */}
      {!isOpen && hasNewSuggestions && contextHelp.length > 0 && (
        <div className="bg-white rounded-lg shadow-lg p-3 max-w-xs mb-4 animate-bounce-in">
          <div className="flex items-start space-x-2">
            <HelpCircle className="w-4 h-4 text-[#6d469b] flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-gray-600 mb-2">I can help you with:</p>
              <ul className="space-y-1">
                {contextHelp.slice(0, 2).map((help, index) => (
                  <li key={index} className="text-xs text-gray-500">• {help}</li>
                ))}
              </ul>
            </div>
            <button
              onClick={() => setHasNewSuggestions(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Chat Interface (when open) */}
      {isOpen && (
        <div className="w-96 h-[600px] mb-4 animate-slide-up">
          <ChatInterface
            currentQuest={currentQuest}
            currentTask={currentTask}
            onClose={() => setIsOpen(false)}
            className="h-full"
          />
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={toggleWidget}
        className={`w-14 h-14 rounded-full shadow-lg transition-all duration-300 ${
          isOpen
            ? 'bg-gray-500 hover:bg-gray-600'
            : 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] hover:shadow-xl hover:scale-105'
        } flex items-center justify-center relative`}
        title={isOpen ? 'Close tutor' : 'Chat with OptioBot'}
      >
        {isOpen ? (
          <X className="w-6 h-6 text-white" />
        ) : (
          <>
            <Bot className="w-6 h-6 text-white" />
            {hasNewSuggestions && (
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-yellow-400 rounded-full animate-pulse"></div>
            )}
          </>
        )}
      </button>

      {/* Message Counter */}
      {!isOpen && usageStats && (
        <div className="absolute -top-2 -left-2 bg-white text-xs text-gray-600 px-2 py-1 rounded-full shadow border">
          {usageStats.messages_remaining} left
        </div>
      )}
    </div>
  );
};

// Separate component for quest page integration
export const QuestTutorHelper = ({ quest, currentTask }) => {
  const [showInlineHelp, setShowInlineHelp] = useState(false);
  const [quickHelp, setQuickHelp] = useState([]);

  useEffect(() => {
    generateQuickHelp();
  }, [quest, currentTask]);

  const generateQuickHelp = () => {
    const help = [];

    if (currentTask) {
      const pillar = currentTask.pillar;

      if (pillar === 'STEM & Logic') {
        help.push('Need help with math or science concepts?');
        help.push('Ask me to break down complex problems');
        help.push('Want to see step-by-step examples?');
      } else if (pillar === 'Language & Communication') {
        help.push('Need writing tips or grammar help?');
        help.push('Want feedback on your ideas?');
        help.push('Looking for creative inspiration?');
      } else if (pillar === 'Arts & Creativity') {
        help.push('Need creative brainstorming help?');
        help.push('Want artistic techniques or ideas?');
        help.push('Looking for inspiration?');
      } else if (pillar === 'Society & Culture') {
        help.push('Need historical context?');
        help.push('Want cultural perspectives?');
        help.push('Looking for research ideas?');
      } else if (pillar === 'Life & Wellness') {
        help.push('Need health or wellness tips?');
        help.push('Want mindfulness techniques?');
        help.push('Looking for goal-setting help?');
      }
    }

    setQuickHelp(help);
  };

  if (!showInlineHelp) {
    return (
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-lg p-4 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-full flex items-center justify-center">
              <Bot className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-800">Need help with this task?</p>
              <p className="text-xs text-gray-600">Chat with OptioBot for explanations and guidance</p>
            </div>
          </div>
          <button
            onClick={() => setShowInlineHelp(true)}
            className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-4 py-2 rounded-full text-sm hover:shadow-lg transition-shadow"
          >
            Get Help
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          <Bot className="w-5 h-5 text-[#6d469b]" />
          <span className="font-medium text-gray-800">Quick Help</span>
        </div>
        <button
          onClick={() => setShowInlineHelp(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="space-y-2 mb-4">
        {quickHelp.map((help, index) => (
          <div key={index} className="flex items-center space-x-2 text-sm text-gray-600">
            <div className="w-1.5 h-1.5 bg-[#6d469b] rounded-full"></div>
            <span>{help}</span>
          </div>
        ))}
      </div>

      <div className="h-64">
        <ChatInterface
          currentQuest={quest}
          currentTask={currentTask}
          className="h-full border rounded-lg"
        />
      </div>
    </div>
  );
};

export default TutorWidget;