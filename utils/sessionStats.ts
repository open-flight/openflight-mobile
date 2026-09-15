// Session aggregation, hand-mirrored from the kiosk's `computeStats` and
// `SessionStats` in ui/src/types/shot.ts in open-flight/openflight.
//
// The two are deliberately separate copies rather than a shared module: mobile
// does not import from the server or web-UI repositories at build time, so a
// change to the kiosk's aggregation has to be ported here by hand for both
// interfaces to keep describing a session the same way.
//
// The arithmetic is the kiosk's, zeroed counters for an empty session included.
// Rendering stays mobile's: this module returns numbers and nulls, and the
// screen decides how an absent measurement reads.

import type { Shot } from '../types';

export interface SessionStats {
  shot_count: number;
  avg_ball_speed: number;
  max_ball_speed: number;
  min_ball_speed: number;
  std_dev?: number;
  avg_club_speed: number | null;
  avg_smash_factor: number | null;
  avg_carry_est: number;
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

// Sample standard deviation, dividing by n-1. One shot has no spread to
// describe, so the kiosk reports 0 rather than dividing by zero.
function stdDev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1));
}

export function computeStats(shots: Shot[]): SessionStats {
  if (shots.length === 0) {
    return {
      shot_count: 0,
      avg_ball_speed: 0,
      max_ball_speed: 0,
      min_ball_speed: 0,
      avg_club_speed: null,
      avg_smash_factor: null,
      avg_carry_est: 0,
    };
  }

  const ballSpeeds = shots.map((shot) => shot.ball_speed_mph);
  // A shot can reach the device before the optional measurements are enriched,
  // so club speed and smash factor are averaged over the shots that have them
  // and report nothing at all when none do.
  const clubSpeeds = shots
    .map((shot) => shot.club_speed_mph)
    .filter((value): value is number => value !== null);
  const smashFactors = shots
    .map((shot) => shot.smash_factor)
    .filter((value): value is number => value !== null);
  const carries = shots.map((shot) => shot.estimated_carry_yards);

  return {
    shot_count: shots.length,
    avg_ball_speed: mean(ballSpeeds),
    max_ball_speed: Math.max(...ballSpeeds),
    min_ball_speed: Math.min(...ballSpeeds),
    std_dev: stdDev(ballSpeeds),
    avg_club_speed: clubSpeeds.length > 0 ? mean(clubSpeeds) : null,
    avg_smash_factor: smashFactors.length > 0 ? mean(smashFactors) : null,
    avg_carry_est: mean(carries),
  };
}
