import React from 'react';

// Present-Focused Value Icon - Growing Plant/Seedling
export const PresentFocusIcon = ({ className = "", isHovered = false }) => (
  <svg 
    className={`${className} transition-all duration-500 ease-out`}
    viewBox="0 0 64 64" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Soil base */}
    <ellipse cx="32" cy="56" rx="18" ry="4" fill="#8B4513" className="opacity-60" />
    
    {/* Main stem */}
    <path 
      d="M32 56 C32 48, 32 40, 32 32" 
      stroke="url(#stemGradient)" 
      strokeWidth="3" 
      strokeLinecap="round"
      className={`transition-all duration-700 ${isHovered ? 'stroke-[4]' : ''}`}
    />
    
    {/* Leaves - animated growth */}
    <path 
      d="M32 45 C28 43, 25 40, 24 36 C25 40, 28 43, 32 45" 
      fill="url(#leafGradient1)"
      className={`transition-all duration-500 transform origin-center ${isHovered ? 'scale-110' : 'scale-100'}`}
    />
    <path 
      d="M32 40 C36 38, 39 35, 40 31 C39 35, 36 38, 32 40" 
      fill="url(#leafGradient2)"
      className={`transition-all duration-500 delay-100 transform origin-center ${isHovered ? 'scale-110' : 'scale-100'}`}
    />
    
    {/* Main flower/bud */}
    <circle 
      cx="32" 
      cy="28" 
      r="6"
      fill="url(#flowerGradient)"
      className={`transition-all duration-300 transform ${isHovered ? 'scale-125' : 'scale-100'}`}
    />
    
    {/* Petals */}
    {[0, 72, 144, 216, 288].map((rotation, i) => (
      <ellipse
        key={i}
        cx="32"
        cy="22"
        rx="3"
        ry="1.5"
        fill="url(#petalGradient)"
        transform={`rotate(${rotation} 32 28)`}
        className={`transition-all duration-500 transform origin-center ${isHovered ? 'scale-125' : 'scale-100'}`}
        style={{ animationDelay: `${i * 100}ms` }}
      />
    ))}
    
    {/* Sparkles for magic effect */}
    {isHovered && (
      <g className="animate-pulse">
        <circle cx="20" cy="25" r="1" fill="#ef597b" />
        <circle cx="44" cy="30" r="1" fill="#6d469b" />
        <circle cx="25" cy="35" r="0.5" fill="#ef597b" />
        <circle cx="39" cy="45" r="0.5" fill="#6d469b" />
      </g>
    )}
    
    <defs>
      <linearGradient id="stemGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#22c55e" />
        <stop offset="100%" stopColor="#16a34a" />
      </linearGradient>
      <linearGradient id="leafGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#34d399" />
        <stop offset="100%" stopColor="#10b981" />
      </linearGradient>
      <linearGradient id="leafGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10b981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>
      <linearGradient id="flowerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ef597b" />
        <stop offset="100%" stopColor="#6d469b" />
      </linearGradient>
      <linearGradient id="petalGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
    </defs>
  </svg>
);

// Growth Over Achievement Icon - Ascending Steps with Progress
export const GrowthOverAchievementIcon = ({ className = "", isHovered = false }) => (
  <svg 
    className={`${className} transition-all duration-500 ease-out`}
    viewBox="0 0 64 64" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Steps/Stairs */}
    <rect x="8" y="50" width="12" height="8" rx="2" fill="url(#stepGradient1)" 
          className={`transition-all duration-300 ${isHovered ? 'fill-opacity-90' : 'fill-opacity-70'}`} />
    <rect x="18" y="42" width="12" height="16" rx="2" fill="url(#stepGradient2)" 
          className={`transition-all duration-400 delay-100 ${isHovered ? 'fill-opacity-90' : 'fill-opacity-70'}`} />
    <rect x="28" y="34" width="12" height="24" rx="2" fill="url(#stepGradient3)" 
          className={`transition-all duration-500 delay-200 ${isHovered ? 'fill-opacity-90' : 'fill-opacity-70'}`} />
    <rect x="38" y="26" width="12" height="32" rx="2" fill="url(#stepGradient4)" 
          className={`transition-all duration-600 delay-300 ${isHovered ? 'fill-opacity-90' : 'fill-opacity-70'}`} />
    
    {/* Progress path/arrow */}
    <path 
      d="M14 46 L24 38 L34 30 L44 22 L50 16" 
      stroke="url(#pathGradient)" 
      strokeWidth="3" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      strokeDasharray="4 4"
      className={`transition-all duration-700 ${isHovered ? 'stroke-[4] stroke-dasharray-none' : ''}`}
    />
    
    {/* Arrow head */}
    <path 
      d="M46 18 L50 16 L48 12" 
      stroke="url(#pathGradient)" 
      strokeWidth="3" 
      strokeLinecap="round" 
      strokeLinejoin="round"
      className={`transition-all duration-300 transform origin-center ${isHovered ? 'scale-125' : 'scale-100'}`}
    />
    
    {/* Floating achievement stars */}
    {isHovered && (
      <g className="animate-bounce">
        <path d="M22 20 L23 23 L26 23 L24 25 L25 28 L22 26 L19 28 L20 25 L18 23 L21 23 Z" 
              fill="url(#starGradient)" className="animate-pulse" />
        <path d="M42 12 L43 15 L46 15 L44 17 L45 20 L42 18 L39 20 L40 17 L38 15 L41 15 Z" 
              fill="url(#starGradient)" className="animate-pulse delay-300" />
      </g>
    )}
    
    <defs>
      <linearGradient id="stepGradient1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ef597b" />
        <stop offset="100%" stopColor="#dc2f55" />
      </linearGradient>
      <linearGradient id="stepGradient2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#e05d7a" />
        <stop offset="100%" stopColor="#6d469b" />
      </linearGradient>
      <linearGradient id="stepGradient3" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#c56189" />
        <stop offset="100%" stopColor="#6d469b" />
      </linearGradient>
      <linearGradient id="stepGradient4" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#a565a0" />
        <stop offset="100%" stopColor="#553a7d" />
      </linearGradient>
      <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#ef597b" />
        <stop offset="100%" stopColor="#6d469b" />
      </linearGradient>
      <linearGradient id="starGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
    </defs>
  </svg>
);

// Internal Motivation Icon - Heart with Radiating Energy
export const InternalMotivationIcon = ({ className = "", isHovered = false }) => (
  <svg 
    className={`${className} transition-all duration-500 ease-out`}
    viewBox="0 0 64 64" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* Energy rays (background) */}
    <g className={`transition-all duration-500 ${isHovered ? 'opacity-80' : 'opacity-40'}`}>
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <line
          key={i}
          x1="32"
          y1="32"
          x2="32"
          y2="12"
          stroke="url(#rayGradient)"
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${angle} 32 32)`}
          className={`transition-all duration-700 ${isHovered ? 'stroke-[3]' : ''}`}
          style={{ animationDelay: `${i * 100}ms` }}
        />
      ))}
    </g>
    
    {/* Main heart shape */}
    <path
      d="M32 52 C32 52, 16 36, 16 24 C16 18, 20 14, 26 14 C29 14, 31 16, 32 18 C33 16, 35 14, 38 14 C44 14, 48 18, 48 24 C48 36, 32 52, 32 52 Z"
      fill="url(#heartGradient)"
      className={`transition-all duration-300 transform origin-center ${isHovered ? 'scale-110' : 'scale-100'}`}
    />
    
    {/* Heart highlight */}
    <path
      d="M24 20 C28 18, 30 20, 32 24 C32 22, 30 18, 26 18 C24 18, 22 19, 22 21 C22 20, 23 19, 24 20 Z"
      fill="url(#highlightGradient)"
      className={`transition-all duration-300 ${isHovered ? 'opacity-90' : 'opacity-60'}`}
    />
    
    {/* Pulsing energy ring */}
    <circle 
      cx="32" 
      cy="30" 
      r="22" 
      stroke="url(#ringGradient)" 
      strokeWidth="2" 
      fill="none"
      strokeDasharray="4 4"
      className={`transition-all duration-1000 ${isHovered ? 'animate-spin r-26 stroke-[3]' : 'opacity-30'}`}
    />
    
    {/* Floating particles */}
    {isHovered && (
      <g>
        <circle cx="18" cy="20" r="2" fill="#ef597b" className="animate-ping" />
        <circle cx="46" cy="25" r="1.5" fill="#6d469b" className="animate-ping delay-200" />
        <circle cx="20" cy="44" r="1" fill="#ef597b" className="animate-ping delay-400" />
        <circle cx="44" cy="42" r="1" fill="#6d469b" className="animate-ping delay-600" />
        <circle cx="32" cy="10" r="1.5" fill="#fbbf24" className="animate-ping delay-800" />
      </g>
    )}
    
    <defs>
      <linearGradient id="heartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#ef597b" />
        <stop offset="50%" stopColor="#d946ef" />
        <stop offset="100%" stopColor="#6d469b" />
      </linearGradient>
      <linearGradient id="highlightGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#fbbf24" />
        <stop offset="100%" stopColor="#f59e0b" />
      </linearGradient>
      <linearGradient id="rayGradient" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#ef597b" />
        <stop offset="100%" stopColor="#6d469b" />
      </linearGradient>
      <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#ef597b" />
        <stop offset="50%" stopColor="#d946ef" />
        <stop offset="100%" stopColor="#6d469b" />
      </linearGradient>
    </defs>
  </svg>
);