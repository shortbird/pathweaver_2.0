import { useState, useEffect } from 'react'
import { ArrowRight } from 'lucide-react'

const LandingPageHero = ({
  title,
  gradientTitle = '',
  rotatingWords = [],
  staticSubtitle = '',
  ctaText,
  onCtaClick,
  backgroundGradient = 'linear-gradient(135deg, #6D469B 0%, #8058AC 50%, #EF597B 100%)',
  backgroundImage = null,
  backgroundPosition = 'center',
  secondaryCta = null,
  removeOverlay = false,
  textAlign = 'center',
}) => {
  const [currentWordIndex, setCurrentWordIndex] = useState(0)

  useEffect(() => {
    if (rotatingWords.length > 0) {
      const interval = setInterval(() => {
        setCurrentWordIndex((prev) => (prev + 1) % rotatingWords.length)
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [rotatingWords.length])

  const getWordGradient = (index) => {
    const gradients = [
      'linear-gradient(45deg, #FFD700, #FFA500)', // Gold
      'linear-gradient(45deg, #00CED1, #1E90FF)', // Blue
      'linear-gradient(45deg, #FF69B4, #FF1493)', // Pink
      'linear-gradient(45deg, #32CD32, #228B22)', // Green
    ]
    return gradients[index % gradients.length]
  }

  return (
    <div
      className={`relative py-20 px-4 overflow-hidden ${textAlign === 'center' ? 'text-center' : 'text-left'}`}
      style={{
        background: backgroundImage ? 'transparent' : backgroundGradient,
        minHeight: '500px'
      }}
    >
      {/* Background Image with Optional Overlay */}
      {backgroundImage && (
        <>
          <div
            className="absolute inset-0 bg-cover"
            style={{
              backgroundImage: `url(${backgroundImage})`,
              backgroundPosition: backgroundPosition,
              backgroundSize: 'cover'
            }}
          />
          {/* Gradient overlay for text readability - uses Optio brand gradient with opacity */}
          {!removeOverlay && (
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(135deg, rgba(109, 70, 155, 0.8) 0%, rgba(239, 89, 123, 0.8) 100%)'
              }}
            />
          )}
        </>
      )}

      {/* Decorative background elements (only show if no background image) */}
      {!backgroundImage && (
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 left-10 w-32 h-32 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 right-10 w-40 h-40 bg-white rounded-full blur-3xl"></div>
        </div>
      )}

      <div className={`relative max-w-6xl ${textAlign === 'center' ? 'mx-auto' : 'ml-8 md:ml-16 lg:ml-24'}`}>
        {/* Main Title */}
        <h1
          className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-white mb-2 leading-tight"
          style={{ fontFamily: 'Poppins', fontWeight: 700 }}
        >
          {title}
        </h1>

        {/* Gradient Title (if provided) */}
        {gradientTitle && (
          <h1
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl mb-6 leading-tight"
            style={{
              fontFamily: 'Poppins',
              fontWeight: 700,
              background: 'linear-gradient(180deg, #E7ABF3 0%, #BE84C9 100%)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {gradientTitle}
          </h1>
        )}

        {/* Rotating Words or Static Subtitle */}
        {rotatingWords.length > 0 ? (
          <div className="relative h-32 sm:h-40 md:h-44 lg:h-48 my-6">
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="px-8 py-4"
                style={{
                  background: 'radial-gradient(ellipse, rgba(0, 0, 0, 0.25) 0%, rgba(0, 0, 0, 0.15) 50%, transparent 80%)',
                  backdropFilter: 'blur(4px)'
                }}
              >
                <span
                  key={currentWordIndex}
                  className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl animate-fade-in"
                  style={{
                    fontFamily: 'Poppins',
                    fontWeight: 700,
                    background: getWordGradient(currentWordIndex),
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    textRendering: 'optimizeLegibility',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale'
                  }}
                >
                  {rotatingWords[currentWordIndex]}
                </span>
              </div>
            </div>
          </div>
        ) : staticSubtitle ? (
          <p
            className="text-xl sm:text-2xl md:text-3xl text-white/95 mb-8 max-w-4xl mx-auto leading-relaxed"
            style={{ fontFamily: 'Poppins', fontWeight: 600 }}
          >
            {staticSubtitle}
          </p>
        ) : null}

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mt-8">
          <button
            onClick={onCtaClick}
            className="bg-white text-optio-pink hover:bg-gray-100 text-lg px-8 py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            {ctaText}
            <ArrowRight className="ml-2 w-5 h-5" />
          </button>

          {secondaryCta && (
            <button
              onClick={secondaryCta.onClick}
              className="bg-transparent border-2 border-white text-white hover:bg-white/10 text-lg px-8 py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              {secondaryCta.text}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default LandingPageHero
