import { PhilosophyCard } from 'optio-design-system';
import { ClockIcon, ArrowTrendingUpIcon, HeartIcon } from '@heroicons/react/24/outline';

export const Pillars = () => (
  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
    <div style={{ width: 280 }}>
      <PhilosophyCard
        icon={ClockIcon}
        title="Learn Today"
        description="Each skill you build has immediate value. Your growth matters now."
        gradientClasses="from-purple-50 to-blue-50"
      />
    </div>
    <div style={{ width: 280 }}>
      <PhilosophyCard
        icon={ArrowTrendingUpIcon}
        title="Progress Over Perfection"
        description="Every attempt teaches. Mistakes are data. Forward is forward."
        gradientClasses="from-pink-50 to-purple-50"
      />
    </div>
    <div style={{ width: 280 }}>
      <PhilosophyCard
        icon={HeartIcon}
        title="Joy of Discovery"
        description="Follow curiosity, not credentials. Create because you want to."
        gradientClasses="from-purple-50 to-pink-50"
      />
    </div>
  </div>
);
