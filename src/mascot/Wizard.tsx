import type { Mood } from './mood';

/** The wizard poses (the owner's own pictures, with transparent backgrounds), one per mood. */
const POSE: Record<Mood, string> = {
  happy: '/wizard/wizard_happy.png',
  idle: '/wizard/wizard_idle.png',
  sad: '/wizard/wizard_sad.png',
  high: '/wizard/wizard_smoking.png',
};

/**
 * The picture moves in a few steps, like a little game sprite, with pixel sparkles, tears or smoke for
 * each mood. All drawn in CSS around the owner's picture; the picture itself is not changed.
 */
export function Wizard({ mood, size = 64 }: { mood: Mood; size?: number }) {
  return (
    <span className={`wizard-wrap mood-${mood}`} style={{ width: size, height: size, ['--u' as string]: `${Math.max(2, Math.round(size / 32))}px` }}>
      <span className="wizard-shadow" aria-hidden="true" />
      <img className={`wizard wizard-${mood}`} src={POSE[mood]} alt="" width={size} height={size} style={{ objectFit: 'contain' }} draggable={false} />
      <span className="wizard-fx" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}
