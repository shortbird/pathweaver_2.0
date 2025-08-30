import { useState, useEffect, useCallback } from 'react';
import { trackDemoEvent, DEMO_EVENTS } from '../utils/demoAnalytics';

// A/B Test Variants Configuration
const VARIANTS = {
  A: {
    id: 'A',
    name: 'Adventure Focus',
    heroTitle: 'See How Learning Becomes an Adventure',
    ctaText: 'Start Your Journey',
    showTestimonials: true,
    questOrder: 'difficulty', // easy to hard
    emphasisOn: 'journey',
    colorScheme: 'purple',
    features: {
      showProgressGamification: true,
      showSocialProof: true,
      showDetailedStats: false
    }
  },
  B: {
    id: 'B',
    name: 'Portfolio Focus',
    heroTitle: 'Build a Portfolio That Tells Your Story',
    ctaText: 'Explore the Demo',
    showTestimonials: false,
    questOrder: 'popularity', // by XP reward
    emphasisOn: 'achievement',
    colorScheme: 'indigo',
    features: {
      showProgressGamification: false,
      showSocialProof: false,
      showDetailedStats: true
    }
  }
};

// Storage key for persisting variant assignment
const STORAGE_KEY = 'optio_demo_ab_variant';
const CONVERSION_KEY = 'optio_demo_ab_conversions';

const useDemoABTest = () => {
  const [variant, setVariant] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Get or assign variant
  useEffect(() => {
    const assignVariant = () => {
      try {
        // Check if variant already assigned
        const storedVariant = localStorage.getItem(STORAGE_KEY);
        
        if (storedVariant && VARIANTS[storedVariant]) {
          // Use existing variant
          setVariant(VARIANTS[storedVariant]);
          trackDemoEvent(DEMO_EVENTS.AB_TEST_VARIANT_ASSIGNED, {
            variant: storedVariant,
            returning_user: true
          });
        } else {
          // Assign new variant randomly
          const variantKey = Math.random() < 0.5 ? 'A' : 'B';
          const selectedVariant = VARIANTS[variantKey];
          
          // Store assignment
          localStorage.setItem(STORAGE_KEY, variantKey);
          setVariant(selectedVariant);
          
          // Track assignment
          trackDemoEvent(DEMO_EVENTS.AB_TEST_VARIANT_ASSIGNED, {
            variant: variantKey,
            returning_user: false,
            assignment_time: new Date().toISOString()
          });
        }
      } catch (error) {
        // Default to variant A if localStorage fails
        console.warn('Failed to assign A/B test variant:', error);
        setVariant(VARIANTS.A);
      } finally {
        setIsLoading(false);
      }
    };

    assignVariant();
  }, []);

  // Track conversion
  const trackConversion = useCallback((conversionType, additionalData = {}) => {
    if (!variant) return;

    try {
      // Get existing conversions
      const existing = localStorage.getItem(CONVERSION_KEY);
      const conversions = existing ? JSON.parse(existing) : [];
      
      // Add new conversion
      const conversion = {
        variant: variant.id,
        type: conversionType,
        timestamp: new Date().toISOString(),
        ...additionalData
      };
      
      conversions.push(conversion);
      localStorage.setItem(CONVERSION_KEY, JSON.stringify(conversions));
      
      // Track in analytics
      trackDemoEvent(DEMO_EVENTS.AB_TEST_CONVERSION, {
        variant: variant.id,
        conversion_type: conversionType,
        ...additionalData
      });
    } catch (error) {
      console.error('Failed to track conversion:', error);
    }
  }, [variant]);

  // Get conversion metrics
  const getConversionMetrics = useCallback(() => {
    try {
      const conversions = JSON.parse(localStorage.getItem(CONVERSION_KEY) || '[]');
      
      const metrics = {
        total_conversions: conversions.length,
        by_variant: {
          A: conversions.filter(c => c.variant === 'A').length,
          B: conversions.filter(c => c.variant === 'B').length
        },
        by_type: {}
      };
      
      // Group by conversion type
      conversions.forEach(c => {
        if (!metrics.by_type[c.type]) {
          metrics.by_type[c.type] = { A: 0, B: 0 };
        }
        metrics.by_type[c.type][c.variant]++;
      });
      
      return metrics;
    } catch (error) {
      console.error('Failed to get conversion metrics:', error);
      return null;
    }
  }, []);

  // Check if user is in specific variant
  const isVariantA = variant?.id === 'A';
  const isVariantB = variant?.id === 'B';

  // Get variant-specific configuration
  const getConfig = useCallback((key) => {
    if (!variant) return null;
    return variant[key];
  }, [variant]);

  // Force variant assignment (for testing)
  const forceVariant = useCallback((variantKey) => {
    if (VARIANTS[variantKey]) {
      localStorage.setItem(STORAGE_KEY, variantKey);
      setVariant(VARIANTS[variantKey]);
      trackDemoEvent(DEMO_EVENTS.AB_TEST_VARIANT_ASSIGNED, {
        variant: variantKey,
        forced: true
      });
    }
  }, []);

  // Reset variant assignment
  const resetVariant = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(CONVERSION_KEY);
    window.location.reload();
  }, []);

  // Get all variant options (for debugging)
  const getAllVariants = () => VARIANTS;

  return {
    variant: variant || VARIANTS.A, // Default to A while loading
    isLoading,
    isVariantA,
    isVariantB,
    trackConversion,
    getConversionMetrics,
    getConfig,
    forceVariant,
    resetVariant,
    getAllVariants
  };
};

export default useDemoABTest;