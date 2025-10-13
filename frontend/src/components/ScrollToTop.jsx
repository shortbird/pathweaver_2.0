import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop Component
 * Automatically scrolls to top of page on route changes
 * This ensures users always start at the top when navigating to a new page
 */
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    // Scroll to top instantly when route changes
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
};

export default ScrollToTop;
