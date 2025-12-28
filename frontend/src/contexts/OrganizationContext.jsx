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
      // Organization data is now included in /api/auth/me response
      if (data.organization) {
        setOrganization(data.organization);
      } else if (data.organization_id) {
        // Fallback: set minimal organization data
        setOrganization({ id: data.organization_id });
      }
    } catch (error) {
      // 401 is expected for unauthenticated users - don't log as error
      if (error.response?.status !== 401) {
        console.error('Failed to fetch organization:', error);
      }
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
