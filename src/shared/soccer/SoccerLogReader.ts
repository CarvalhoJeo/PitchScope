// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { PASS_ACTION_IDS, SPADL_ACTION_TYPES, SPADL_BODYPART_TYPES, SPADL_RESULT_TYPES } from "../SoccerTypes";

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

/**
 * Reads all SPADL actions in [start, end].
 * Returns [] when no SPADL data is loaded.
 */
export function readSoccerActions(start: number, end: number): SoccerAction[] {
  const actionTypeIds = window.log.getNumber("/SPADL/action_type_id", start, end);
  if (!actionTypeIds || actionTypeIds.timestamps.length === 0) return [];

  const n = actionTypeIds.timestamps.length;
  const periodIds   = window.log.getNumber("/SPADL/period_id",   start, end);
  const teamIds     = window.log.getNumber("/SPADL/team_id",     start, end);
  const playerIds   = window.log.getNumber("/SPADL/player_id",   start, end);
  const resultIds   = window.log.getNumber("/SPADL/result_id",   start, end);
  const bodypartIds = window.log.getNumber("/SPADL/bodypart_id", start, end);
  const startXs     = window.log.getNumber("/SPADL/start_x",     start, end);
  const startYs     = window.log.getNumber("/SPADL/start_y",     start, end);
  const endXs       = window.log.getNumber("/SPADL/end_x",       start, end);
  const endYs       = window.log.getNumber("/SPADL/end_y",       start, end);

  const safeN = Math.min(
    n,
    teamIds?.values.length     ?? n,
    playerIds?.values.length   ?? n,
    resultIds?.values.length   ?? n,
    bodypartIds?.values.length ?? n,
    startXs?.values.length     ?? n,
    startYs?.values.length     ?? n,
    endXs?.values.length       ?? n,
    endYs?.values.length       ?? n
  );

  const actions: SoccerAction[] = new Array(safeN);
  for (let i = 0; i < safeN; i++) {
    const actionTypeId = actionTypeIds.values[i];
    const resultId     = resultIds?.values[i]   ?? 0;
    const bodypartId   = bodypartIds?.values[i] ?? 0;
    actions[i] = {
      timestamp:    actionTypeIds.timestamps[i],
      periodId:     periodIds?.values[i]   ?? 0,
      teamId:       teamIds?.values[i]     ?? 0,
      playerId:     playerIds?.values[i]   ?? 0,
      actionTypeId,
      actionType:   SPADL_ACTION_TYPES[actionTypeId]  ?? "unknown",
      resultId,
      result:       SPADL_RESULT_TYPES[resultId]      ?? "unknown",
      bodypartId,
      bodypart:     SPADL_BODYPART_TYPES[bodypartId]  ?? "unknown",
      startX:       startXs?.values[i]  ?? 0,
      startY:       startYs?.values[i]  ?? 0,
      endX:         endXs?.values[i]    ?? 0,
      endY:         endYs?.values[i]    ?? 0
    };
  }
  return actions;
}

/** Collects player IDs from /TeamLocation/{id}/x field keys. */
function getTrackedPlayerIds(): number[] {
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
 * Computes each tracked player's average position over [start, end].
 * Uses all tracking samples in that range. Players with no samples are excluded.
 */
export function readPlayerAveragePositions(
  start: number,
  end: number
): Map<number, { x: number; y: number; teamId: number }> {
  const playerIds = getTrackedPlayerIds();
  const result = new Map<number, { x: number; y: number; teamId: number }>();

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
      teamId: teamData && teamData.values.length > 0 ? teamData.values[0] : 0
    });
  }

  return result;
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
