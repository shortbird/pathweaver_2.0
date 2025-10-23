/**
 * Typography Configuration
 *
 * FONTS:
 * - Poppins: Headings and UI elements
 *   - Bold (700): Main headings
 *   - Semi-Bold (600): Subheadings
 *   - Medium (500): Body text, labels
 *
 * - Inter: Body text and secondary UI
 *   - Regular (400): Paragraph text
 *   - Medium (500): Emphasis
 *   - Semi-Bold (600): Strong emphasis
 *   - Bold (700): Very strong emphasis
 */

export const TYPOGRAPHY = {
  fonts: {
    heading: 'Poppins',
    body: 'Inter',
  },
  weights: {
    poppins: {
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    inter: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
  },
};
