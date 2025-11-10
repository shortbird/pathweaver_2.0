import React, { useState, useEffect, useRef } from 'react';
import ServiceHero from '../components/services/ServiceHero';
import ServiceGrid from '../components/services/ServiceGrid';
import ServiceInquiryModal from '../components/services/ServiceInquiryModal';
import { useAuth } from '../contexts/AuthContext';

const ServicesPage = () => {
  const { currentUser } = useAuth();
  const [services, setServices] = useState([]);
  const [categories, setCategories] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedService, setSelectedService] = useState(null);
  const servicesRef = useRef(null);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiUrl}/api/services`);

      if (!response.ok) {
        throw new Error('Failed to fetch services');
      }

      const data = await response.json();
      setServices(data.services || []);
      setCategories(data.categories || {});
    } catch (err) {
      console.error('Error fetching services:', err);
      setError('Failed to load services. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleInquire = (service) => {
    setSelectedService(service);
  };

  const handleCloseModal = () => {
    setSelectedService(null);
  };

  const scrollToServices = () => {
    servicesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-[#6D469B] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            Loading services...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            Oops!
          </h2>
          <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            {error}
          </p>
          <button
            onClick={fetchServices}
            className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white py-3 px-6 rounded-xl hover:opacity-90 transition-opacity font-semibold"
            style={{ fontFamily: 'Poppins', fontWeight: 600 }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero Section */}
      <ServiceHero onScrollToServices={scrollToServices} />

      {/* Services Grid Section */}
      <div ref={servicesRef} className="max-w-7xl mx-auto px-4 py-16">
        {services.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 text-lg" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
              No services available at this time. Please check back later!
            </p>
          </div>
        ) : (
          <ServiceGrid categories={categories} onInquire={handleInquire} />
        )}
      </div>

      {/* Bottom CTA Section */}
      <div className="bg-gradient-to-br from-purple-50 to-pink-50 py-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            Have Questions?
          </h2>
          <p className="text-lg text-gray-600 mb-8" style={{ fontFamily: 'Poppins', fontWeight: 500 }}>
            Not sure which service is right for you? Click "Learn More" on any service above to send us an inquiry, and we'll help you find the perfect fit for your learning journey.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="mailto:support@optioeducation.com"
              className="bg-white text-[#6D469B] py-3 px-8 rounded-xl hover:bg-gray-50 transition-colors duration-200 font-semibold border-2 border-[#6D469B]"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Email Us
            </a>
            <a
              href="/"
              className="bg-gradient-to-r from-[#6D469B] to-[#EF597B] text-white py-3 px-8 rounded-xl hover:opacity-90 transition-opacity duration-200 font-semibold"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              Start Learning Free
            </a>
          </div>
        </div>
      </div>

      {/* Inquiry Modal */}
      {selectedService && (
        <ServiceInquiryModal
          service={selectedService}
          currentUser={currentUser}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
};

export default ServicesPage;
