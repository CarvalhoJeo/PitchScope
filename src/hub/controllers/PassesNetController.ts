// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { PASS_ACTION_IDS } from "../../shared/SoccerTypes";
import { PassesNetEdge, PassesNetNode, PassesNetRendererCommand } from "../../shared/renderers/PassesNetRenderer";
import { readSoccerActions, readPlayerPositions, readRecentPasses } from "../../shared/soccer/SoccerLogReader";
import { createUUID } from "../../shared/util";
import TabController from "./TabController";

export default class PassesNetController implements TabController {
  UUID = createUUID();

  private TIME_RANGE: HTMLSelectElement;
  private TEAM_FILTER: HTMLSelectElement;
  private MIN_PASSES: HTMLInputElement;

  constructor(root: HTMLElement) {
    this.TIME_RANGE = root.getElementsByClassName("time-range")[0] as HTMLSelectElement;
    this.TEAM_FILTER = root.getElementsByClassName("team-filter")[0] as HTMLSelectElement;
    this.MIN_PASSES = root.getElementsByClassName("min-passes")[0] as HTMLInputElement;
  }

  saveState(): unknown {
    return {
      timeRange: this.TIME_RANGE.value,
      teamFilter: this.TEAM_FILTER.value,
      minPasses: this.MIN_PASSES.value
    };
  }

  restoreState(state: unknown): void {
    if (typeof state !== "object" || state === null) return;
    let s = state as any;
    if ("timeRange" in s) this.TIME_RANGE.value = s.timeRange;
    if ("teamFilter" in s) this.TEAM_FILTER.value = s.teamFilter;
    if ("minPasses" in s) this.MIN_PASSES.value = s.minPasses;
  }

  refresh(): void {}

  newAssets(): void {}

  getActiveFields(): string[] {
    return ["/SPADL", "/TeamLocation"];
  }

  showTimeline(): boolean {
    return true;
  }

  getCommand(): PassesNetRendererCommand {
    const FADE_SECONDS = 5;

    let logRange = window.log.getTimestampRange();
    let [start, end]: [number, number] =
      this.TIME_RANGE.value === "visible" ? window.selection.getTimelineRange() : [logRange[0], logRange[1]];

    let actions = readSoccerActions(start, end);
    let teamFilterNum = this.TEAM_FILTER.value !== "all" ? parseInt(this.TEAM_FILTER.value) : -1;
    let minPasses = Math.max(1, parseInt(this.MIN_PASSES.value) || 1);

    // Per-player position averages from SPADL
    let playerSumX  = new Map<number, number>();
    let playerSumY  = new Map<number, number>();
    let playerCount = new Map<number, number>();
    let playerTeam  = new Map<number, number>();

    for (const action of actions) {
      const { playerId: pid, teamId: tid, startX: sx, startY: sy } = action;
      playerSumX.set(pid, (playerSumX.get(pid) ?? 0) + sx);
      playerSumY.set(pid, (playerSumY.get(pid) ?? 0) + sy);
      playerCount.set(pid, (playerCount.get(pid) ?? 0) + 1);
      playerTeam.set(pid, tid);
    }

    // Pass edges
    let edgeCounts = new Map<string, { from: number; to: number; count: number; teamId: number }>();
    let n = actions.length;
    for (let i = 0; i < n; i++) {
      const action = actions[i];
      if (!PASS_ACTION_IDS.includes(action.actionTypeId) || action.resultId !== 1) continue;
      if (teamFilterNum !== -1 && action.teamId !== teamFilterNum) continue;

      let receiver: number | null = null;
      for (let j = i + 1; j < n; j++) {
        if (actions[j].periodId !== action.periodId) continue;
        if (actions[j].teamId !== action.teamId) break;
        receiver = actions[j].playerId;
        break;
      }

      if (receiver !== null && receiver !== action.playerId) {
        let key = `${action.playerId}-${receiver}`;
        let existing = edgeCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          edgeCounts.set(key, { from: action.playerId, to: receiver, count: 1, teamId: action.teamId });
        }
      }
    }

    let nodes: PassesNetNode[] = [];
    playerSumX.forEach((sumX, pid) => {
      let cnt = playerCount.get(pid) ?? 1;
      let tid = playerTeam.get(pid) ?? 0;
      if (teamFilterNum !== -1 && tid !== teamFilterNum) return;
      nodes.push({
        playerId: pid,
        teamId: tid,
        avgX: sumX / cnt,
        avgY: (playerSumY.get(pid) ?? 0) / cnt,
        actionCount: cnt
      });
    });

    let edges: PassesNetEdge[] = [];
    let maxEdgeCount = 0;
    edgeCounts.forEach((e) => {
      if (e.count >= minPasses) {
        edges.push({ fromPlayer: e.from, toPlayer: e.to, count: e.count, teamId: e.teamId });
        if (e.count > maxEdgeCount) maxEdgeCount = e.count;
      }
    });

    // Live positions (tracking) + fading pass arrows (SPADL)
    let renderTime = window.selection.getRenderTime() ?? logRange[0];
    let livePositions = readPlayerPositions(renderTime);
    let recentPasses  = readRecentPasses(renderTime, FADE_SECONDS);

    if (teamFilterNum !== -1) {
      livePositions = livePositions.filter((p) => p.teamId === teamFilterNum);
      recentPasses  = recentPasses.filter((p)  => p.teamId === teamFilterNum);
    }

    return { nodes, edges, maxEdgeCount, livePositions, recentPasses };
  }
}
