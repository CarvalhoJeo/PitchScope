// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import {
  PASS_ACTION_IDS,
  PITCH_HEIGHT_M,
  PITCH_WIDTH_M,
  SPADL_ACTION_TYPES,
  SPADL_BODYPART_TYPES,
  SPADL_RESULT_TYPES
} from "../SoccerTypes";

/** A single SPADL action event, fully typed. */
export interface SoccerAction {
  timestamp: number;
  periodId: number;
  teamId: number;
  playerId: number;
  actionTypeId: number;
  actionType: string;
  resultId: number;
  result: string;
  bodypartId: number;
  bodypart: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

/** A player's real-time position from tracking data. */
export interface PlayerPosition {
  playerId: number;
  teamId: number;
  x: number;
  y: number;
}

/**
 * A single pass event for the fading-arrow overlay.
 * age: 0.0 = just happened, 1.0 = about to disappear.
 */
export interface RecentPass {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  teamId: number;
  age: number;
}

/** Binary-search for the last stored value at or before timestamp t. */
function stepValueAt(data: { timestamps: number[]; values: number[] } | undefined, t: number): number {
  if (!data || data.timestamps.length === 0) return 0;
  let lo = 0, hi = data.timestamps.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (data.timestamps[mid] <= t) lo = mid; else hi = mid - 1;
  }
  return data.timestamps[lo] <= t ? data.values[lo] : 0;
}

/**
 * Reads all SPADL actions in [start, end].
 * Returns [] when no SPADL data is loaded.
 *
 * Uses /SPADL/seq as the canonical event-timestamp anchor because the log
 * deduplicates consecutive equal values — fields like result_id (all 1s) or
 * bodypart_id (all 0s) would otherwise collapse to a single entry.  seq
 * increments with every action so all N timestamps are preserved.
 */
export function readSoccerActions(start: number, end: number): SoccerAction[] {
  const seqData = window.log.getNumber("/SPADL/_seq", start, end);
  if (!seqData || seqData.timestamps.length === 0) return [];

  const periodIds   = window.log.getNumber("/SPADL/period_id",      start, end);
  const teamIds     = window.log.getNumber("/SPADL/team_id",        start, end);
  const playerIds   = window.log.getNumber("/SPADL/player_id",      start, end);
  const typeIds     = window.log.getNumber("/SPADL/action_type_id", start, end);
  const resultIds   = window.log.getNumber("/SPADL/result_id",      start, end);
  const bodypartIds = window.log.getNumber("/SPADL/bodypart_id",    start, end);
  const startXs     = window.log.getNumber("/SPADL/start_x",        start, end);
  const startYs     = window.log.getNumber("/SPADL/start_y",        start, end);
  const endXs       = window.log.getNumber("/SPADL/end_x",          start, end);
  const endYs       = window.log.getNumber("/SPADL/end_y",          start, end);

  return seqData.timestamps.map((t) => {
    const actionTypeId = stepValueAt(typeIds, t);
    const resultId     = stepValueAt(resultIds, t);
    const bodypartId   = stepValueAt(bodypartIds, t);
    return {
      timestamp:    t,
      periodId:     stepValueAt(periodIds, t),
      teamId:       stepValueAt(teamIds, t),
      playerId:     stepValueAt(playerIds, t),
      actionTypeId,
      actionType:   SPADL_ACTION_TYPES[actionTypeId]  ?? "unknown",
      resultId,
      result:       SPADL_RESULT_TYPES[resultId]      ?? "unknown",
      bodypartId,
      bodypart:     SPADL_BODYPART_TYPES[bodypartId]  ?? "unknown",
      startX:       stepValueAt(startXs, t),
      startY:       stepValueAt(startYs, t),
      endX:         stepValueAt(endXs, t),
      endY:         stepValueAt(endYs, t)
    };
  });
}

/** Collects player IDs from /TeamLocation/{id}/x field keys. */
export function getTrackedPlayerIds(): number[] {
  const playerIds: number[] = [];
  for (const key of window.log.getFieldKeys()) {
    if (key.startsWith("/TeamLocation/") && key.endsWith("/x")) {
      const parts = key.split("/");
      if (parts.length >= 4) {
        const id = Number(parts[2]);
        if (!isNaN(id)) playerIds.push(id);
      }
    }
  }
  return playerIds;
}

/**
 * Reads the latest known position of every tracked player at or before `time`.
 * Returns [] when no .tracking file is loaded.
 */
export function readPlayerPositions(time: number): PlayerPosition[] {
  const playerIds = getTrackedPlayerIds();
  if (playerIds.length === 0) return [];

  const positions: PlayerPosition[] = [];
  for (const playerId of playerIds) {
    const xData    = window.log.getNumber(`/TeamLocation/${playerId}/x`,       time, time);
    const yData    = window.log.getNumber(`/TeamLocation/${playerId}/y`,       time, time);
    const teamData = window.log.getNumber(`/TeamLocation/${playerId}/team_id`, time, time);
    if (!xData || xData.values.length === 0) continue;
    if (!yData || yData.values.length === 0) continue;
    positions.push({
      playerId,
      teamId: teamData && teamData.values.length > 0 ? teamData.values[teamData.values.length - 1] : 0,
      x: xData.values[xData.values.length - 1],
      y: yData.values[yData.values.length - 1]
    });
  }
  return positions;
}

/**
 * Reads a single player's tracked position at or before `time`.
 * Returns null when the player has no tracking sample yet.
 */
export function readTrackedPosition(playerId: number, time: number): { x: number; y: number; teamId: number } | null {
  const xData    = window.log.getNumber(`/TeamLocation/${playerId}/x`,       time, time);
  const yData    = window.log.getNumber(`/TeamLocation/${playerId}/y`,       time, time);
  const teamData = window.log.getNumber(`/TeamLocation/${playerId}/team_id`, time, time);
  if (!xData || xData.values.length === 0) return null;
  if (!yData || yData.values.length === 0) return null;
  return {
    x: xData.values[xData.values.length - 1],
    y: yData.values[yData.values.length - 1],
    teamId: teamData && teamData.values.length > 0 ? teamData.values[teamData.values.length - 1] : 0
  };
}

/** Median-filter radius for the current "Tracking Smoothing" preference (0 = off). */
export function getTrackingSmoothingRadius(): number {
  switch (window.preferences?.trackingSmoothing) {
    case "light":
      return 1; // 3-sample median
    case "medium":
      return 3; // 7-sample median
    default:
      return 0;
  }
}

/**
 * Median filter over a value series. A median (vs. moving average) removes
 * single-frame tracking outliers — the cause of "superhuman" speeds — without
 * smearing the real trajectory. Returns the input unchanged when radius <= 0.
 */
export function smoothSeries(values: number[], radius: number): number[] {
  if (radius <= 0 || values.length === 0) return values;
  const out = new Array<number>(values.length);
  const buffer: number[] = [];
  for (let i = 0; i < values.length; i++) {
    const lo = Math.max(0, i - radius);
    const hi = Math.min(values.length - 1, i + radius);
    buffer.length = 0;
    for (let j = lo; j <= hi; j++) buffer.push(values[j]);
    buffer.sort((a, b) => a - b);
    out[i] = buffer[Math.floor(buffer.length / 2)];
  }
  return out;
}

/**
 * Computes a player's distance covered and top speed over [start, end] from
 * tracking data. Coordinates (0–100) are converted to metres via the pitch
 * dimensions. A speed cap filters out tracking-noise spikes. Returns null when
 * the player has fewer than 2 tracking samples.
 */
export function readPlayerMovementStats(
  playerKey: string,
  start: number,
  end: number
): { distanceKm: number; topSpeedKmh: number; teamId: number } | null {
  const xData = window.log.getNumber(playerKey + "/x", start, end);
  const yData = window.log.getNumber(playerKey + "/y", start, end);
  const teamData = window.log.getNumber(playerKey + "/team_id", start, end);
  if (!xData || !yData) return null;
  const n = Math.min(xData.values.length, yData.values.length);
  if (n < 2) return null;

  const radius = getTrackingSmoothingRadius();
  const xs = smoothSeries(xData.values, radius);
  const ys = smoothSeries(yData.values, radius);

  const SPEED_CAP_KMH = 45; // realistic ceiling; rejects single-frame tracking glitches
  let distanceM = 0;
  let topSpeedKmh = 0;
  for (let i = 1; i < n; i++) {
    const dxm = ((xs[i] - xs[i - 1]) / 100) * PITCH_WIDTH_M;
    const dym = ((ys[i] - ys[i - 1]) / 100) * PITCH_HEIGHT_M;
    const step = Math.hypot(dxm, dym);
    distanceM += step;
    const dt = xData.timestamps[i] - xData.timestamps[i - 1];
    if (dt > 0) {
      const speedKmh = (step / dt) * 3.6;
      if (speedKmh > topSpeedKmh && speedKmh <= SPEED_CAP_KMH) topSpeedKmh = speedKmh;
    }
  }
  return {
    distanceKm: distanceM / 1000,
    topSpeedKmh,
    teamId: teamData && teamData.values.length > 0 ? teamData.values[teamData.values.length - 1] : 0
  };
}

/**
 * Bins every tracked (x, y) sample for a player over [start, end] into a
 * canvas-oriented density grid (gx from x, gy from flipped y), optionally
 * direction-normalized (180° mirror on even periods). Increments `grid` in
 * place and returns the number of samples added. Binning directly (rather than
 * materializing a points array) keeps heavy tracking data cheap to aggregate.
 * `playerKey` is the player base key, e.g. "/TeamLocation/7".
 */
export function binPlayerPositions(
  playerKey: string,
  start: number,
  end: number,
  normalize: boolean,
  grid: Float32Array,
  gridW: number,
  gridH: number
): number {
  const xData = window.log.getNumber(playerKey + "/x", start, end);
  const yData = window.log.getNumber(playerKey + "/y", start, end);
  if (!xData || xData.values.length === 0) return 0;
  if (!yData || yData.values.length === 0) return 0;

  const periodData = normalize ? window.log.getNumber("/SPADL/period_id", -Infinity, Infinity) : undefined;
  const n = Math.min(xData.values.length, yData.values.length);
  let added = 0;
  for (let i = 0; i < n; i++) {
    let x = xData.values[i];
    let y = yData.values[i];
    if (normalize && shouldFlipPeriod(stepValueAt(periodData, xData.timestamps[i]))) {
      x = 100 - x;
      y = 100 - y;
    }
    let gx = Math.floor((x / 100) * gridW);
    let gy = Math.floor((1 - y / 100) * gridH);
    if (gx < 0) gx = 0;
    else if (gx >= gridW) gx = gridW - 1;
    if (gy < 0) gy = 0;
    else if (gy >= gridH) gy = gridH - 1;
    grid[gy * gridW + gx]++;
    added++;
  }
  return added;
}

/**
 * Whether a period's coordinates should be mirrored onto the reference
 * attacking direction. Teams switch ends each half, so even periods (2nd half,
 * 2nd ET) are mirrored (x -> 100 - x). Period 0 (unknown/pre-match) is not.
 */
export function shouldFlipPeriod(period: number): boolean {
  return period > 0 && period % 2 === 0;
}

/**
 * Each tracked player's average position over the whole match, direction-
 * normalized: on even periods the pitch is rotated 180° (x -> 100 - x and
 * y -> 100 - y) so both halves share one attacking direction (otherwise the
 * halftime end-switch pulls everyone to the centre). Players with no tracking
 * samples are excluded.
 */
export function readPlayerNormalizedAveragePositions(): Map<number, { x: number; y: number; teamId: number }> {
  const result = new Map<number, { x: number; y: number; teamId: number }>();
  const playerIds = getTrackedPlayerIds();
  if (playerIds.length === 0) return result;

  const periodData = window.log.getNumber("/SPADL/period_id", -Infinity, Infinity);

  for (const playerId of playerIds) {
    const xData    = window.log.getNumber(`/TeamLocation/${playerId}/x`,       -Infinity, Infinity);
    const yData    = window.log.getNumber(`/TeamLocation/${playerId}/y`,       -Infinity, Infinity);
    const teamData = window.log.getNumber(`/TeamLocation/${playerId}/team_id`, -Infinity, Infinity);
    if (!xData || xData.values.length === 0) continue;
    if (!yData || yData.values.length === 0) continue;

    const n = Math.min(xData.values.length, yData.values.length);
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n; i++) {
      let x = xData.values[i];
      let y = yData.values[i];
      if (shouldFlipPeriod(stepValueAt(periodData, xData.timestamps[i]))) {
        x = 100 - x;
        y = 100 - y;
      }
      sumX += x;
      sumY += y;
    }
    result.set(playerId, {
      x: sumX / n,
      y: sumY / n,
      teamId: teamData && teamData.values.length > 0 ? teamData.values[teamData.values.length - 1] : 0
    });
  }
  return result;
}

/**
 * Computes each tracked player's average position over [start, end].
 * Uses all tracking samples in that range. Players with no samples are excluded.
 */
export function readPlayerAveragePositions(
  start: number,
  end: number
): Map<number, { x: number; y: number; teamId: number }> {
  const playerIds = getTrackedPlayerIds();
  const result = new Map<number, { x: number; y: number; teamId: number }>();
  if (playerIds.length === 0) return result;

  for (const playerId of playerIds) {
    const xData    = window.log.getNumber(`/TeamLocation/${playerId}/x`,       start, end);
    const yData    = window.log.getNumber(`/TeamLocation/${playerId}/y`,       start, end);
    const teamData = window.log.getNumber(`/TeamLocation/${playerId}/team_id`, start, end);

    if (!xData || xData.values.length === 0) continue;
    if (!yData || yData.values.length === 0) continue;

    const n = Math.min(xData.values.length, yData.values.length);
    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n; i++) {
      sumX += xData.values[i];
      sumY += yData.values[i];
    }

    result.set(playerId, {
      x: sumX / n,
      y: sumY / n,
      teamId: teamData && teamData.values.length > 0 ? teamData.values[teamData.values.length - 1] : 0
    });
  }

  return result;
}

/**
 * Returns the IDs of the starting players — those present on the pitch at
 * kickoff, inferred as players whose first tracking sample is at (or within a
 * small tolerance of) the match start. Substitutes, who appear later, are
 * excluded. Empty when there is no tracking data.
 */
export function getStartingPlayerIds(): Set<number> {
  const starters = new Set<number>();
  const playerIds = getTrackedPlayerIds();
  if (playerIds.length === 0) return starters;

  const [matchStart, matchEnd] = window.log.getTimestampRange();
  const span = matchEnd - matchStart;
  const edgeEps = Math.max(2, span * 0.005); // tolerance for "present at kickoff"

  for (const playerId of playerIds) {
    const timestamps = window.log.getTimestamps([`/TeamLocation/${playerId}/x`]);
    if (timestamps.length === 0) continue;
    if (timestamps[0] <= matchStart + edgeEps) starters.add(playerId);
  }
  return starters;
}

/**
 * Returns successful pass events in the window [currentTime - fadeSeconds, currentTime],
 * annotated with their age (0 = just happened, 1 = about to disappear).
 * Used to draw fading pass-trajectory arrows on the pitch.
 */
export function readRecentPasses(currentTime: number, fadeSeconds: number): RecentPass[] {
  const windowStart = currentTime - fadeSeconds;
  const actions = readSoccerActions(windowStart, currentTime);
  const passes: RecentPass[] = [];
  for (const action of actions) {
    if (!PASS_ACTION_IDS.includes(action.actionTypeId) || action.resultId !== 1) continue;
    const age = Math.max(0, Math.min(1, (currentTime - action.timestamp) / fadeSeconds));
    passes.push({
      startX: action.startX,
      startY: action.startY,
      endX:   action.endX,
      endY:   action.endY,
      teamId: action.teamId,
      age
    });
  }
  return passes;
}
