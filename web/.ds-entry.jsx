// Design-system entry for /design-sync. Re-exports the v1 web UI library so
// every component lands on window.OptioUI for the Claude Design bundle.
export * from './src/components/ui/index.js';
export { default as Button } from './src/components/ui/Button.jsx';
export { default as StatusBadge } from './src/components/ui/StatusBadge.jsx';
export { default as PhilosophyCard, PhilosophySection } from './src/components/ui/PhilosophyCard.jsx';
export { SkeletonCard, SkeletonDiplomaHeader, SkeletonStats } from './src/components/ui/Skeleton.jsx';
