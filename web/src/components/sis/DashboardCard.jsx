/**
 * A tile on an SIS dashboard: white card, optional title row with an action
 * on the right, then whatever the tile holds.
 *
 * The admin, coordinator and teacher dashboards each defined their own Card
 * with the same markup and a different padding; a tile that moved between
 * them changed shape (docs/icreate/FRANKENSTEIN_AUDIT_2026-09-17.md, G-6).
 * One card, three dashboards. `className` is for layout (a masonry column's
 * break rules), not for restyling the card.
 */
const DashboardCard = ({ title, action, children, className = '' }) => (
  <div className={`bg-white rounded-xl border border-gray-200 p-5 ${className}`}>
    {(title || action) && (
      <div className="flex items-center justify-between gap-3 mb-3">
        {title && <h2 className="font-semibold text-neutral-900">{title}</h2>}
        {action}
      </div>
    )}
    {children}
  </div>
)

export default DashboardCard
