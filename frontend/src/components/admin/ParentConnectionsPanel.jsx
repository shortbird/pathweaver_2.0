import { useState, useEffect } from 'react';
import { adminParentConnectionsAPI } from '../../services/api';
import toast from 'react-hot-toast';
import { CheckCircle, XCircle, Users, UserPlus, Trash2, Search } from 'lucide-react';

const ParentConnectionsPanel = () => {
  const [activeTab, setActiveTab] = useState('requests'); // 'requests', 'links', or 'parents'
  const [requests, setRequests] = useState([]);
  const [links, setLinks] = useState([]);
  const [parents, setParents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [selectedLink, setSelectedLink] = useState(null);
  const [selectedParent, setSelectedParent] = useState(null);
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [students, setStudents] = useState([]);

  useEffect(() => {
    if (activeTab === 'requests') {
      loadRequests();
    } else {
      loadLinks();
    }
  }, [activeTab, statusFilter]);

  const loadRequests = async () => {
    setLoading(true);
    try {
      const response = await adminParentConnectionsAPI.getConnectionRequests({ status: statusFilter });
      setRequests(response.data.requests || []);
    } catch (error) {
      toast.error('Failed to load connection requests');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const loadLinks = async () => {
    setLoading(true);
    try {
      const response = await adminParentConnectionsAPI.getActiveLinks({ admin_verified: true });
      setLinks(response.data.links || []);
    } catch (error) {
      toast.error('Failed to load active connections');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;

    try {
      await adminParentConnectionsAPI.approveConnectionRequest(selectedRequest.id, adminNotes);
      toast.success('Connection request approved');
      setShowApproveModal(false);
      setAdminNotes('');
      setSelectedRequest(null);
      loadRequests();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to approve request');
    }
  };

  const handleReject = async () => {
    if (!selectedRequest || !adminNotes.trim()) {
      toast.error('Rejection reason is required');
      return;
    }

    try {
      await adminParentConnectionsAPI.rejectConnectionRequest(selectedRequest.id, adminNotes);
      toast.success('Connection request rejected');
      setShowRejectModal(false);
      setAdminNotes('');
      setSelectedRequest(null);
      loadRequests();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to reject request');
    }
  };

  const handleDisconnect = async () => {
    if (!selectedLink) return;

    try {
      await adminParentConnectionsAPI.disconnectLink(selectedLink.id);
      toast.success('Connection disconnected');
      setShowDisconnectModal(false);
      setSelectedLink(null);
      loadLinks();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to disconnect');
    }
  };

  const filteredRequests = requests.filter(req => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      req.parent_user?.first_name?.toLowerCase().includes(search) ||
      req.parent_user?.last_name?.toLowerCase().includes(search) ||
      req.parent_user?.email?.toLowerCase().includes(search) ||
      req.child_first_name?.toLowerCase().includes(search) ||
      req.child_last_name?.toLowerCase().includes(search) ||
      req.child_email?.toLowerCase().includes(search)
    );
  });

  const filteredLinks = links.filter(link => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      link.parent?.first_name?.toLowerCase().includes(search) ||
      link.parent?.last_name?.toLowerCase().includes(search) ||
      link.parent?.email?.toLowerCase().includes(search) ||
      link.student?.first_name?.toLowerCase().includes(search) ||
      link.student?.last_name?.toLowerCase().includes(search) ||
      link.student?.email?.toLowerCase().includes(search)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Parent Connections
          </h2>
          <p className="text-gray-600 mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Manage parent-student connection requests and active links
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('requests')}
            className={`py-4 px-1 border-b-2 font-semibold text-sm transition-colors ${
              activeTab === 'requests'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <Users className="w-5 h-5 inline mr-2" />
            Connection Requests
          </button>
          <button
            onClick={() => setActiveTab('links')}
            className={`py-4 px-1 border-b-2 font-semibold text-sm transition-colors ${
              activeTab === 'links'
                ? 'border-purple-600 text-purple-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <UserPlus className="w-5 h-5 inline mr-2" />
            Active Connections
          </button>
        </nav>
      </div>

      {/* Filters and Search */}
      <div className="flex gap-4 items-center">
        {activeTab === 'requests' && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg font-medium focus:ring-2 focus:ring-purple-600 focus:border-transparent"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        )}
        <div className="flex-1 relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name or email..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          />
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : activeTab === 'requests' ? (
        <RequestsTable
          requests={filteredRequests}
          onApprove={(req) => {
            setSelectedRequest(req);
            setShowApproveModal(true);
          }}
          onReject={(req) => {
            setSelectedRequest(req);
            setShowRejectModal(true);
          }}
        />
      ) : (
        <LinksTable
          links={filteredLinks}
          onDisconnect={(link) => {
            setSelectedLink(link);
            setShowDisconnectModal(true);
          }}
        />
      )}

      {/* Approve Modal */}
      {showApproveModal && (
        <Modal
          title="Approve Connection Request"
          onClose={() => {
            setShowApproveModal(false);
            setAdminNotes('');
            setSelectedRequest(null);
          }}
          onConfirm={handleApprove}
          confirmText="Approve"
          confirmClass="bg-green-600 hover:bg-green-700"
        >
          <div className="space-y-4">
            <p className="text-gray-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Approve connection between <strong>{selectedRequest?.parent_user?.first_name} {selectedRequest?.parent_user?.last_name}</strong> and{' '}
              <strong>{selectedRequest?.child_first_name} {selectedRequest?.child_last_name}</strong>?
            </p>
            {selectedRequest?.matched_student_id ? (
              <p className="text-sm text-green-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Student account matched: {selectedRequest?.matched_student?.email}
              </p>
            ) : (
              <p className="text-sm text-yellow-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
                No student account matched yet
              </p>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Admin Notes (Optional)
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                style={{ fontFamily: 'Poppins, sans-serif' }}
                placeholder="Add any notes about this approval..."
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Modal */}
      {showRejectModal && (
        <Modal
          title="Reject Connection Request"
          onClose={() => {
            setShowRejectModal(false);
            setAdminNotes('');
            setSelectedRequest(null);
          }}
          onConfirm={handleReject}
          confirmText="Reject"
          confirmClass="bg-red-600 hover:bg-red-700"
        >
          <div className="space-y-4">
            <p className="text-gray-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Reject connection between <strong>{selectedRequest?.parent_user?.first_name} {selectedRequest?.parent_user?.last_name}</strong> and{' '}
              <strong>{selectedRequest?.child_first_name} {selectedRequest?.child_last_name}</strong>?
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Rejection Reason (Required) *
              </label>
              <textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                rows={3}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                style={{ fontFamily: 'Poppins, sans-serif' }}
                placeholder="Explain why this request is being rejected..."
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Disconnect Modal */}
      {showDisconnectModal && (
        <Modal
          title="Disconnect Parent-Student Link"
          onClose={() => {
            setShowDisconnectModal(false);
            setSelectedLink(null);
          }}
          onConfirm={handleDisconnect}
          confirmText="Disconnect"
          confirmClass="bg-red-600 hover:bg-red-700"
        >
          <p className="text-gray-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Are you sure you want to disconnect <strong>{selectedLink?.parent?.first_name} {selectedLink?.parent?.last_name}</strong> from{' '}
            <strong>{selectedLink?.student?.first_name} {selectedLink?.student?.last_name}</strong>?
          </p>
          <p className="text-sm text-red-600 mt-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
            This action cannot be undone. The parent will lose access to this student's data.
          </p>
        </Modal>
      )}
    </div>
  );
};

// Requests Table Component
const RequestsTable = ({ requests, onApprove, onReject }) => {
  if (requests.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
          No connection requests found
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Parent
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Child
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Status
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Submitted
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {requests.map((request) => (
            <tr key={request.id} className="hover:bg-gray-50">
              <td className="px-6 py-4">
                <div>
                  <div className="text-sm font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {request.parent_user?.first_name} {request.parent_user?.last_name}
                  </div>
                  <div className="text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {request.parent_user?.email}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div>
                  <div className="text-sm font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {request.child_first_name} {request.child_last_name}
                  </div>
                  <div className="text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {request.child_email}
                  </div>
                  {request.matched_student_id && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 mt-1">
                      Matched
                    </span>
                  )}
                </div>
              </td>
              <td className="px-6 py-4">
                <StatusBadge status={request.status} />
              </td>
              <td className="px-6 py-4 text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {new Date(request.created_at).toLocaleDateString()}
              </td>
              <td className="px-6 py-4 text-right space-x-2">
                {request.status === 'pending' && (
                  <>
                    <button
                      onClick={() => onApprove(request)}
                      disabled={!request.matched_student_id}
                      className="inline-flex items-center px-3 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{ fontFamily: 'Poppins, sans-serif' }}
                      title={!request.matched_student_id ? 'No student matched yet' : 'Approve request'}
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Approve
                    </button>
                    <button
                      onClick={() => onReject(request)}
                      className="inline-flex items-center px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                      style={{ fontFamily: 'Poppins, sans-serif' }}
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Reject
                    </button>
                  </>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Links Table Component
const LinksTable = ({ links, onDisconnect }) => {
  if (links.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg">
        <UserPlus className="w-12 h-12 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600" style={{ fontFamily: 'Poppins, sans-serif' }}>
          No active connections found
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-md rounded-lg overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Parent
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Student
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Connected Since
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Verified By
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {links.map((link) => (
            <tr key={link.id} className="hover:bg-gray-50">
              <td className="px-6 py-4">
                <div>
                  <div className="text-sm font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {link.parent?.first_name} {link.parent?.last_name}
                  </div>
                  <div className="text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {link.parent?.email}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4">
                <div>
                  <div className="text-sm font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {link.student?.first_name} {link.student?.last_name}
                  </div>
                  <div className="text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                    {link.student?.email}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {new Date(link.created_at).toLocaleDateString()}
              </td>
              <td className="px-6 py-4 text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {link.verified_by ? `${link.verified_by.first_name} ${link.verified_by.last_name}` : 'System'}
              </td>
              <td className="px-6 py-4 text-right">
                <button
                  onClick={() => onDisconnect(link)}
                  className="inline-flex items-center px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  style={{ fontFamily: 'Poppins, sans-serif' }}
                >
                  <Trash2 className="w-4 h-4 mr-1" />
                  Disconnect
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// Status Badge Component
const StatusBadge = ({ status }) => {
  const colors = {
    pending: 'bg-yellow-100 text-yellow-800',
    approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-800',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors[status]}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

// Modal Component
const Modal = ({ title, children, onClose, onConfirm, confirmText, confirmClass }) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {title}
          </h3>
        </div>
        <div className="px-6 py-4">{children}</div>
        <div className="px-6 py-4 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors font-medium"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-white rounded-lg transition-colors font-semibold ${confirmClass}`}
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ParentConnectionsPanel;
