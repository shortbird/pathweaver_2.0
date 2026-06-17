import { StatusBadge } from 'optio-design-system';

export const AllStatuses = () => (
  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
    <StatusBadge status="pending" />
    <StatusBadge status="accepted" />
    <StatusBadge status="rejected" />
    <StatusBadge status="cancelled" />
    <StatusBadge status="blocked" />
  </div>
);
