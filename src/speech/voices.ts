/**
 * Kokoro's English voices, with the grade Kokoro's makers give each one (A is best). Ids are what the model takes.
 * American (en-us) and British (en-gb), women and men. Best first.
 */
export interface Voice {
  id: string;
  name: string;
  accent: 'American' | 'British';
  gender: 'Woman' | 'Man';
  grade: string;
}

const v = (id: string, name: string, grade: string): Voice => ({
  id,
  name,
  accent: id.startsWith('b') ? 'British' : 'American',
  gender: id[1] === 'f' ? 'Woman' : 'Man',
  grade,
});

export const VOICES: Voice[] = [
  v('af_heart', 'Heart', 'A'),
  v('af_bella', 'Bella', 'A-'),
  v('af_nicole', 'Nicole', 'B-'),
  v('bf_emma', 'Emma', 'B-'),
  v('am_fenrir', 'Fenrir', 'C+'),
  v('am_michael', 'Michael', 'C+'),
  v('am_puck', 'Puck', 'C+'),
  v('af_aoede', 'Aoede', 'C+'),
  v('af_kore', 'Kore', 'C+'),
  v('af_sarah', 'Sarah', 'C+'),
  v('bm_fable', 'Fable', 'C'),
  v('bm_george', 'George', 'C'),
  v('bf_isabella', 'Isabella', 'C'),
  v('af_alloy', 'Alloy', 'C'),
  v('af_nova', 'Nova', 'C'),
  v('af_sky', 'Sky', 'C-'),
  v('bm_lewis', 'Lewis', 'D+'),
  v('am_echo', 'Echo', 'D'),
  v('am_eric', 'Eric', 'D'),
  v('am_liam', 'Liam', 'D'),
  v('am_onyx', 'Onyx', 'D'),
  v('bm_daniel', 'Daniel', 'D'),
  v('bf_alice', 'Alice', 'D'),
  v('bf_lily', 'Lily', 'D'),
  v('af_jessica', 'Jessica', 'D'),
  v('af_river', 'River', 'D'),
];

export const voiceById = (id: string) => VOICES.find((x) => x.id === id);

/** What a voice says when tried out in the picker. */
export const SAMPLE_LINE = "My name is Cheng Shi, and I never lie. You just haven't been fooled by me yet.";
