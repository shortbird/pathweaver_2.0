import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import {
  UserGroupIcon,
  CheckCircleIcon,
  XMarkIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const ParentInvitationSection = () => {
  const { user } = useAuth();
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [linkedParents, setLinkedParents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadParentData();
  }, []);

  const loadParentData = async () => {
    setLoading(true);
    try {
      // Get pending parent requests
      const approvalsResponse = await api.get('/api/parents/pending-approvals');
      setPendingApprovals(approvalsResponse.data.pending_approvals || []);

      // Get active parent links
      const childrenResponse = await api.get('/api/parents/my-children');
      // Filter to show parents who are linked to THIS student
      setLinkedParents(childrenResponse.data.children || []);
    } catch (error) {
      console.error('Error loading parent data:', error);
    } finally {
      setLoading(false);
    }
  };

  const approveParent = async (linkId) => {
    try {
      await api.post(`/api/parents/approve-link/${linkId}`, {});
      toast.success('Parent access approved! They can now view your progress.');
      loadParentData();
    } catch (error) {
      console.error('Error approving parent:', error);
      const message = error.response?.data?.error || 'Failed to approve parent';
      toast.error(message);
    }
  };

  const declineParent = async (linkId) => {
    try {
      await api.delete(`/api/parents/decline-link/${linkId}`);
      toast.success('Parent request declined');
      loadParentData();
    } catch (error) {
      console.error('Error declining parent:', error);
      toast.error('Failed to decline parent request');
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  // Don't show section if no pending requests and no linked parents
  if (pendingApprovals.length === 0 && linkedParents.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="flex items-center gap-2 mb-6">
        <UserGroupIcon className="w-7 h-7 text-optio-purple" />
        <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
          Parent Access
        </h2>
      </div>

      {/* Important Info Banner */}
      {pendingApprovals.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <ExclamationTriangleIcon className="w-6 h-6 text-yellow-600 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-yellow-900 mb-1" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
                Important to know
              </h3>
              <p className="text-sm text-yellow-800 font-medium" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                Once approved, parent access is permanent and cannot be revoked. Parents can view your progress, quests, and AI tutor conversations.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pending Requests */}
      {pendingApprovals.length > 0 && (
        <div className="mb-6">
          <h3 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            Pending Requests ({pendingApprovals.length})
          </h3>
          <div className="space-y-3">
            {pendingApprovals.map((request) => (
              <div key={request.link_id} className="flex items-center justify-between p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <UserGroupIcon className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
                      {request.parent_first_name} {request.parent_last_name}
                    </p>
                    <p className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                      {request.parent_email} • Requested {new Date(request.requested_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => approveParent(request.link_id)}
                    className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    title="Approve parent access"
                  >
                    <CheckCircleIcon className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => declineParent(request.link_id)}
                    className="p-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                    title="Decline request"
                  >
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Linked Parents */}
      {linkedParents.length > 0 && (
        <div>
          <h3 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            Connected Parents
          </h3>
          <div className="space-y-3">
            {linkedParents.map((parent) => (
              <div key={parent.link_id} className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <CheckCircleIcon className="w-5 h-5 text-green-600" />
                  <div>
                    <p className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
                      {parent.first_name || parent.parent_name}
                    </p>
                    <p className="text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
                      Connected since {new Date(parent.approved_at || parent.linked_since).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold" style={{ fontFamily: 'Poppins', fontWeight: 600 }}>
                  Active
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentInvitationSection;
