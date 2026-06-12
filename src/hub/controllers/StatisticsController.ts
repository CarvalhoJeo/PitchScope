// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { INTERCEPTION_ACTION_ID, PASS_ACTION_IDS, SHOT_ACTION_IDS, TACKLE_ACTION_ID } from "../../shared/SoccerTypes";
import { StatisticsRendererCommand, StatisticsRow } from "../../shared/renderers/StatisticsRenderer";
import {
  getTrackedPlayerIds,
  getTrackingSmoothingRadius,
  readPlayerMovementStats,
  readSoccerActions
} from "../../shared/soccer/SoccerLogReader";
import { createUUID } from "../../shared/util";
import TabController from "./TabController";

type StatsCache = { key: string; rows: StatisticsRow[] };

export default class StatisticsController implements TabController {
  UUID = createUUID();

  private TEAM_FILTER: HTMLSelectElement;
  private TIME_RANGE: HTMLSelectElement;

  private cache: StatsCache | null = null;

  constructor(root: HTMLElement) {
    this.TEAM_FILTER = root.getElementsByClassName("team-filter")[0] as HTMLSelectElement;
    this.TIME_RANGE = root.getElementsByClassName("time-range")[0] as HTMLSelectElement;
  }

  saveState(): unknown {
    return { teamFilter: this.TEAM_FILTER.value, timeRange: this.TIME_RANGE.value };
  }

  restoreState(state: unknown): void {
    if (typeof state !== "object" || state === null) return;
    let s = state as any;
    if ("teamFilter" in s) this.TEAM_FILTER.value = s.teamFilter;
    if ("timeRange" in s) this.TIME_RANGE.value = s.timeRange;
  }

  refresh(): void {}

  newAssets(): void {}

  getActiveFields(): string[] {
    return ["/SPADL", "/TeamLocation"];
  }

  showTimeline(): boolean {
    return true;
  }

  getCommand(): StatisticsRendererCommand {
    let logRange = window.log.getTimestampRange();
    let [start, end]: [number, number] =
      this.TIME_RANGE.value === "visible" ? window.selection.getTimelineRange() : [logRange[0], logRange[1]];
    let teamFilter = this.TEAM_FILTER.value !== "all" ? parseInt(this.TEAM_FILTER.value) : -1;

    let key = `${start},${end},${teamFilter},${getTrackingSmoothingRadius()}`;
    if (this.cache === null || this.cache.key !== key) {
      this.cache = { key, rows: this.computeRows(start, end, teamFilter) };
    }
    return { rows: this.cache.rows };
  }

  private computeRows(start: number, end: number, teamFilter: number): StatisticsRow[] {
    let rows = new Map<number, StatisticsRow>();
    let getRow = (playerId: number, teamId: number): StatisticsRow => {
      let row = rows.get(playerId);
      if (row === undefined) {
        row = {
          playerId,
          teamId,
          touches: 0,
          passesCompleted: 0,
          passesAttempted: 0,
          shots: 0,
          tackles: 0,
          interceptions: 0,
          distanceKm: 0,
          topSpeedKmh: 0
        };
        rows.set(playerId, row);
      }
      if (row.teamId === 0) row.teamId = teamId;
      return row;
    };

    // Event stats from SPADL
    for (const action of readSoccerActions(start, end)) {
      if (teamFilter !== -1 && action.teamId !== teamFilter) continue;
      let row = getRow(action.playerId, action.teamId);
      row.touches++;
      if (PASS_ACTION_IDS.includes(action.actionTypeId)) {
        row.passesAttempted++;
        if (action.resultId === 1) row.passesCompleted++;
      }
      if (SHOT_ACTION_IDS.includes(action.actionTypeId)) row.shots++;
      if (action.actionTypeId === TACKLE_ACTION_ID) row.tackles++;
      if (action.actionTypeId === INTERCEPTION_ACTION_ID) row.interceptions++;
    }

    // Movement stats from tracking (also surfaces players with little on-ball action)
    for (const playerId of getTrackedPlayerIds()) {
      let movement = readPlayerMovementStats(`/TeamLocation/${playerId}`, start, end);
      if (movement === null) continue;
      if (teamFilter !== -1 && movement.teamId !== teamFilter) continue;
      let row = getRow(playerId, movement.teamId);
      row.distanceKm = movement.distanceKm;
      row.topSpeedKmh = movement.topSpeedKmh;
    }

    return Array.from(rows.values());
  }
}
