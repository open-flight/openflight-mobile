import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { fontFamily } from '../../components/theme/fonts';
import { spacing, type Palette } from '../../components/theme/tokens';
import { useThemedStyles } from '../../components/theme/useTheme';
import { getShotRepository } from '../../storage/db';
import type { SessionSummary } from '../../storage/shotRepository';
import type { Shot } from '../../types';
import { computeStats, type SessionStats } from '../../utils/sessionStats';

// Shot history kept on the device, readable with no simulator in sight. The
// columns and stat tiles mirror the kiosk's Shots and Stats panels so both
// interfaces describe a session the same way.

// Matches the kiosk: speeds to one decimal, carry rounded, smash to two, and an
// em dash wherever a measurement is genuinely absent.
const MISSING = '—';

function speed(value: number | null): string {
  return value === null ? MISSING : value.toFixed(1);
}

function distance(value: number | null): string {
  return value === null ? MISSING : Math.round(value).toString();
}

function spin(value: number | null): string {
  return value === null ? MISSING : Math.round(value).toLocaleString('en-US');
}

function angle(value: number | null): string {
  return value === null ? MISSING : value.toFixed(1);
}

function sessionTitle(session: SessionSummary): string {
  const started = new Date(session.firstShotAt);
  return Number.isNaN(started.getTime())
    ? session.sessionId
    : started.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      });
}

function shotTime(timestamp: string): string {
  const at = new Date(timestamp);
  return Number.isNaN(at.getTime())
    ? timestamp
    : at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

// The aggregator reports zeroed counters for a session with no shots, as the
// kiosk does. Mobile reads an absent measurement as an em dash instead, so the
// zeroes are turned back into nothing here rather than in the maths.
function measured(stats: SessionStats, value: number): number | null {
  return stats.shot_count === 0 ? null : value;
}

function StatTile({ label, value }: { label: string; value: string }) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.tile}>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </View>
  );
}

function SessionStatsGrid({ stats }: { stats: SessionStats }) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.tiles} testID="session-stats">
      <StatTile label="Shots" value={String(stats.shot_count)} />
      <StatTile label="Avg ball" value={speed(measured(stats, stats.avg_ball_speed))} />
      <StatTile label="Max ball" value={speed(measured(stats, stats.max_ball_speed))} />
      <StatTile label="Avg carry" value={distance(measured(stats, stats.avg_carry_est))} />
      <StatTile label="Avg club" value={speed(stats.avg_club_speed)} />
      <StatTile
        label="Avg smash"
        value={stats.avg_smash_factor === null ? MISSING : stats.avg_smash_factor.toFixed(2)}
      />
    </View>
  );
}

function ShotRow({ shot }: { shot: Shot }) {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.rowClub}>{shot.club}</Text>
        {/* Two people sharing a bay land in one session, so whose shot it was
            has to be readable on the row itself. */}
        <Text style={styles.rowTime}>
          {shot.profile_name === null
            ? shotTime(shot.timestamp)
            : `${shotTime(shot.timestamp)} · ${shot.profile_name}`}
        </Text>
      </View>
      <Text style={styles.cell}>{speed(shot.ball_speed_mph)}</Text>
      <Text style={styles.cell}>{speed(shot.club_speed_mph)}</Text>
      <Text style={styles.cell}>{angle(shot.launch_angle_vertical)}</Text>
      <Text style={styles.cell}>{spin(shot.spin_rpm)}</Text>
      <Text style={styles.cell}>{distance(shot.estimated_carry_yards)}</Text>
    </View>
  );
}

function EmptyHistory() {
  const styles = useThemedStyles(createStyles);

  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>No shots yet</Text>
      <Text style={styles.emptyDetail}>Recorded shots appear here</Text>
    </View>
  );
}

export default function ShotsScreen() {
  const styles = useThemedStyles(createStyles);
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [openSession, setOpenSession] = useState<SessionSummary | null>(null);
  const [shots, setShots] = useState<Shot[] | null>(null);

  // History is re-read every time the tab regains focus, not only on mount: a
  // shot hit while the Live tab was in front has to show up here without
  // relaunching the app. The repository degrades to an empty list rather than
  // throwing, so there is no error branch to render.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void (async () => {
        const repository = await getShotRepository();
        const stored = await repository.loadSessions();
        if (active) setSessions(stored);
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const open = useCallback(async (session: SessionSummary) => {
    setOpenSession(session);
    setShots(null);
    const repository = await getShotRepository();
    setShots(await repository.loadShots(session.sessionId));
  }, []);

  if (openSession !== null) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => setOpenSession(null)}
            accessibilityRole="button"
            accessibilityLabel="Back to sessions"
          >
            <Text style={styles.back}>Sessions</Text>
          </TouchableOpacity>
          <Text style={styles.title}>{sessionTitle(openSession)}</Text>
        </View>

        {shots === null ? (
          <ActivityIndicator style={styles.loading} />
        ) : (
          <FlatList
            data={shots}
            keyExtractor={(shot, index) => `${shot.timestamp}-${index}`}
            ListHeaderComponent={
              <>
                {/* Summarised from the stored shots rather than from the
                    server's stats payload — that only ever describes the live
                    session. */}
                <SessionStatsGrid stats={computeStats(shots)} />
                <View style={styles.columns}>
                  <Text style={[styles.columnLabel, styles.columnShot]}>Shot</Text>
                  <Text style={styles.columnLabel}>Ball</Text>
                  <Text style={styles.columnLabel}>Club</Text>
                  <Text style={styles.columnLabel}>Launch</Text>
                  <Text style={styles.columnLabel}>Spin</Text>
                  <Text style={styles.columnLabel}>Carry</Text>
                </View>
              </>
            }
            renderItem={({ item }) => <ShotRow shot={item} />}
            ListEmptyComponent={<EmptyHistory />}
          />
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>Shots</Text>
      </View>

      {sessions === null ? (
        <ActivityIndicator style={styles.loading} />
      ) : (
        <FlatList
          data={sessions}
          keyExtractor={(session) => session.sessionId}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.session}
              onPress={() => void open(item)}
              accessibilityRole="button"
            >
              <View>
                <Text style={styles.sessionTitle}>{sessionTitle(item)}</Text>
                <Text style={styles.sessionDetail}>{shotTime(item.firstShotAt)}</Text>
              </View>
              <Text style={styles.sessionCount}>
                {item.shotCount} {item.shotCount === 1 ? 'shot' : 'shots'}
              </Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<EmptyHistory />}
        />
      )}
    </SafeAreaView>
  );
}

const createStyles = (c: Palette) =>
  StyleSheet.create({
    safe: {
      flex: 1,
      backgroundColor: c.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      paddingBottom: spacing.sm,
    },
    title: {
      fontSize: 24,
      fontFamily: fontFamily.bold,
      color: c.text,
    },
    back: {
      fontSize: 16,
      fontFamily: fontFamily.semibold,
      color: c.accentText,
      paddingVertical: spacing.sm,
    },
    loading: {
      marginTop: spacing.xl,
    },
    session: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 56,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderSoft,
    },
    sessionTitle: {
      fontSize: 16,
      fontFamily: fontFamily.semibold,
      color: c.text,
    },
    sessionDetail: {
      fontSize: 12,
      fontFamily: fontFamily.regular,
      color: c.textFaint,
    },
    sessionCount: {
      fontSize: 14,
      fontFamily: fontFamily.regular,
      color: c.textMuted,
    },
    tiles: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
    },
    tile: {
      width: '33.33%',
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.sm,
    },
    tileValue: {
      fontSize: 18,
      fontFamily: fontFamily.bold,
      color: c.text,
    },
    tileLabel: {
      fontSize: 11,
      fontFamily: fontFamily.regular,
      color: c.textMuted,
      textTransform: 'uppercase',
    },
    columns: {
      flexDirection: 'row',
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.xs,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    columnLabel: {
      flex: 1,
      fontSize: 11,
      fontFamily: fontFamily.regular,
      color: c.textFaint,
      textTransform: 'uppercase',
      textAlign: 'right',
    },
    columnShot: {
      flex: 1.6,
      textAlign: 'left',
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: 48,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.borderSoft,
    },
    rowHead: {
      flex: 1.6,
    },
    rowClub: {
      fontSize: 14,
      fontFamily: fontFamily.semibold,
      color: c.text,
    },
    rowTime: {
      fontSize: 11,
      fontFamily: fontFamily.regular,
      color: c.textFaint,
    },
    cell: {
      flex: 1,
      fontSize: 14,
      fontFamily: fontFamily.regular,
      color: c.text,
      textAlign: 'right',
    },
    empty: {
      alignItems: 'center',
      paddingTop: 48,
      gap: spacing.xs,
    },
    emptyTitle: {
      fontSize: 16,
      fontFamily: fontFamily.semibold,
      color: c.text,
    },
    emptyDetail: {
      fontSize: 13,
      fontFamily: fontFamily.regular,
      color: c.textMuted,
    },
  });
