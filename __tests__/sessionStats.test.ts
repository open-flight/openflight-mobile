import { computeStats } from '../utils/sessionStats';
import type { Shot } from '../types';

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

describe('computeStats', () => {
  it('reports an empty session as zero rather than as no session', () => {
    // The kiosk's contract: counters read zero and only the two genuinely
    // optional measurements are null. The screen, not the maths, is what turns
    // this back into a dash on mobile.
    expect(computeStats([])).toEqual({
      shot_count: 0,
      avg_ball_speed: 0,
      max_ball_speed: 0,
      min_ball_speed: 0,
      avg_club_speed: null,
      avg_smash_factor: null,
      avg_carry_est: 0,
    });
  });

  it('describes a single shot by itself, with no spread', () => {
    const stats = computeStats([
      makeShot({
        ball_speed_mph: 148.2,
        estimated_carry_yards: 266,
        club_speed_mph: 104.1,
        smash_factor: 1.42,
      }),
    ]);

    expect(stats.shot_count).toBe(1);
    expect(stats.avg_ball_speed).toBeCloseTo(148.2, 10);
    expect(stats.max_ball_speed).toBeCloseTo(148.2, 10);
    expect(stats.min_ball_speed).toBeCloseTo(148.2, 10);
    expect(stats.avg_carry_est).toBe(266);
    expect(stats.avg_club_speed).toBeCloseTo(104.1, 10);
    expect(stats.avg_smash_factor).toBeCloseTo(1.42, 10);
    // One shot has no spread to describe; dividing by n-1 would divide by zero.
    expect(stats.std_dev).toBe(0);
  });

  it('averages, bounds and spreads a session of several shots', () => {
    const stats = computeStats([
      makeShot({ ball_speed_mph: 100, estimated_carry_yards: 200 }),
      makeShot({ ball_speed_mph: 110, estimated_carry_yards: 220 }),
      makeShot({ ball_speed_mph: 120, estimated_carry_yards: 240 }),
    ]);

    expect(stats.shot_count).toBe(3);
    expect(stats.avg_ball_speed).toBe(110);
    expect(stats.max_ball_speed).toBe(120);
    expect(stats.min_ball_speed).toBe(100);
    expect(stats.avg_carry_est).toBe(220);
    // Sample standard deviation: sqrt((100 + 0 + 100) / 2) = 10.
    expect(stats.std_dev).toBe(10);
  });

  it('spreads on the sample, not the population', () => {
    // Two shots 10 apart: the population figure would be 5, the sample figure
    // sqrt(50). Getting this wrong understates a session's consistency.
    const stats = computeStats([
      makeShot({ ball_speed_mph: 140 }),
      makeShot({ ball_speed_mph: 150 }),
    ]);

    expect(stats.std_dev).toBeCloseTo(Math.sqrt(50), 10);
  });

  it('reports no club speed at all when no shot measured one', () => {
    const stats = computeStats([
      makeShot({ club_speed_mph: null }),
      makeShot({ club_speed_mph: null }),
    ]);

    // Null, not zero: nothing was measured, which is not the same as a slow swing.
    expect(stats.avg_club_speed).toBeNull();
    expect(stats.shot_count).toBe(2);
  });

  it('averages club speed over only the shots that measured one', () => {
    const stats = computeStats([
      makeShot({ club_speed_mph: null }),
      makeShot({ club_speed_mph: 100 }),
      makeShot({ club_speed_mph: 110 }),
    ]);

    // 105, not 70: the unmeasured shot must not be counted as a zero.
    expect(stats.avg_club_speed).toBe(105);
  });

  it('averages smash factor over only the shots that have one', () => {
    const stats = computeStats([
      makeShot({ smash_factor: 1.4 }),
      makeShot({ smash_factor: null }),
      makeShot({ smash_factor: 1.5 }),
    ]);

    expect(stats.avg_smash_factor).toBeCloseTo(1.45, 10);
  });

  it('reports no smash factor at all when no shot has one', () => {
    const stats = computeStats([
      makeShot({ smash_factor: null }),
      makeShot({ smash_factor: null }),
    ]);

    expect(stats.avg_smash_factor).toBeNull();
  });

  it('keeps ball speed and carry whole even when the optional measurements are missing', () => {
    // A shot that arrived before enrichment still counts toward the figures it
    // does carry.
    const stats = computeStats([
      makeShot({
        ball_speed_mph: 140,
        estimated_carry_yards: 250,
        club_speed_mph: null,
        smash_factor: null,
      }),
      makeShot({
        ball_speed_mph: 150,
        estimated_carry_yards: 260,
        club_speed_mph: 104,
        smash_factor: 1.44,
      }),
    ]);

    expect(stats.avg_ball_speed).toBe(145);
    expect(stats.avg_carry_est).toBe(255);
    expect(stats.avg_club_speed).toBe(104);
    expect(stats.avg_smash_factor).toBeCloseTo(1.44, 10);
  });
});
