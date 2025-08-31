import React from 'react';

const Skeleton = ({ className = '', variant = 'text', width, height, count = 1 }) => {
  const baseClasses = 'animate-pulse bg-gray-200 rounded';
  
  const variants = {
    text: 'h-4 rounded',
    title: 'h-6 rounded',
    rectangular: 'rounded-lg',
    circular: 'rounded-full',
    card: 'rounded-xl'
  };

  const defaultSizes = {
    text: { height: '1rem', width: '100%' },
    title: { height: '1.5rem', width: '100%' },
    rectangular: { height: '10rem', width: '100%' },
    circular: { height: '3rem', width: '3rem' },
    card: { height: '15rem', width: '100%' }
  };

  const size = defaultSizes[variant];
  const style = {
    width: width || size.width,
    height: height || size.height
  };

  if (count > 1) {
    return (
      <div className="space-y-2">
        {Array.from({ length: count }).map((_, index) => (
          <div
            key={index}
            className={`${baseClasses} ${variants[variant]} ${className}`}
            style={style}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`${baseClasses} ${variants[variant]} ${className}`}
      style={style}
    />
  );
};

// Composite skeleton components for common patterns
export const SkeletonCard = ({ className = '' }) => (
  <div className={`bg-white rounded-xl p-5 shadow-sm ${className}`}>
    <Skeleton variant="rectangular" height="8rem" className="mb-4" />
    <Skeleton variant="title" width="70%" className="mb-2" />
    <Skeleton variant="text" count={2} className="mb-3" />
    <div className="flex justify-between items-center">
      <Skeleton variant="text" width="30%" />
      <Skeleton variant="text" width="20%" />
    </div>
  </div>
);

export const SkeletonDiplomaHeader = () => (
  <div className="rounded-xl overflow-hidden mb-8 bg-gradient-to-r from-gray-200 to-gray-300 animate-pulse">
    <div className="p-12">
      <div className="text-center">
        <Skeleton variant="rectangular" width="200px" height="40px" className="mx-auto mb-6" />
        <Skeleton variant="title" width="400px" height="48px" className="mx-auto mb-3" />
        <Skeleton variant="title" width="250px" height="32px" className="mx-auto mb-4" />
        <Skeleton variant="text" width="300px" className="mx-auto" />
      </div>
    </div>
  </div>
);

export const SkeletonStats = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
    {[1, 2, 3].map((i) => (
      <div key={i} className="bg-white rounded-xl p-6 shadow-sm">
        <Skeleton variant="title" width="100px" height="40px" className="mb-2" />
        <Skeleton variant="text" width="150px" className="mb-1" />
        <Skeleton variant="text" width="200px" />
      </div>
    ))}
  </div>
);

export const SkeletonAchievementGrid = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
    {[1, 2, 3, 4, 5, 6].map((i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);

export default Skeleton;