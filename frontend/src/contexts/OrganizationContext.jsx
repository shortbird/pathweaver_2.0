import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const OrganizationContext = createContext(null);

export const useOrganization = () => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within OrganizationProvider');
  }
  return context;
};

export const OrganizationProvider = ({ children }) => {
  const [organization, setOrganization] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOrganization();
  }, []);

  const fetchOrganization = async () => {
    try {
      const { data } = await api.get('/api/auth/me');
      if (data.organization_id) {
        const orgResponse = await api.get(`/api/admin/organizations/organizations/${data.organization_id}`);
        setOrganization(orgResponse.data);
      }
    } catch (error) {
      console.error('Failed to fetch organization:', error);
    } finally {
      setLoading(false);
    }
  };

  const value = {
    organization,
    loading,
    refreshOrganization: fetchOrganization
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};
