import { motionOk } from '../motion';
import type { Mood } from './mood';

/** The cat in the wizard hat (the owner's own pictures, in public/mascot/), one pose per mood. */
const POSE: Record<Mood, string> = {
  happy: 'cat-happy',
  idle: 'cat-idle',
  sad: 'cat-sad',
  high: 'cat-high',
};

/**
 * Each pose is a short animated picture. When animations are off (Settings, or the phone's own
 * "Reduce Motion"), the still version of the same pose is shown instead.
 */
export function Wizard({ mood, size = 64 }: { mood: Mood; size?: number }) {
  const src = `/mascot/${POSE[mood]}.${motionOk() ? 'gif' : 'png'}`;
  return (
    <span className={`wizard-wrap mood-${mood}`} style={{ width: size, height: size }}>
      <img className="wizard" src={src} alt="" width={size} height={size} style={{ objectFit: 'contain' }} draggable={false} />
    </span>
  );
}
