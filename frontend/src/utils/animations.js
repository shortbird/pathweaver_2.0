/**
 * Animation utilities for homepage redesign
 * Intersection Observer-based scroll animations and lazy loading
 */

/**
 * Create an Intersection Observer for scroll-triggered animations
 * @param {Function} callback - Function to call when element intersects
 * @param {Object} options - Intersection Observer options
 * @returns {IntersectionObserver}
 */
export const createScrollObserver = (callback, options = {}) => {
  const defaultOptions = {
    root: null,
    rootMargin: '0px',
    threshold: 0.2, // Trigger when 20% visible
    ...options
  }

  return new IntersectionObserver(callback, defaultOptions)
}

/**
 * Hook for scroll-triggered fade-in animations
 * @param {number} threshold - Visibility threshold (0-1)
 * @returns {Object} - { ref, isVisible }
 */
export const useScrollAnimation = (threshold = 0.2) => {
  const [isVisible, setIsVisible] = React.useState(false)
  const ref = React.useRef(null)

  React.useEffect(() => {
    const observer = createScrollObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          // Optionally disconnect after first trigger for performance
          // observer.disconnect()
        }
      })
    }, { threshold })

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => {
      if (ref.current) {
        observer.unobserve(ref.current)
      }
    }
  }, [threshold])

  return { ref, isVisible }
}

/**
 * Create staggered animation delays for lists of elements
 * @param {number} index - Element index in list
 * @param {number} delayMs - Base delay in milliseconds
 * @returns {string} - CSS animation-delay value
 */
export const getStaggerDelay = (index, delayMs = 100) => {
  return `${index * delayMs}ms`
}

/**
 * Check if user prefers reduced motion
 * @returns {boolean}
 */
export const prefersReducedMotion = () => {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * Get animation class names based on visibility and reduced motion preference
 * @param {boolean} isVisible - Whether element is visible in viewport
 * @param {string} animationClass - CSS class for animation
 * @returns {string} - Combined class names
 */
export const getAnimationClasses = (isVisible, animationClass = 'fade-in-up') => {
  if (prefersReducedMotion()) {
    return '' // No animations if user prefers reduced motion
  }

  return isVisible ? `${animationClass} animate` : animationClass
}

/**
 * Lazy load image with blur-up effect
 * @param {string} src - Image source URL
 * @param {string} placeholder - Low-res placeholder (optional)
 * @returns {Object} - { imgSrc, isLoaded, handleLoad }
 */
export const useLazyImage = (src, placeholder = null) => {
  const [imgSrc, setImgSrc] = React.useState(placeholder || src)
  const [isLoaded, setIsLoaded] = React.useState(false)
  const imgRef = React.useRef(null)

  React.useEffect(() => {
    const observer = createScrollObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          // Load high-res image when in viewport
          const img = new Image()
          img.src = src
          img.onload = () => {
            setImgSrc(src)
            setIsLoaded(true)
          }
          observer.disconnect()
        }
      })
    }, { threshold: 0.1 })

    if (imgRef.current) {
      observer.observe(imgRef.current)
    }

    return () => {
      if (imgRef.current) {
        observer.unobserve(imgRef.current)
      }
    }
  }, [src, placeholder])

  return { imgRef, imgSrc, isLoaded }
}

/**
 * Parallax scroll effect
 * @param {number} speed - Parallax speed (0.1 = slow, 1 = normal)
 * @returns {Object} - { ref, offset }
 */
export const useParallax = (speed = 0.3) => {
  const [offset, setOffset] = React.useState(0)
  const ref = React.useRef(null)

  React.useEffect(() => {
    if (prefersReducedMotion()) {
      return // No parallax if reduced motion preferred
    }

    const handleScroll = () => {
      if (ref.current) {
        const rect = ref.current.getBoundingClientRect()
        const scrolled = window.pageYOffset || document.documentElement.scrollTop
        setOffset(scrolled * speed)
      }
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [speed])

  return { ref, offset }
}

/**
 * CSS animation classes for common patterns
 */
export const animationClasses = {
  fadeInUp: `
    opacity: 0;
    transform: translateY(30px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  `,
  fadeInUpActive: `
    opacity: 1;
    transform: translateY(0);
  `,
  fadeIn: `
    opacity: 0;
    transition: opacity 0.6s ease;
  `,
  fadeInActive: `
    opacity: 1;
  `,
  scaleIn: `
    opacity: 0;
    transform: scale(0.95);
    transition: opacity 0.5s ease, transform 0.5s ease;
  `,
  scaleInActive: `
    opacity: 1;
    transform: scale(1);
  `,
  slideInLeft: `
    opacity: 0;
    transform: translateX(-30px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  `,
  slideInLeftActive: `
    opacity: 1;
    transform: translateX(0);
  `,
  slideInRight: `
    opacity: 0;
    transform: translateX(30px);
    transition: opacity 0.6s ease, transform 0.6s ease;
  `,
  slideInRightActive: `
    opacity: 1;
    transform: translateX(0);
  `
}

/**
 * Timeline animation for sequential reveals
 * @param {number} totalSteps - Total number of steps in timeline
 * @param {boolean} isActive - Whether timeline animation is active
 * @returns {Function} - getStepClasses(stepIndex) => class names
 */
export const useTimelineAnimation = (totalSteps, isActive) => {
  const getStepClasses = (stepIndex) => {
    if (prefersReducedMotion() || !isActive) {
      return 'opacity-100'
    }

    const delay = stepIndex * 150 // 150ms between each step
    return `animate-fadeInUp animation-delay-${delay}`
  }

  return { getStepClasses }
}
