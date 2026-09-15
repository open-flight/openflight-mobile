import { ALL_CLUBS, CLUBS_BY_TYPE, getClubName } from '../data/clubs';

// Every id below is a literal value of `ClubType` in the server's
// `launch_monitor.py`. The server answers an unrecognized id with silence, so
// drift from the enum is invisible at runtime — these assertions are the only
// place it gets caught. Update them only alongside a real wire-contract change.
const EXPECTED_IDS = [
  '2-iron',
  '3-iron',
  '4-iron',
  '5-iron',
  '6-iron',
  '7-iron',
  '8-iron',
  '9-iron',
  'pw',
  'gw',
  'sw',
  'lw',
  '3-hybrid',
  '5-hybrid',
  '7-hybrid',
  '9-hybrid',
  'driver',
  '3-wood',
  '5-wood',
  '7-wood',
];

describe('ALL_CLUBS', () => {
  it('holds exactly the server club ids, in picker order', () => {
    expect(ALL_CLUBS.map((club) => club.id)).toEqual(EXPECTED_IDS);
  });

  it('omits the server\'s "unknown" fallback, which is not a selectable club', () => {
    expect(ALL_CLUBS.map((club) => club.id)).not.toContain('unknown');
  });

  it('has no duplicate ids', () => {
    const ids = ALL_CLUBS.map((club) => club.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(EXPECTED_IDS)('sends %p as a non-empty lowercase id', (id) => {
    expect(id).not.toBe('');
    expect(id).toBe(id.toLowerCase());
    expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it('gives every club a non-empty label and name', () => {
    for (const club of ALL_CLUBS) {
      expect(club.label).not.toBe('');
      expect(club.name).not.toBe('');
    }
  });
});

describe('CLUBS_BY_TYPE', () => {
  it('groups the clubs as Irons, Hybrids, then Woods', () => {
    expect(Object.keys(CLUBS_BY_TYPE)).toEqual(['Irons', 'Hybrids', 'Woods']);
  });

  it('flattens to ALL_CLUBS without dropping or reordering a group', () => {
    expect(Object.values(CLUBS_BY_TYPE).flat()).toEqual(ALL_CLUBS);
  });
});

describe('getClubName', () => {
  it('resolves a known id to its prose name', () => {
    expect(getClubName('7-iron')).toBe('7 Iron');
    expect(getClubName('pw')).toBe('Pitching Wedge');
    expect(getClubName('driver')).toBe('Driver');
  });

  it('falls back to the raw id for a club it does not know', () => {
    expect(getClubName('unknown')).toBe('unknown');
    expect(getClubName('42-iron')).toBe('42-iron');
  });

  it('falls back to the empty string rather than throwing on an empty id', () => {
    expect(getClubName('')).toBe('');
  });
});
