import React, { useState } from 'react';
import api from '../services/api';

const FixQuestCompletion = () => {
  const [isFixing, setIsFixing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFix = async () => {
    setIsFixing(true);
    setResult(null);
    setError(null);

    try {
      const response = await api.post('/api/fix/fix-completion', {}, {
        headers: {
          'Content-Type': 'application/json'
        }
      });
      setResult(response.data);
      
      // If quests were fixed, refresh the page to show updated diploma
      if (response.data.fixed_quests && response.data.fixed_quests.length > 0) {
        setTimeout(() => {
          // Use a more reliable reload method
          window.location.href = window.location.href;
        }, 2000);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fix quest completion');
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="mb-4 p-4 bg-white rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-2">Quest Completion Fix</h3>
      <p className="text-sm text-gray-600 mb-3">
        If you've completed all tasks in a quest but it's not showing on your diploma, 
        click the button below to fix it.
      </p>
      
      <button
        onClick={handleFix}
        disabled={isFixing}
        className="px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90 disabled:opacity-50"
      >
        {isFixing ? 'Fixing...' : 'Fix Quest Completion'}
      </button>

      {result && (
        <div className="mt-3 p-3 bg-green-50 border border-green-200 rounded">
          <p className="text-green-800">
            {result.message}
          </p>
          {result.fixed_quests && result.fixed_quests.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-semibold">Fixed quests:</p>
              <ul className="text-sm">
                {result.fixed_quests.map((quest, index) => (
                  <li key={index}>- {quest.quest_title}</li>
                ))}
              </ul>
              <p className="text-sm mt-2 text-green-600">Page will refresh in 2 seconds...</p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded">
          <p className="text-red-800">{error}</p>
        </div>
      )}
    </div>
  );
};

export default FixQuestCompletion;