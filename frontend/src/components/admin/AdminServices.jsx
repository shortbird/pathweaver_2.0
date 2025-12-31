import React, { useState, useEffect } from 'react';
import { PlusIcon, PencilSquareIcon, TrashIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import api from '../../services/api';
import ServiceFormModal from './ServiceFormModal';

const AdminServices = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedService, setSelectedService] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [viewMode, setViewMode] = useState('table'); // 'table' or 'card'

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/admin/services');
      setServices(response.data.services || []);
      setError('');
    } catch (err) {
      console.error('Error fetching services:', err);
      setError('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedService(null);
    setIsCreating(true);
    setShowForm(true);
  };

  const handleEdit = (service) => {
    setSelectedService(service);
    setIsCreating(false);
    setShowForm(true);
  };

  const handleDelete = async (serviceId) => {
    if (!confirm('Are you sure you want to delete this service? This will set it as inactive.')) {
      return;
    }

    try {
      await api.delete(`/api/admin/services/${serviceId}`, {});
      await fetchServices();
    } catch (err) {
      console.error('Error deleting service:', err);
      alert('Failed to delete service');
    }
  };

  const handleToggleActive = async (service) => {
    try {
      await api.put(`/api/admin/services/${service.id}`, {
        is_active: !service.is_active
      });
      await fetchServices();
    } catch (err) {
      console.error('Error toggling service status:', err);
      alert('Failed to update service status');
    }
  };

  const handleFormClose = async (shouldRefresh) => {
    setShowForm(false);
    setSelectedService(null);
    setIsCreating(false);
    if (shouldRefresh) {
      await fetchServices();
    }
  };


  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-optio-purple border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading services...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Services Management</h2>
          <p className="text-gray-600 mt-1">Manage all optional services offered by Optio</p>
        </div>
        <button
          onClick={handleCreate}
          className="bg-gradient-to-r from-optio-purple to-optio-pink text-white px-4 py-2 rounded-lg hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          <PlusIcon className="w-5 h-5" />
          Add Service
        </button>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Services - Mobile Card View */}
      <div className="md:hidden space-y-4">
        {services.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No services found. Click "Add Service" to create one.
          </div>
        ) : (
          services.map((service) => (
            <div
              key={service.id}
              className={`bg-white rounded-lg shadow p-4 ${!service.is_active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-gray-900">{service.name}</h3>
                  <p className="text-sm text-gray-600 mt-1">{service.category}</p>
                </div>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                  service.is_active
                    ? 'bg-green-100 text-green-800'
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {service.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-4 text-sm">
                <div>
                  <span className="text-gray-500">Price:</span>
                  <span className="ml-2 font-medium">{service.price_display || `$${service.price}`}</span>
                </div>
                <div>
                  <span className="text-gray-500">Sort:</span>
                  <span className="ml-2 font-medium">{service.sort_order}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleToggleActive(service)}
                  className="flex-1 min-h-[44px] px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {service.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => handleEdit(service)}
                  className="flex-1 min-h-[44px] px-4 py-2 bg-optio-purple text-white rounded-lg text-sm font-medium hover:opacity-90"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(service.id)}
                  className="min-h-[44px] min-w-[44px] px-3 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                >
                  <TrashIcon className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Services - Desktop Table View */}
      <div className="hidden md:block bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Price
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Sort Order
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {services.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                    No services found. Click "Add Service" to create one.
                  </td>
                </tr>
              ) : (
                services.map((service) => (
                  <tr key={service.id} className={!service.is_active ? 'bg-gray-50 opacity-60' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{service.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{service.category}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{service.price_display || `$${service.price}`}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-600">{service.sort_order}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        service.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {service.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleToggleActive(service)}
                          className="min-h-[44px] text-gray-600 hover:text-gray-900"
                          title={service.is_active ? 'Deactivate' : 'Activate'}
                        >
                          {service.is_active ? <EyeIcon className="w-4 h-4" /> : <EyeSlashIcon className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleEdit(service)}
                          className="min-h-[44px] text-optio-purple hover:text-purple-900"
                          title="Edit"
                        >
                          <PencilSquareIcon className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(service.id)}
                          className="min-h-[44px] text-red-600 hover:text-red-900"
                          title="Delete"
                        >
                          <TrashIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Service count */}
      <div className="text-sm text-gray-600">
        Total services: {services.length} ({services.filter(s => s.is_active).length} active)
      </div>

      {/* Form Modal */}
      {showForm && (
        <ServiceFormModal
          service={selectedService}
          isCreating={isCreating}
          onClose={handleFormClose}
        />
      )}
    </div>
  );
};

export default AdminServices;
