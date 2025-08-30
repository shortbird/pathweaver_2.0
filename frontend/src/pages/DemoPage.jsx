import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import DemoHero from '../components/demo/DemoHero';
import DemoProgress from '../components/demo/DemoProgress';
import DemoDiploma from '../components/demo/DemoDiploma';
import DemoQuestBrowser from '../components/demo/DemoQuestBrowser';
import DemoHowItWorks from '../components/demo/DemoHowItWorks';
import DemoTestimonials from '../components/demo/DemoTestimonials';
import DemoDataManager from '../components/demo/DemoDataManager';
import { trackDemoEvent } from '../utils/demoAnalytics';
import useDemoABTest from '../hooks/useDemoABTest';

const DemoPage = () => {
  const navigate = useNavigate();
  const [demoState, setDemoState] = useState(null);
  const [sectionsViewed, setSectionsViewed] = useState(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const { variant, isVariantA, trackConversion } = useDemoABTest();
  
  const heroRef = useRef(null);
  const diplomaRef = useRef(null);
  const questsRef = useRef(null);
  const howItWorksRef = useRef(null);
  const testimonialsRef = useRef(null);

  const dataManager = useRef(new DemoDataManager());

  useEffect(() => {
    // Initialize demo state
    const initDemo = async () => {
      try {
        const state = await dataManager.current.initializeDemoState();
        setDemoState(state);
        trackDemoEvent('DEMO_PAGE_VIEW', { variant: variant.id });
      } catch (error) {
        console.error('Failed to initialize demo:', error);
      } finally {
        setIsLoading(false);
      }
    };
    
    initDemo();
    
    // Track page view duration
    const startTime = Date.now();
    return () => {
      const timeSpent = Math.floor((Date.now() - startTime) / 1000);
      trackDemoEvent('TIME_ON_PAGE', { duration: timeSpent });
    };
  }, [variant]);

  useEffect(() => {
    // Set up intersection observer for section tracking
    const observerOptions = {
      root: null,
      rootMargin: '0px',
      threshold: 0.5
    };

    const observerCallback = (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const sectionId = entry.target.getAttribute('data-section');
          if (sectionId && !sectionsViewed.has(sectionId)) {
            setSectionsViewed(prev => new Set([...prev, sectionId]));
            dataManager.current.updateProgress(sectionId, 'viewed');
            trackDemoEvent('DEMO_SECTION_VIEW', { section: sectionId });
          }
        }
      });
    };

    const observer = new IntersectionObserver(observerCallback, observerOptions);
    
    // Observe all sections
    const sections = [
      { ref: heroRef, id: 'hero' },
      { ref: diplomaRef, id: 'diploma' },
      { ref: questsRef, id: 'quests' },
      { ref: howItWorksRef, id: 'how-it-works' },
      { ref: testimonialsRef, id: 'testimonials' }
    ];

    sections.forEach(section => {
      if (section.ref.current) {
        section.ref.current.setAttribute('data-section', section.id);
        observer.observe(section.ref.current);
      }
    });

    return () => observer.disconnect();
  }, [sectionsViewed]);

  const scrollToSection = (ref) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleStartJourney = () => {
    trackConversion('cta_click');
    trackDemoEvent('CTA_CLICK', { location: 'hero', variant: variant.id });
    navigate('/register?source=demo');
  };

  const handleQuestInteraction = (questId) => {
    dataManager.current.updateProgress('quests', 'interacted', { questId });
    trackDemoEvent('QUEST_CARD_CLICK', { questId });
  };

  const getProgress = () => {
    const totalSections = 5;
    const viewedCount = sectionsViewed.size;
    return Math.round((viewedCount / totalSections) * 100);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading demo experience...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      {/* Progress Indicator */}
      <DemoProgress 
        progress={getProgress()} 
        sectionsViewed={sectionsViewed}
        onSectionClick={scrollToSection}
      />

      {/* Hero Section */}
      <section ref={heroRef} className="relative">
        <DemoHero 
          title={variant.heroTitle}
          ctaText={variant.ctaText}
          onCtaClick={handleStartJourney}
          onScrollToDemo={() => scrollToSection(diplomaRef)}
        />
      </section>

      {/* Interactive Diploma */}
      <section ref={diplomaRef} className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              See a Real Student Portfolio
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              This is Alex's actual diploma showcasing 12 completed quests. 
              Every achievement is backed by real evidence.
            </p>
          </div>
          <DemoDiploma 
            demoState={demoState}
            onEvidenceClick={(questId) => {
              trackDemoEvent('EVIDENCE_EXPAND', { questId });
            }}
          />
        </div>
      </section>

      {/* Quest Browser */}
      <section ref={questsRef} className="py-16 px-4 bg-white/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              Explore Sample Quests
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Browse through real quests that students complete to build their skills and portfolios.
            </p>
          </div>
          <DemoQuestBrowser 
            questOrder={variant.questOrder}
            onQuestClick={handleQuestInteraction}
            onStartQuest={(questId) => {
              trackConversion('quest_start_attempt');
              handleStartJourney();
            }}
          />
        </div>
      </section>

      {/* How It Works */}
      <section ref={howItWorksRef} className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              How Optio Works
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Four simple steps to transform learning into an adventure
            </p>
          </div>
          <DemoHowItWorks />
        </div>
      </section>

      {/* Testimonials (conditional based on A/B test) */}
      {variant.showTestimonials && (
        <section ref={testimonialsRef} className="py-16 px-4 bg-gradient-to-br from-purple-100 to-indigo-100">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">
                Success Stories
              </h2>
              <p className="text-xl text-gray-600 max-w-3xl mx-auto">
                Hear from students who've transformed their learning journey with Optio
              </p>
            </div>
            <DemoTestimonials />
          </div>
        </section>
      )}

      {/* Final CTA Section */}
      <section className="py-20 px-4 bg-gradient-to-r from-purple-600 to-indigo-600">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl font-bold text-white mb-6">
            Ready to Start Your Learning Adventure?
          </h2>
          <p className="text-xl text-purple-100 mb-8">
            Join thousands of students building impressive portfolios through self-directed learning
          </p>
          
          {getProgress() === 100 && (
            <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4 mb-6 inline-block">
              <p className="text-white font-semibold">
                🎉 Demo Master! You've explored everything. Claim your 20% discount!
              </p>
            </div>
          )}
          
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={handleStartJourney}
              className="px-8 py-4 bg-white text-purple-600 font-bold rounded-lg hover:bg-purple-50 transform hover:scale-105 transition-all shadow-xl"
            >
              Start Free Trial
            </button>
            <button
              onClick={() => {
                dataManager.current.resetDemo();
                window.location.reload();
              }}
              className="px-8 py-4 bg-purple-700 text-white font-bold rounded-lg hover:bg-purple-800 transition-all"
            >
              Reset Demo
            </button>
          </div>
          
          <p className="text-purple-200 mt-6 text-sm">
            No credit card required • Free tier available • Cancel anytime
          </p>
        </div>
      </section>

      {/* Exit Intent Modal (could be added later) */}
    </div>
  );
};

export default DemoPage;