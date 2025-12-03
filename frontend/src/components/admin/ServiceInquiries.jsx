import React, { useState, useEffect } from 'react';
import { Mail, Phone, Calendar, CheckCircle, Clock, XCircle } from 'lucide-react';
import api from '../../services/api';

const ServiceInquiries = () => {
  const [inquiries, setInquiries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedInquiry, setSelectedInquiry] = useState(null);

  useEffect(() => {
    fetchInquiries();
  }, [statusFilter]);

  const fetchInquiries = async () => {
    try {
      setLoading(true);
      const params = statusFilter !== 'all' ? { status: statusFilter } : {};
      const response = await api.get('/api/admin/service-inquiries', { params });
      setInquiries(response.data.inquiries || []);
      setError('');
    } catch (err) {
      console.error('Error fetching inquiries:', err);
      setError('Failed to load inquiries');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (inquiryId, newStatus) => {
    try {
      await api.put(`/api/admin/service-inquiries/${inquiryId}`, {
        status: newStatus
      });
      await fetchInquiries();
    } catch (err) {
      console.error('Error updating inquiry status:', err);
      alert('Failed to update inquiry status');
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const badges = {
      pending: {
        icon: Clock,
        color: 'bg-yellow-100 text-yellow-800',
        label: 'Pending'
      },
      contacted: {
        icon: Mail,
        color: 'bg-blue-100 text-blue-800',
        label: 'Contacted'
      },
      completed: {
        icon: CheckCircle,
        color: 'bg-green-100 text-green-800',
        label: 'Completed'
      }
    };

    const badge = badges[status] || badges.pending;
    const Icon = badge.icon;

    return (
      <span className={`px-2 py-1 inline-flex items-center gap-1 text-xs leading-5 font-semibold rounded-full ${badge.color}`}>
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    );
  };

  const getStatusStats = () => {
    return {
      all: inquiries.length,
      pending: inquiries.filter(i => i.status === 'pending').length,
      contacted: inquiries.filter(i => i.status === 'contacted').length,
      completed: inquiries.filter(i => i.status === 'completed').length
    };
  };

  const stats = getStatusStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-optio-purple border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading inquiries...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Service Inquiries</h2>
        <p className="text-gray-600 mt-1">Manage inquiries from potential customers</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="text-sm text-gray-600">Total Inquiries</div>
          <div className="text-2xl font-bold text-gray-900">{stats.all}</div>
        </div>
        <div className="bg-yellow-50 rounded-lg shadow p-4">
          <div className="text-sm text-yellow-800">Pending</div>
          <div className="text-2xl font-bold text-yellow-900">{stats.pending}</div>
        </div>
        <div className="bg-blue-50 rounded-lg shadow p-4">
          <div className="text-sm text-blue-800">Contacted</div>
          <div className="text-2xl font-bold text-blue-900">{stats.contacted}</div>
        </div>
        <div className="bg-green-50 rounded-lg shadow p-4">
          <div className="text-sm text-green-800">Completed</div>
          <div className="text-2xl font-bold text-green-900">{stats.completed}</div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b">
        {['all', 'pending', 'contacted', 'completed'].map((status) => (
          <button
            key={status}
            onClick={() => setStatusFilter(status)}
            className={`pb-2 px-4 capitalize ${
              statusFilter === status
                ? 'border-b-2 border-optio-purple font-bold text-gray-900'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            {status} ({stats[status]})
          </button>
        ))}
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Inquiries List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {inquiries.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-500">
            No inquiries found for this filter.
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {inquiries.map((inquiry) => (
              <div key={inquiry.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">{inquiry.service?.name || 'Unknown Service'}</h3>
                      {getStatusBadge(inquiry.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        {formatDate(inquiry.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {inquiry.status !== 'completed' && (
                    <div className="flex gap-2">
                      {inquiry.status === 'pending' && (
                        <button
                          onClick={() => handleUpdateStatus(inquiry.id, 'contacted')}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
                        >
                          Mark Contacted
                        </button>
                      )}
                      {inquiry.status === 'contacted' && (
                        <button
                          onClick={() => handleUpdateStatus(inquiry.id, 'completed')}
                          className="bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700 transition-colors"
                        >
                          Mark Completed
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Contact Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-gray-400" />
                    <span className="text-gray-700">{inquiry.name}</span>
                    <a href={`mailto:${inquiry.email}`} className="text-optio-purple hover:underline">
                      {inquiry.email}
                    </a>
                  </div>
                  {inquiry.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <a href={`tel:${inquiry.phone}`} className="text-gray-700 hover:underline">
                        {inquiry.phone}
                      </a>
                    </div>
                  )}
                </div>

                {/* Message */}
                <div className="bg-gray-50 rounded-lg p-3">
                  <div className="text-sm font-medium text-gray-700 mb-1">Message:</div>
                  <p className="text-sm text-gray-600">{inquiry.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default ServiceInquiries;
