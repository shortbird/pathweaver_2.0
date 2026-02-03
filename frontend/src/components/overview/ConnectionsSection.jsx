import React, { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import api from '../../services/api';

// Observer card with special styling
const ObserverCard = ({ observer }) => {
  const user = observer.user || observer;
  const initials = `${user.first_name?.charAt(0) || ''}${user.last_name?.charAt(0) || ''}`.toUpperCase();

  return (
    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
      <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate text-sm">
          {user.first_name} {user.last_name}
        </p>
        <p className="text-xs text-blue-600">Observer</p>
      </div>
    </div>
  );
};

// Parent access card
const ParentCard = ({ parent }) => {
  const initials = `${parent.first_name?.charAt(0) || ''}${parent.last_name?.charAt(0) || ''}`.toUpperCase();

  return (
    <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg border border-green-100">
      <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
        {initials || <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-900 truncate text-sm">
          {parent.first_name} {parent.last_name}
        </p>
        <p className="text-xs text-green-600">Parent/Guardian</p>
      </div>
    </div>
  );
};

const ConnectionsSection = ({
  observers = [],
  parentAccess = null,
  userId,
  userRole
}) => {
  const [linkedParent, setLinkedParent] = useState(null);
  const [loading, setLoading] = useState(true);

  // Fetch additional connection data
  useEffect(() => {
    const fetchConnectionData = async () => {
      try {
        // Fetch linked parent for students
        if (userRole === 'student') {
          const parentResponse = await api.get('/api/parent/linked').catch(() => ({ data: null }));
          setLinkedParent(parentResponse.data?.parent || null);
        }
      } catch (error) {
        console.error('Error fetching connection data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConnectionData();
  }, [userId, userRole]);

  const totalConnections = observers.length + (linkedParent ? 1 : 0);

  return (
    <section className="bg-white rounded-2xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
              Connections
            </h2>
            {totalConnections > 0 && (
              <span className="px-2 py-0.5 bg-gray-100 rounded-full text-sm text-gray-600">
                {totalConnections}
              </span>
            )}
          </div>
          <Link
            to="/connections"
            className="text-sm text-optio-purple hover:text-purple-700 font-medium"
          >
            Manage
          </Link>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
          </div>
        ) : totalConnections === 0 ? (
          <div className="text-center py-8">
            <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <p className="text-gray-500 mb-3">No connections yet</p>
            <Link
              to="/connections"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium text-sm hover:shadow-md transition-shadow"
            >
              Manage Connections
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Parent Access */}
            {linkedParent && (
              <div>
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">
                  Parent Access
                </h3>
                <ParentCard parent={linkedParent} />
              </div>
            )}

            {/* Observers */}
            {observers.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">
                  Observers
                </h3>
                <div className="space-y-2">
                  {observers.slice(0, 3).map((observer, idx) => (
                    <ObserverCard key={observer.id || idx} observer={observer} />
                  ))}
                </div>
                {observers.length > 3 && (
                  <Link to="/connections" className="text-sm text-optio-purple hover:underline mt-2 inline-block">
                    +{observers.length - 3} more observers
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

ConnectionsSection.propTypes = {
  observers: PropTypes.array,
  parentAccess: PropTypes.object,
  userId: PropTypes.string,
  userRole: PropTypes.string
};

export default ConnectionsSection;
