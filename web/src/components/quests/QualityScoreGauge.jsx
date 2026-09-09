import React from 'react';
import PropTypes from 'prop-types';

/**
 * QualityScoreGauge Component
 *
 * Displays a circular quality score gauge with color coding and label.
 * Used for showing AI task quality analysis results.
 */
const QualityScoreGauge = ({ score, size = 'medium' }) => {
  // Determine size dimensions
  const dimensions = {
    small: { width: 60, stroke: 5, fontSize: 'text-sm' },
    medium: { width: 80, stroke: 6, fontSize: 'text-lg' },
    large: { width: 120, stroke: 8, fontSize: 'text-2xl' }
  };

  const { width, stroke, fontSize } = dimensions[size] || dimensions.medium;
  const radius = (width - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  // Color coding based on score ranges
  const getScoreColor = (score) => {
    if (score >= 70) return { primary: '#10B981', secondary: '#D1FAE5', label: 'Excellent' }; // Green
    if (score >= 50) return { primary: '#F59E0B', secondary: '#FEF3C7', label: 'Good' }; // Yellow
    return { primary: '#EF4444', secondary: '#FEE2E2', label: 'Needs Work' }; // Red
  };

  const { primary, secondary, label } = getScoreColor(score);

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width, height: width }}>
        <svg className="transform -rotate-90" width={width} height={width}>
          {/* Background circle */}
          <circle
            cx={width / 2}
            cy={width / 2}
            r={radius}
            fill="none"
            stroke={secondary}
            strokeWidth={stroke}
          />
          {/* Progress circle */}
          <circle
            cx={width / 2}
            cy={width / 2}
            r={radius}
            fill="none"
            stroke={primary}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dashoffset 0.5s ease-in-out'
            }}
          />
        </svg>
        {/* Score text in center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`${fontSize} font-bold text-gray-900`}>
            {score}
          </span>
        </div>
      </div>
      {/* Quality label */}
      <span
        className="text-sm font-semibold px-3 py-1 rounded-full"
        style={{
          backgroundColor: secondary,
          color: primary
        }}
      >
        {label}
      </span>
    </div>
  );
};

QualityScoreGauge.propTypes = {
  score: PropTypes.number.isRequired,
  size: PropTypes.oneOf(['small', 'medium', 'large'])
};

export default QualityScoreGauge;
