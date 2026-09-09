/**
 * Common PropTypes definitions for reusable prop validation
 */
import PropTypes from 'prop-types';

// User object shape
export const userPropType = PropTypes.shape({
  id: PropTypes.string.isRequired,
  email: PropTypes.string.isRequired,
  display_name: PropTypes.string,
  first_name: PropTypes.string,
  last_name: PropTypes.string,
  role: PropTypes.oneOf(['student', 'parent', 'advisor', 'org_admin', 'superadmin', 'observer', 'org_managed']),
  avatar_url: PropTypes.string,
  bio: PropTypes.string,
  level: PropTypes.number,
  total_xp: PropTypes.number,
  portfolio_slug: PropTypes.string,
});

// Quest object shape
export const questPropType = PropTypes.shape({
  id: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  image_url: PropTypes.string,
  header_image_url: PropTypes.string,
  source: PropTypes.oneOf(['optio', 'lms']),
  is_active: PropTypes.bool,
  created_at: PropTypes.string,
  updated_at: PropTypes.string,
});

// Task object shape
export const taskPropType = PropTypes.shape({
  id: PropTypes.string.isRequired,
  quest_id: PropTypes.string.isRequired,
  title: PropTypes.string.isRequired,
  description: PropTypes.string,
  pillar: PropTypes.oneOf(['stem', 'wellness', 'communication', 'civics', 'art']),
  xp_value: PropTypes.number,
  order_index: PropTypes.number,
  is_required: PropTypes.bool,
});

// Badge object shape
export const badgePropType = PropTypes.shape({
  id: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  description: PropTypes.string,
  identity_statement: PropTypes.string,
  pillar_primary: PropTypes.oneOf(['stem', 'wellness', 'communication', 'civics', 'art']),
  min_quests: PropTypes.number,
  min_xp: PropTypes.number,
  image_url: PropTypes.string,
  is_active: PropTypes.bool,
});

// Pillar enum
export const pillarPropType = PropTypes.oneOf(['stem', 'wellness', 'communication', 'civics', 'art', 'ALL']);

// Common component props
export const childrenPropType = PropTypes.oneOfType([
  PropTypes.node,
  PropTypes.arrayOf(PropTypes.node),
]);

export const classNamePropType = PropTypes.string;

export const stylePropType = PropTypes.object;

export const onClickPropType = PropTypes.func;

// Navigation props
export const navigatePropType = PropTypes.func;

// Loading and error states
export const loadingPropType = PropTypes.bool;
export const errorPropType = PropTypes.oneOfType([
  PropTypes.string,
  PropTypes.shape({
    message: PropTypes.string,
    code: PropTypes.string,
  }),
]);

export default {
  userPropType,
  questPropType,
  taskPropType,
  badgePropType,
  pillarPropType,
  childrenPropType,
  classNamePropType,
  stylePropType,
  onClickPropType,
  navigatePropType,
  loadingPropType,
  errorPropType,
};
