import { SafeAreaProvider } from 'react-native-safe-area-context';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react-native';
import ShotsScreen from '../app/(tabs)/shots';
import { useSessionStore } from '../stores/useSessionStore';
import type { Shot } from '../types';

// The repository is covered against a real database in shotRepository.test.ts;
// here it only has to hand the screen something to render.
jest.mock('../storage/db', () => {
  const loadSessions = jest.fn();
  const loadShots = jest.fn();
  return {
    getShotRepository: jest.fn(() => Promise.resolve({ loadSessions, loadShots })),
    __mock: { loadSessions, loadShots },
  };
});

// expo-router's useFocusEffect needs a navigator to drive it. Standing in for it
// here runs the effect on mount, as the real hook does, and keeps hold of it so
// a test can re-run it the way returning to the tab would.
jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { useEffect } = require('react');
  const state: { effect: (() => void | (() => void)) | null } = { effect: null };
  return {
    useFocusEffect: (effect: () => void | (() => void)) => {
      state.effect = effect;
      useEffect(() => effect(), [effect]);
    },
    __mock: state,
  };
});

const { loadSessions: mockLoadSessions, loadShots: mockLoadShots } = (
  jest.requireMock('../storage/db') as {
    __mock: { loadSessions: jest.Mock; loadShots: jest.Mock };
  }
).__mock;

const routerMock = (
  jest.requireMock('expo-router') as {
    __mock: { effect: (() => void | (() => void)) | null };
  }
).__mock;

// Re-runs the screen's focus effect, which is what returning to this tab does.
async function returnToTab() {
  await act(async () => {
    routerMock.effect?.();
  });
}

// The tab navigator supplies safe-area metrics in the app; this screen renders
// on its own here, so the provider is given fixed insets.
const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderScreen() {
  return render(
    <SafeAreaProvider initialMetrics={METRICS}>
      <ShotsScreen />
    </SafeAreaProvider>,
  );
}

function makeShot(overrides: Partial<Shot> = {}): Shot {
  return {
    shot_number: 1,
    ball_speed_mph: 148.2,
    club_speed_mph: 104.1,
    smash_factor: 1.42,
    estimated_carry_yards: 266,
    carry_spin_adjusted: null,
    carry_range: [258, 274],
    club: 'driver',
    profile_id: null,
    profile_name: null,
    timestamp: '2026-09-14T10:00:00Z',
    launch_angle_vertical: 12.4,
    launch_angle_horizontal: null,
    launch_angle_confidence: null,
    angle_source: null,
    club_angle_deg: null,
    club_path_deg: null,
    spin_axis_deg: null,
    spin_rpm: 2680,
    spin_source: 'measured',
    spin_quality: 'medium',
    ...overrides,
  };
}

const SESSION = {
  sessionId: 'newer',
  shotCount: 2,
  firstShotAt: '2026-09-14T09:00:00Z',
  lastShotAt: '2026-09-14T09:40:00Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  routerMock.effect = null;
  useSessionStore.setState({ connectionState: 'disconnected', sessionId: null, shots: [] });
  mockLoadSessions.mockResolvedValue([]);
  mockLoadShots.mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
});

describe('Shots screen', () => {
  it('lists stored sessions while the phone is nowhere near the simulator', async () => {
    // The point of keeping shots on the device: history with no connection.
    mockLoadSessions.mockResolvedValue([
      SESSION,
      {
        sessionId: 'older',
        shotCount: 3,
        firstShotAt: '2026-09-13T08:00:00Z',
        lastShotAt: '2026-09-13T08:15:00Z',
      },
    ]);

    await renderScreen();

    expect(useSessionStore.getState().connectionState).toBe('disconnected');
    expect(await screen.findByText('2 shots')).toBeTruthy();
    expect(screen.getByText('3 shots')).toBeTruthy();
  });

  it('opens a session and shows every metric the kiosk shows', async () => {
    // Mirrors the web ShotsPanel columns: Ball, Club, Launch, Spin, Carry.
    mockLoadSessions.mockResolvedValue([SESSION]);
    mockLoadShots.mockResolvedValue([
      makeShot({
        club: '7 iron',
        estimated_carry_yards: 165,
        ball_speed_mph: 118.4,
        spin_rpm: 6820,
      }),
      makeShot(),
    ]);

    await renderScreen();
    await fireEvent.press(await screen.findByText('2 shots'));

    expect(mockLoadShots).toHaveBeenCalledWith('newer');
    expect(await screen.findByText('7 iron')).toBeTruthy();
    for (const column of ['Ball', 'Club', 'Launch', 'Spin', 'Carry']) {
      expect(screen.getByText(column)).toBeTruthy();
    }
    expect(screen.getByText('118.4')).toBeTruthy();
    expect(screen.getByText('165')).toBeTruthy();
    expect(screen.getByText('6,820')).toBeTruthy();
  });

  it('summarises a session with the kiosk’s six stat tiles', async () => {
    mockLoadSessions.mockResolvedValue([SESSION]);
    mockLoadShots.mockResolvedValue([
      makeShot({
        ball_speed_mph: 140,
        estimated_carry_yards: 250,
        club_speed_mph: 100,
        smash_factor: 1.4,
      }),
      makeShot({
        ball_speed_mph: 150,
        estimated_carry_yards: 260,
        club_speed_mph: 104,
        smash_factor: 1.44,
      }),
    ]);

    await renderScreen();
    await fireEvent.press(await screen.findByText('2 shots'));

    for (const tile of ['Shots', 'Avg ball', 'Max ball', 'Avg carry', 'Avg club', 'Avg smash']) {
      expect(await screen.findByText(tile)).toBeTruthy();
    }
    // Scoped to the tile grid: a summary figure such as the session's best ball
    // speed is by definition also one of the rows listed beneath it.
    const tiles = within(screen.getByTestId('session-stats'));
    expect(tiles.getByText('145.0')).toBeTruthy(); // avg ball
    expect(tiles.getByText('150.0')).toBeTruthy(); // max ball
    expect(tiles.getByText('255')).toBeTruthy(); // avg carry
    expect(tiles.getByText('1.42')).toBeTruthy(); // avg smash
  });

  it('shows a dash where a measurement is missing rather than a zero', async () => {
    mockLoadSessions.mockResolvedValue([SESSION]);
    // The second shot is complete, so the Avg club tile stays numeric and the
    // only dashes on screen are the two missing cells in the first row.
    mockLoadShots.mockResolvedValue([
      makeShot({ club_speed_mph: null, spin_rpm: null }),
      makeShot(),
    ]);

    await renderScreen();
    await fireEvent.press(await screen.findByText('2 shots'));

    expect(await screen.findAllByText('—')).toHaveLength(2);
  });

  it('leaves the stat tiles blank for a session with nothing stored in it', async () => {
    // The shared aggregator reports zeroes for an empty session, the way the
    // kiosk does. Mobile still reads an absent measurement as a dash, so only
    // the shot count shows a figure here.
    mockLoadSessions.mockResolvedValue([SESSION]);
    mockLoadShots.mockResolvedValue([]);

    await renderScreen();
    await fireEvent.press(await screen.findByText('2 shots'));

    const tiles = within(await screen.findByTestId('session-stats'));
    expect(tiles.getByText('0')).toBeTruthy();
    expect(tiles.getAllByText('—')).toHaveLength(5);
  });

  it('names the player on each row so a shared session can be told apart', async () => {
    // Two people hitting in one bay produce a single session; the row has to
    // say whose shot it was.
    mockLoadSessions.mockResolvedValue([SESSION]);
    mockLoadShots.mockResolvedValue([
      makeShot({ shot_number: 1, club: '7 iron', profile_id: 'p1', profile_name: 'Alex' }),
      makeShot({ shot_number: 2, club: 'driver', profile_id: 'p2', profile_name: 'Sam' }),
    ]);

    await renderScreen();
    await fireEvent.press(await screen.findByText('2 shots'));

    expect(await screen.findByText(/Alex/)).toBeTruthy();
    expect(screen.getByText(/Sam/)).toBeTruthy();
  });

  it('goes back to the session list from an open session', async () => {
    mockLoadSessions.mockResolvedValue([SESSION]);
    mockLoadShots.mockResolvedValue([makeShot()]);

    await renderScreen();
    await fireEvent.press(await screen.findByText('2 shots'));
    await fireEvent.press(await screen.findByLabelText('Back to sessions'));

    expect(await screen.findByText('2 shots')).toBeTruthy();
  });

  it('says there is nothing stored yet instead of showing an empty list', async () => {
    // Same wording as the kiosk's empty state.
    mockLoadSessions.mockResolvedValue([]);

    await renderScreen();

    expect(await screen.findByText('No shots yet')).toBeTruthy();
    expect(screen.getByText('Recorded shots appear here')).toBeTruthy();
  });
});

describe('returning to the Shots tab', () => {
  it('picks up shots hit while the Live tab was in front', async () => {
    // Reading history only on mount meant a session recorded during this launch
    // stayed invisible until the app was restarted.
    mockLoadSessions.mockResolvedValue([]);
    await renderScreen();
    expect(await screen.findByText('No shots yet')).toBeTruthy();

    mockLoadSessions.mockResolvedValue([SESSION]);
    await returnToTab();

    expect(await screen.findByText('2 shots')).toBeTruthy();
  });

  it('re-reads history on every visit, not just the first', async () => {
    mockLoadSessions.mockResolvedValue([SESSION]);

    await renderScreen();
    expect(await screen.findByText('2 shots')).toBeTruthy();
    expect(mockLoadSessions).toHaveBeenCalledTimes(1);

    await returnToTab();

    expect(mockLoadSessions).toHaveBeenCalledTimes(2);
  });
});
