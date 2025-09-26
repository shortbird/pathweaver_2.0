import React, { useState, useEffect } from 'react';
import { handleApiResponse } from '../../utils/errorHandling';

const LearningLogSection = ({ userQuestId, isOwner = true }) => {
  const [logs, setLogs] = useState([]);
  const [newEntry, setNewEntry] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (userQuestId) {
      fetchLogs();
    }
  }, [userQuestId]);

  const fetchLogs = async () => {
    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/v3/logs/${userQuestId}`, {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch learning logs');
      }

      const data = await response.json();
      setLogs(data.logs || []);
    } catch (error) {
      console.error('Error fetching logs:', error);
      setError('Failed to load learning logs');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmitLog = async () => {
    if (!newEntry.trim() || newEntry.length < 10) {
      setError('Log entry must be at least 10 characters');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/v3/logs/${userQuestId}/entry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          log_entry: newEntry
        })
      });

      const data = await response.json();

      handleApiResponse(response, data, 'Failed to add log entry');

      // Add new entry to the list
      setLogs([data.entry, ...logs]);
      setNewEntry('');

      // Show bonus message if applicable
      if (data.message?.includes('bonus')) {
        alert(data.message);
      }

    } catch (error) {
      console.error('Error submitting log:', error);
      setError(error.message || 'Failed to add log entry');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteLog = async (logId) => {
    if (!confirm('Are you sure you want to delete this log entry?')) {
      return;
    }

    try {
      const apiBase = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiBase}/api/v3/logs/${logId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to delete log entry');
      }

      // Remove the deleted log from the state
      setLogs(logs.filter(log => log.id !== logId));
    } catch (error) {
      console.error('Error deleting log:', error);
      alert('Failed to delete log entry');
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleDateString();
  };

  const displayedLogs = showAll ? logs : logs.slice(0, 3);

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-800">
          Learning Log
        </h3>
        <span className="text-sm text-gray-500">
          {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
        </span>
      </div>

      {/* Add New Entry (only for owners) */}
      {isOwner && (
        <div className="mb-6">
          <div className="flex gap-2">
            <textarea
              value={newEntry}
              onChange={(e) => setNewEntry(e.target.value)}
              placeholder="What did you learn today? What challenges did you face?"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={3}
              maxLength={2000}
              disabled={isSubmitting}
            />
            <button
              onClick={handleSubmitLog}
              disabled={isSubmitting || !newEntry.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed self-start"
            >
              {isSubmitting ? (
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              ) : (
                'Add'
              )}
            </button>
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-500">
            <span>{newEntry.length} / 2000 characters</span>
            {logs.length === 4 && (
              <span className="text-green-600">One more entry for bonus XP! 🎉</span>
            )}
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Log Entries */}
      {isLoading ? (
        <div className="flex justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg">
          <svg className="mx-auto h-12 w-12 text-gray-400 mb-3" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 0h8v12H6V4z" clipRule="evenodd" />
          </svg>
          <p className="text-gray-600 mb-2">No log entries yet</p>
          {isOwner && (
            <p className="text-sm text-gray-500">
              Document your learning journey as you complete tasks!
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {displayedLogs.map((log) => (
              <div key={log.id} className="border-l-4 border-blue-400 pl-4 py-2">
                <div className="flex items-start justify-between mb-1">
                  <span className="text-xs text-gray-500">
                    {formatDate(log.created_at)}
                  </span>
                  {isOwner && (
                    <button 
                      onClick={() => handleDeleteLog(log.id)}
                      className="text-xs text-gray-400 hover:text-red-600 transition-colors"
                      title="Delete log entry"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  )}
                </div>
                <p className="text-gray-700 text-sm whitespace-pre-wrap">
                  {log.entry_text}
                </p>
                {log.media_url && (
                  <div className="mt-2">
                    <img 
                      src={log.media_url} 
                      alt="Log attachment" 
                      className="max-h-32 rounded-lg cursor-pointer hover:opacity-90"
                      onClick={() => window.open(log.media_url, '_blank')}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Show More/Less Button */}
          {logs.length > 3 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {showAll ? '← Show Less' : `Show ${logs.length - 3} More →`}
            </button>
          )}
        </>
      )}

      {/* Bonus Info */}
      {isOwner && logs.length < 5 && logs.length > 0 && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            💡 Add {5 - logs.length} more {logs.length === 4 ? 'entry' : 'entries'} to earn a learning log bonus!
          </p>
        </div>
      )}
    </div>
  );
};

export default LearningLogSection;