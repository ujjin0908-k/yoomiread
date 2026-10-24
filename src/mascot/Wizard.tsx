import type { Mood } from './mood';

/** The wizard poses (the owner's own pictures, with transparent backgrounds), one per mood. */
const POSE: Record<Mood, string> = {
  happy: '/wizard/wizard_happy.png',
  idle: '/wizard/wizard_idle.png',
  sad: '/wizard/wizard_sad.png',
  high: '/wizard/wizard_smoking.png',
};

export function Wizard({ mood, size = 64 }: { mood: Mood; size?: number }) {
  return (
    <img
      className={`wizard wizard-${mood}`}
      src={POSE[mood]}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
      draggable={false}
    />
  );
}
