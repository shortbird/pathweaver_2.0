import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { checkinAPI } from '../../services/api';

const AdvisorCheckinHistoryInline = ({ studentId, studentName }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [checkins, setCheckins] = useState([]);
  const [expandedCheckinId, setExpandedCheckinId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCheckinHistory();
  }, [studentId]);

  const fetchCheckinHistory = async () => {
    try {
      setLoading(true);
      const response = await checkinAPI.getStudentCheckins(studentId);
      if (response.data.success) {
        setCheckins(response.data.checkins || []);
      }
    } catch (err) {
      console.error('Error fetching check-in history:', err);
      setError('Failed to load check-in history');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-optio-purple" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
        <p className="text-red-800 text-sm font-medium">{error}</p>
        <button onClick={fetchCheckinHistory} className="mt-2 text-sm text-optio-purple hover:underline">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {checkins.length} check-in{checkins.length !== 1 ? 's' : ''}
        </p>
        <button
          onClick={() => navigate(`/advisor/checkin/${studentId}`)}
          className="px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity"
        >
          New Check-in
        </button>
      </div>

      {checkins.length === 0 ? (
        <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <p className="text-gray-500 font-medium">No check-ins yet</p>
          <p className="text-gray-400 text-sm mt-1">Check-ins will appear here after your first meeting</p>
        </div>
      ) : (
        <div className="space-y-3">
          {checkins.map(checkin => (
            <div
              key={checkin.id}
              className="border border-gray-200 rounded-lg overflow-hidden hover:border-optio-purple/30 transition-colors"
            >
              <div
                className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedCheckinId(expandedCheckinId === checkin.id ? null : checkin.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-gray-800">
                      {checkin.checkin_date_formatted || formatDate(checkin.checkin_date)}
                    </p>
                    {checkin.growth_moments && (
                      <p className="text-gray-600 text-sm mt-1 line-clamp-2">{checkin.growth_moments}</p>
                    )}
                  </div>
                  <span className="text-xs text-optio-purple font-medium ml-3">
                    {expandedCheckinId === checkin.id ? 'Hide' : 'Details'}
                  </span>
                </div>
              </div>

              {expandedCheckinId === checkin.id && (
                <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-4">
                  {checkin.active_quests_snapshot?.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-gray-800 text-sm mb-2">Active Quests</h4>
                      <div className="space-y-2">
                        {checkin.active_quests_snapshot.map((quest, idx) => {
                          const questNote = checkin.quest_notes?.find(n => n.quest_id === quest.quest_id);
                          return (
                            <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3">
                              <p className="font-medium text-gray-800 text-sm">{quest.title}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <div className="flex-1 bg-gray-200 rounded-full h-1.5 overflow-hidden">
                                  <div
                                    className="h-full bg-gradient-to-r from-optio-purple to-optio-pink"
                                    style={{ width: `${quest.completion_percent}%` }}
                                  />
                                </div>
                                <span className="text-xs text-gray-500">{quest.completion_percent}%</span>
                              </div>
                              {questNote?.notes && (
                                <p className="text-xs text-gray-600 mt-2 bg-optio-purple/5 p-2 rounded">
                                  {questNote.notes}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {checkin.growth_moments && (
                    <div>
                      <h4 className="font-semibold text-gray-800 text-sm mb-1">Growth Moments</h4>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{checkin.growth_moments}</p>
                    </div>
                  )}

                  {checkin.student_voice && (
                    <div>
                      <h4 className="font-semibold text-gray-800 text-sm mb-1">Student Voice</h4>
                      <p className="text-sm text-gray-700 italic bg-optio-purple/5 border-l-3 border-optio-purple p-3 rounded whitespace-pre-wrap">
                        "{checkin.student_voice}"
                      </p>
                    </div>
                  )}

                  {checkin.obstacles && (
                    <div>
                      <h4 className="font-semibold text-gray-800 text-sm mb-1">Challenges</h4>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{checkin.obstacles}</p>
                    </div>
                  )}

                  {checkin.solutions && (
                    <div>
                      <h4 className="font-semibold text-gray-800 text-sm mb-1">Solutions</h4>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">{checkin.solutions}</p>
                    </div>
                  )}

                  {checkin.advisor_notes && (
                    <div>
                      <h4 className="font-semibold text-red-800 text-sm mb-1">Private Notes</h4>
                      <p className="text-sm text-gray-700 bg-red-50 border-l-3 border-red-400 p-3 rounded whitespace-pre-wrap">
                        {checkin.advisor_notes}
                      </p>
                    </div>
                  )}

                  <div className="text-xs text-gray-400 pt-2 border-t border-gray-200">
                    Recorded: {formatDate(checkin.created_at)}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

AdvisorCheckinHistoryInline.propTypes = {
  studentId: PropTypes.string.isRequired,
  studentName: PropTypes.string.isRequired,
};

export default AdvisorCheckinHistoryInline;
