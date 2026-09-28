// Shown while the AI writes the student's tasks. Generation takes about ten
// seconds and nothing else on the page moves, so a bare "Generating..." button
// reads as frozen. The stage text is paced to the typical run, not reported by
// the server, and the bar eases towards the end without ever reaching it.
import React, { useEffect, useState } from 'react';

const STAGES = [
  { at: 0, text: 'Reading your interests...' },
  { at: 2500, text: 'Matching tasks to your subjects...' },
  { at: 5000, text: 'Writing your tasks...' },
  { at: 7500, text: 'Setting XP and success criteria...' },
  { at: 10500, text: 'Almost there...' },
];

const TICK_MS = 250;

const GenerationProgress = ({ embedded }) => {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => setElapsed(Date.now() - started), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const stage = [...STAGES].reverse().find(s => elapsed >= s.at);
  // About 85% at ten seconds, creeping on from there and never reaching 100%.
  const percent = 95 * (1 - Math.exp(-elapsed / 5000));

  return (
    <div
      role="status"
      aria-live="polite"
      className={`bg-optio-purple/5 border border-optio-purple/20 ${embedded ? 'mb-3 p-3 rounded-lg' : 'mb-4 p-4 rounded-xl'}`}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="w-4 h-4 border-2 border-optio-purple/30 border-t-optio-purple rounded-full animate-spin shrink-0" />
        <span className={`font-semibold text-gray-800 ${embedded ? 'text-xs' : 'text-sm'}`}>
          {stage.text}
        </span>
      </div>
      <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-primary rounded-full transition-all duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
};

export default GenerationProgress;
