import { useState, useEffect } from 'react'
import { ArrowRightIcon } from '@heroicons/react/24/outline'

const VELA_LOGO_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/homepage/VELA.gif'

const LandingPageHero = ({
  title,
  gradientTitle = '',
  rotatingWords = [],
  staticSubtitle = '',
  ctaText,
  onCtaClick,
  backgroundGradient = 'linear-gradient(135deg, #6D469B 0%, #8058AC 50%, #EF597B 100%)',
  backgroundImage = null,
  mobileBackgroundImage = null,
  backgroundPosition = 'center',
  secondaryCta = null,
  removeOverlay = false,
  textAlign = 'center',
  tertiaryLink = null,
  trustBadge = null,
  splitLayout = false,
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

  // Split Layout Render
  if (splitLayout && backgroundImage) {
    return (
      <div className="relative min-h-[500px] md:min-h-[550px] -mt-12 sm:mt-0">
        {/* Mobile background image - centered */}
        <div className="absolute inset-0 overflow-hidden md:hidden">
          <img
            src={mobileBackgroundImage || backgroundImage}
            alt=""
            className="absolute w-full h-full object-cover"
            style={{
              objectPosition: 'center',
            }}
          />
        </div>

        {/* Desktop background image - custom position */}
        <div className="absolute inset-0 overflow-hidden hidden md:block">
          <img
            src={backgroundImage}
            alt=""
            className="absolute w-full h-full object-cover"
            style={{
              objectPosition: backgroundPosition,
            }}
          />
        </div>

        {/* Dark overlay - mobile only */}
        <div
          className="absolute inset-0 md:hidden bg-black/50"
        />
        {/* Gradient overlay - desktop only */}
        <div
          className="absolute inset-0 hidden md:block"
          style={{
            background: 'linear-gradient(to right, #6D469B 0%, #6D469B 25%, rgba(109, 70, 155, 0.95) 35%, rgba(109, 70, 155, 0.7) 45%, rgba(109, 70, 155, 0.3) 55%, transparent 65%)'
          }}
        />

        {/* Content positioned on left side */}
        <div className="relative h-full min-h-[500px] md:min-h-[550px] flex items-center md:items-center items-start">
          <div className="w-full md:w-[55%] lg:w-1/2 px-6 py-8 md:py-20 md:px-12 lg:px-16">
            {/* Main Title */}
            <h1
              className="text-4xl sm:text-5xl md:text-5xl lg:text-6xl text-white mb-2 leading-tight text-center md:text-left whitespace-nowrap"
              style={{ fontFamily: 'Poppins', fontWeight: 700 }}
            >
              {title}
            </h1>

            {/* Gradient Title */}
            {gradientTitle && (
              <h1
                className="text-3xl sm:text-4xl md:text-4xl lg:text-5xl mb-6 leading-tight text-center md:text-left"
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

            {/* Static Subtitle */}
            {staticSubtitle && (
              <p
                className="text-lg sm:text-xl md:text-xl text-white/95 mb-8 max-w-md leading-relaxed text-center md:text-left"
                style={{ fontFamily: 'Poppins', fontWeight: 600 }}
              >
                {staticSubtitle}
              </p>
            )}

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center md:justify-start">
              <button
                onClick={onCtaClick}
                className="bg-white text-optio-pink hover:bg-gray-100 text-sm md:text-base lg:text-lg px-4 py-3 md:px-6 lg:px-8 md:py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center justify-center whitespace-nowrap"
                style={{ fontFamily: 'Poppins', fontWeight: 700 }}
              >
                {ctaText}
                <ArrowRightIcon className="ml-2 w-4 h-4 md:w-5 md:h-5 flex-shrink-0" />
              </button>

              {secondaryCta && (
                <button
                  onClick={secondaryCta.onClick}
                  className="bg-transparent border-2 border-white text-white hover:bg-white/10 text-sm md:text-base lg:text-lg px-4 py-3 md:px-6 lg:px-8 md:py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 whitespace-nowrap"
                  style={{ fontFamily: 'Poppins', fontWeight: 600 }}
                >
                  {secondaryCta.text}
                </button>
              )}
            </div>

            {/* Tertiary Link */}
            {tertiaryLink && (
              <div className="mt-6 text-center md:text-left">
                <button
                  onClick={tertiaryLink.onClick}
                  className="text-white/90 hover:text-white underline hover:no-underline text-sm md:text-base transition-colors"
                  style={{ fontFamily: 'Poppins', fontWeight: 500 }}
                >
                  {tertiaryLink.text}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Default Layout Render
  return (
    <div
      className={`relative py-6 md:py-20 px-4 overflow-hidden flex items-center ${textAlign === 'center' ? 'text-center' : 'text-center md:text-left'}`}
      style={{
        background: backgroundImage ? 'transparent' : backgroundGradient,
        minHeight: '500px'
      }}
    >
      {/* Background Image with Optional Overlay */}
      {backgroundImage && (
        <>
          {/* Desktop background */}
          <div
            className="hidden md:block absolute inset-0 bg-cover"
            style={{
              backgroundImage: `url(${backgroundImage})`,
              backgroundPosition: backgroundPosition,
              backgroundSize: 'cover'
            }}
          />
          {/* Mobile background */}
          <div
            className="md:hidden absolute inset-0 bg-cover"
            style={{
              backgroundImage: `url(${mobileBackgroundImage || backgroundImage})`,
              backgroundPosition: 'top center',
              backgroundSize: 'cover'
            }}
          />
          {/* Gradient overlay for text readability - uses Optio brand gradient with opacity */}
          {!removeOverlay && (
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(to right, rgba(109, 70, 155, 0.95) 0%, rgba(109, 70, 155, 0.85) 25%, rgba(109, 70, 155, 0.4) 50%, transparent 65%)'
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

      <div className={`relative max-w-6xl ${textAlign === 'center' ? 'mx-auto' : 'mx-auto md:ml-8 md:mr-auto lg:ml-24'} -mt-8`}>
        {/* Main Title */}
        <h1
          className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl text-white mb-2 leading-tight"
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
            <div className="absolute inset-0 flex items-center justify-start">
              <h2
                key={currentWordIndex}
                className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl animate-[slideUp_0.6s_ease-out]"
                style={{
                  fontFamily: 'Poppins',
                  fontWeight: 700,
                  background: 'linear-gradient(180deg, #E7ABF3 0%, #BE84C9 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {rotatingWords[currentWordIndex]}
              </h2>
            </div>
          </div>
        ) : staticSubtitle ? (
          <p
            className={`text-xl sm:text-2xl md:text-3xl text-white/95 mb-8 max-w-4xl leading-relaxed mx-auto md:mx-0`}
            style={{ fontFamily: 'Poppins', fontWeight: 600 }}
          >
            {staticSubtitle}
          </p>
        ) : null}

        {/* CTA Buttons */}
        <div className={`flex flex-col sm:flex-row gap-4 mt-8 ${textAlign === 'center' ? 'justify-center items-center' : 'justify-center md:justify-start items-center md:items-start'}`}>
          <button
            onClick={onCtaClick}
            className="bg-white text-optio-pink hover:bg-gray-100 text-base md:text-lg px-6 py-3 md:px-8 md:py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 inline-flex items-center"
            style={{ fontFamily: 'Poppins', fontWeight: 700 }}
          >
            {ctaText}
            <ArrowRightIcon className="ml-2 w-4 h-4 md:w-5 md:h-5" />
          </button>

          {secondaryCta && (
            <button
              onClick={secondaryCta.onClick}
              className="bg-transparent border-2 border-white text-white hover:bg-white/10 text-base md:text-lg px-6 py-3 md:px-8 md:py-4 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
              style={{ fontFamily: 'Poppins', fontWeight: 600 }}
            >
              {secondaryCta.text}
            </button>
          )}
        </div>

        {/* Tertiary Link */}
        {tertiaryLink && (
          <div className={`mt-6 ${textAlign === 'center' ? 'text-center' : 'text-center md:text-left'}`}>
            <button
              onClick={tertiaryLink.onClick}
              className="text-white/90 hover:text-white underline hover:no-underline text-sm md:text-base transition-colors"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              {tertiaryLink.text}
            </button>
          </div>
        )}

        {/* Trust Badge */}
        {trustBadge && (
          <div className={`mt-8 flex items-center gap-3 ${textAlign === 'center' ? 'justify-center' : 'justify-center md:justify-start'}`}>
            <img
              src={VELA_LOGO_URL}
              alt="VELA Grant Recipient"
              className="h-8 w-auto"
            />
            <span
              className="text-white/80 text-sm"
              style={{ fontFamily: 'Poppins', fontWeight: 500 }}
            >
              {trustBadge.text}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

export default LandingPageHero
