import React from 'react';
import {
  ClockIcon,
  FireIcon,
  MapPinIcon,
  CalendarIcon,
  LightBulbIcon
} from '@heroicons/react/24/outline';

/**
 * QuestMetadataCard - Display quest logistics and metadata
 *
 * Shows time estimate, intensity, location, seasonal dates, and deliverables.
 * Only displays sections that have data.
 *
 * @param {object} quest - Full quest object
 * @param {string} className - Additional CSS classes
 */
const QuestMetadataCard = ({ quest, className = '' }) => {
  if (!quest) return null;

  // Extract metadata
  const metadata = quest.metadata || {};

  // Time estimate
  const timeEstimate = metadata.estimated_hours || metadata.estimated_time;

  // Intensity level
  const intensity = metadata.intensity;
  const intensityDisplay = {
    light: 'Light',
    moderate: 'Moderate',
    intensive: 'Intensive'
  };

  // Location
  const getLocationDisplay = () => {
    const { location_type, venue_name, location_address } = metadata;

    if (location_type === 'anywhere') return 'Anywhere';
    if (location_type === 'specific_location') {
      if (venue_name && location_address) {
        return `${venue_name}, ${location_address}`;
      } else if (venue_name) {
        return venue_name;
      } else if (location_address) {
        return location_address;
      }
    }
    return null;
  };

  // Seasonal dates
  const getSeasonalDisplay = () => {
    if (!metadata.seasonal_start) return null;

    const startDate = new Date(metadata.seasonal_start).toLocaleDateString();
    const endDate = metadata.seasonal_end
      ? new Date(metadata.seasonal_end).toLocaleDateString()
      : 'Ongoing';

    return `${startDate} - ${endDate}`;
  };

  // Deliverables
  const deliverables = metadata.what_youll_create || metadata.deliverables || [];

  const locationDisplay = getLocationDisplay();
  const seasonalDisplay = getSeasonalDisplay();

  // Check if we have any data to display
  const hasDeliverables = deliverables.length > 0;
  const hasMetadata = timeEstimate || intensity || locationDisplay || seasonalDisplay;

  if (!hasDeliverables && !hasMetadata) {
    return null;
  }

  return (
    <div className={`bg-white rounded-xl shadow-md p-4 sm:p-6 ${className}`}>
      {/* What You Could Create Section */}
      {hasDeliverables && (
        <div className={hasMetadata ? 'mb-6' : ''}>
          <h2
            className="text-lg sm:text-xl font-bold text-gray-900 mb-3 flex items-center gap-2"
            style={{ fontFamily: 'Poppins' }}
          >
            <LightBulbIcon className="w-5 h-5 text-optio-purple" />
            What You Could Create
          </h2>
          <ul className="space-y-2">
            {deliverables.map((item, index) => (
              <li
                key={index}
                className="flex items-start gap-2 text-sm sm:text-base text-gray-700"
                style={{ fontFamily: 'Poppins' }}
              >
                <span className="text-optio-purple mt-1">-</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quest Details Section */}
      {hasMetadata && (
        <div>
          <h2
            className="text-lg sm:text-xl font-bold text-gray-900 mb-3"
            style={{ fontFamily: 'Poppins' }}
          >
            Quest Details
          </h2>
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            {/* Time Estimate */}
            {timeEstimate && (
              <div className="flex items-center gap-3 text-sm sm:text-base text-gray-700">
                <ClockIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins' }}>
                  <span className="font-medium">Time Estimate:</span> {timeEstimate}
                  {typeof timeEstimate === 'number' && ' hours'}
                </span>
              </div>
            )}

            {/* Intensity */}
            {intensity && (
              <div className="flex items-center gap-3 text-sm sm:text-base text-gray-700">
                <FireIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins' }}>
                  <span className="font-medium">Intensity:</span>{' '}
                  {intensityDisplay[intensity] || intensity}
                </span>
              </div>
            )}

            {/* Location */}
            {locationDisplay && (
              <div className="flex items-center gap-3 text-sm sm:text-base text-gray-700">
                <MapPinIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins' }}>
                  <span className="font-medium">Location:</span> {locationDisplay}
                </span>
              </div>
            )}

            {/* Seasonal */}
            {seasonalDisplay && (
              <div className="flex items-center gap-3 text-sm sm:text-base text-gray-700">
                <CalendarIcon className="w-5 h-5 text-gray-500 flex-shrink-0" />
                <span style={{ fontFamily: 'Poppins' }}>
                  <span className="font-medium">Seasonal:</span> {seasonalDisplay}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestMetadataCard;
