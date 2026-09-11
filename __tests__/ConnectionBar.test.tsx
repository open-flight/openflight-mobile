import { cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { ConnectionBar } from '../components/ConnectionBar';
import { socketService } from '../services/socket';
import { useSessionStore } from '../stores/useSessionStore';
import type { ConnectionState } from '../types';

// Deliberately different from DEFAULT_SERVER_URL below: the field starts at the
// default and is overwritten once the persisted read resolves, so waiting for
// this distinct value is what proves the async seed has actually landed.
const SEEDED_URL = 'http://192.168.1.50:8080';

// Pin the persisted-URL read so the field's seeded value is deterministic and
// these tests exercise the connection controls rather than storage.
jest.mock('../storage/connection', () => ({
  DEFAULT_SERVER_URL: 'http://192.168.1.100:8080',
  loadServerUrl: jest.fn(() => Promise.resolve('http://192.168.1.50:8080')),
  saveServerUrl: jest.fn(() => Promise.resolve()),
}));

// The socket service is exercised directly in socket.test.ts; here we only care
// that the bar wires the user's intent to it.
jest.mock('../services/socket', () => ({
  socketService: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    simulateShot: jest.fn(),
  },
}));

const mockedSocket = socketService as jest.Mocked<typeof socketService>;

const CONNECT = 'Connect to server';
const STOP = 'Stop connecting';
const FIELD = 'http://<pi-ip>:8080';

// render() and fireEvent are asynchronous in React Native Testing Library 14;
// every call is awaited so state is committed before the next assertion.
async function renderBar(connectionState: ConnectionState) {
  useSessionStore.setState({ connectionState, shots: [] });
  await render(<ConnectionBar />);
  if (connectionState !== 'connected') {
    // Wait out the mount-time persisted-URL read: without this the seeded value
    // can land after the test has typed and overwrite the input.
    await screen.findByDisplayValue(SEEDED_URL);
  }
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('ConnectionBar', () => {
  it('offers no way to cancel when idle', async () => {
    await renderBar('disconnected');
    expect(screen.queryByLabelText(STOP)).toBeNull();
  });

  it('lets the user stop an attempt that is still in flight', async () => {
    // Without this the only escape from an unreachable address was force-quitting:
    // Disconnect rendered solely while connected, so 'connecting' had no way out.
    await renderBar('connecting');

    await fireEvent.press(screen.getByLabelText(STOP));

    expect(mockedSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('lets the user stop the endless retries after a failed attempt', async () => {
    // Socket.IO retries a failed connection indefinitely by default, so the
    // error state needs the same escape hatch as the in-flight one.
    await renderBar('error');

    await fireEvent.press(screen.getByLabelText(STOP));

    expect(mockedSocket.disconnect).toHaveBeenCalledTimes(1);
  });

  it('connects to the address currently in the field', async () => {
    await renderBar('disconnected');

    await fireEvent.changeText(screen.getByPlaceholderText(FIELD), 'http://10.0.0.7:8080');
    await fireEvent.press(screen.getByLabelText(CONNECT));

    expect(mockedSocket.connect).toHaveBeenCalledWith('http://10.0.0.7:8080');
  });

  it('lets a mistyped address be corrected and retried without leaving the screen', async () => {
    await renderBar('disconnected');
    const field = screen.getByPlaceholderText(FIELD);

    await fireEvent.changeText(field, 'http://10.0.0.99:8080');
    await fireEvent.press(screen.getByLabelText(CONNECT));

    // The attempt is now in flight; the field stays editable and Connect stays
    // live, so the address can be corrected without waiting for a timeout.
    useSessionStore.setState({ connectionState: 'connecting' });
    await screen.findByLabelText(STOP);

    await fireEvent.changeText(screen.getByPlaceholderText(FIELD), 'http://10.0.0.7:8080');
    await fireEvent.press(screen.getByLabelText(CONNECT));

    expect(mockedSocket.connect).toHaveBeenCalledTimes(2);
    expect(mockedSocket.connect).toHaveBeenLastCalledWith('http://10.0.0.7:8080');
  });

  it('swaps the connect controls for session controls once connected', async () => {
    await renderBar('connected');

    expect(screen.queryByLabelText(STOP)).toBeNull();
    expect(screen.queryByPlaceholderText(FIELD)).toBeNull();
    expect(screen.getByText('Disconnect')).toBeTruthy();
    expect(screen.getByText('Simulate Shot')).toBeTruthy();
  });
});
