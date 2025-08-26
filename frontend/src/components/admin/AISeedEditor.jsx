import React, { useState, useEffect } from 'react';
import { getAuthHeaders } from '../../api/auth';

const AISeedEditor = () => {
  const [seedPrompt, setSeedPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetchSeedPrompt();
  }, []);

  const fetchSeedPrompt = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/ai/seed`, {
        headers: getAuthHeaders()
      });
      
      if (response.ok) {
        const data = await response.json();
        setSeedPrompt(data.prompt_text);
      } else {
        setMessage('Failed to fetch seed prompt');
      }
    } catch (error) {
      console.error('Error fetching seed prompt:', error);
      setMessage('Error loading seed prompt');
    } finally {
      setLoading(false);
    }
  };

  const saveSeedPrompt = async () => {
    setSaving(true);
    setMessage('');
    
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/ai/seed`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt_text: seedPrompt })
      });
      
      if (response.ok) {
        setMessage('Seed prompt updated successfully!');
        setTimeout(() => setMessage(''), 3000);
      } else {
        setMessage('Failed to save seed prompt');
      }
    } catch (error) {
      console.error('Error saving seed prompt:', error);
      setMessage('Error saving seed prompt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">AI Seed Prompt Editor</h2>
      
      <div className="mb-4">
        <p className="text-sm text-gray-600 mb-2">
          This prompt defines the behavior and personality of all AI agents in the quest generation system.
          Changes here will affect how quests are generated, graded, expanded, and validated.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
        </div>
      ) : (
        <>
          <textarea
            value={seedPrompt}
            onChange={(e) => setSeedPrompt(e.target.value)}
            className="w-full h-96 p-4 border rounded-lg font-mono text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            placeholder="Enter the AI seed prompt here..."
          />
          
          <div className="flex justify-between items-center mt-4">
            <div>
              {message && (
                <span className={`text-sm ${message.includes('success') ? 'text-green-600' : 'text-red-600'}`}>
                  {message}
                </span>
              )}
            </div>
            
            <div className="space-x-3">
              <button
                onClick={fetchSeedPrompt}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                disabled={loading || saving}
              >
                Reset
              </button>
              <button
                onClick={saveSeedPrompt}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
                disabled={saving || loading}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default AISeedEditor;