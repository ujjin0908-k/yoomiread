import { describe, expect, it } from 'vitest';
import { speakersOfChapter, type CastMember } from './logic';

const cast: CastMember[] = [
  { id: 'hu', names: ['Hu Yu', '胡羽'], gender: 'he' },
  { id: 'lin', names: ['Lin Xue', '林雪'], gender: 'she' },
  { id: 'chen', names: ['Chen Chong'], gender: 'he' },
];

describe('speakersOfChapter: following a conversation', () => {
  it('still finds a name by the speech', () => {
    expect(speakersOfChapter(['“Run,” Hu Yu said.'], cast)).toEqual(['hu']);
  });

  it('gives "he said" and "she said" to the last person of that gender', () => {
    const paras = ['Hu Yu and Lin Xue reached the gate.', '“Why?” he asked.', '“Because I said so,” she said.', 'She turned away. “Go.”'];
    expect(speakersOfChapter(paras, cast)).toEqual([undefined, 'hu', 'lin', 'lin']);
  });

  it('alternates untagged lines between the two people talking', () => {
    const paras = ['“That makes no sense,” Hu Yu said.', '“It will,” Lin Xue said.', '“When?”', '“Soon.”', '“Promise?”'];
    expect(speakersOfChapter(paras, cast)).toEqual(['hu', 'lin', 'hu', 'lin', 'hu']);
  });

  it('gives "I said" to the narrator once the reader has chosen one, and to nobody before', () => {
    const paras = ['“I told you,” I said.', 'I shook my head. “No.”'];
    expect(speakersOfChapter(paras, cast)).toEqual([undefined, undefined]);
    expect(speakersOfChapter(paras, cast, 'chen')).toEqual(['chen', 'chen']);
  });

  it('does not take the person looked at for the speaker', () => {
    const paras = ['Chen Chong walked in.', 'He looked at Hu Yu. “You first.”'];
    expect(speakersOfChapter(paras, cast)).toEqual([undefined, 'chen']);
  });

  it('gives speech alone to the person the narration just before was about', () => {
    const paras = ['Lin Xue set down her cup and stood.', '“Let’s go.”'];
    expect(speakersOfChapter(paras, cast)).toEqual([undefined, 'lin']);
  });

  it('stops guessing once a line has nobody', () => {
    // Three people: the alternation cannot know, so no faces after the unknown line.
    const paras = ['“Hi,” Hu Yu said.', '“Hello,” Lin Xue said.', '“Hey,” someone called from the door.', '“Who’s there?”'];
    expect(speakersOfChapter(paras, cast)).toEqual(['hu', 'lin', undefined, undefined]);
  });

  it('reads Chinese pronouns', () => {
    const paras = ['胡羽走进大殿。', '他冷声道：“退下。”', '林雪看着他。', '她说：“不。”'];
    expect(speakersOfChapter(paras, cast)).toEqual([undefined, 'hu', undefined, 'lin']);
  });

  it('leaves narration without speech alone', () => {
    expect(speakersOfChapter(['Hu Yu said nothing at all for a while.'], cast)).toEqual([undefined]);
  });
});

describe('speakersOfChapter: not guessing when someone outside the cast talks', () => {
  it('keeps the same speaker when a speech runs on into the next paragraph', () => {
    const paras = ['“It came down slowly,” Hu Yu said. “And then I walked for days.', '“At last I found the city.”'];
    expect(speakersOfChapter(paras, cast)).toEqual(['hu', 'hu']);
  });

  it('gives no face to "replied the old woman"', () => {
    const paras = ['Lin Xue looked up.', '“No,” replied the old woman, “but she may.”'];
    expect(speakersOfChapter(paras, cast)).toEqual([undefined, undefined]);
  });

  it('gives no face to "he said" when a name the glossary does not know is acting', () => {
    const paras = ['Hu Yu waited.', 'When Boq saw the shoes he said, “You must be a sorceress.”'];
    expect(speakersOfChapter(paras, cast)).toEqual([undefined, undefined]);
  });

  it('gives no face to speech after narration about someone unnamed', () => {
    const paras = ['Lin Xue ran after her, but the china girl cried out:', '“Don’t chase me!”'];
    expect(speakersOfChapter(paras, cast)).toEqual([undefined, undefined]);
  });

  it('knows places and groups are not strangers', () => {
    const paras = ['Hu Yu reached the Azure Sect.', 'In the Azure Sect he said, “We rest here.”'];
    expect(speakersOfChapter(paras, cast, undefined, ['Azure Sect'])).toEqual([undefined, 'hu']);
  });
});
