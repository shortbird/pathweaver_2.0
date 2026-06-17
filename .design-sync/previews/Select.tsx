import { Select } from 'optio-design-system';

const pillars = [
  { value: 'stem', label: 'STEM' },
  { value: 'wellness', label: 'Wellness' },
  { value: 'art', label: 'Art' },
  { value: 'civics', label: 'Civics' },
  { value: 'communication', label: 'Communication' },
];

export const WithOptions = () => (
  <div style={{ width: 360 }}>
    <Select placeholder="Choose a pillar" options={pillars} defaultValue="" />
  </div>
);

export const Selected = () => (
  <div style={{ width: 360 }}>
    <Select options={pillars} defaultValue="art" />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 360 }}>
    <Select options={pillars} defaultValue="stem" disabled />
  </div>
);
