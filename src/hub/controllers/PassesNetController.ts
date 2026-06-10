// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { PASS_ACTION_IDS } from "../../shared/SoccerTypes";
import { PassesNetEdge, PassesNetNode, PassesNetRendererCommand } from "../../shared/renderers/PassesNetRenderer";
import { readSoccerActions, readPlayerPositions, readRecentPasses, readPlayerAveragePositions } from "../../shared/soccer/SoccerLogReader";
import { createUUID } from "../../shared/util";
import TabController from "./TabController";

export default class PassesNetController implements TabController {
  UUID = createUUID();

  private TIME_RANGE: HTMLSelectElement;
  private TEAM_FILTER: HTMLSelectElement;
  private MIN_PASSES: HTMLInputElement;
  private SHOW_FAILED: HTMLInputElement;

  private avgPosCache: Map<number, { x: number; y: number; teamId: number }> | null = null;
  private avgPosCacheKey = "";

  constructor(root: HTMLElement) {
    this.TIME_RANGE   = root.getElementsByClassName("time-range")[0]       as HTMLSelectElement;
    this.TEAM_FILTER  = root.getElementsByClassName("team-filter")[0]      as HTMLSelectElement;
    this.MIN_PASSES   = root.getElementsByClassName("min-passes")[0]       as HTMLInputElement;
    this.SHOW_FAILED  = root.getElementsByClassName("show-failed-passes")[0] as HTMLInputElement;
  }

  saveState(): unknown {
    return {
      timeRange:   this.TIME_RANGE.value,
      teamFilter:  this.TEAM_FILTER.value,
      minPasses:   this.MIN_PASSES.value,
      showFailed:  this.SHOW_FAILED.checked
    };
  }

  restoreState(state: unknown): void {
    if (typeof state !== "object" || state === null) return;
    let s = state as any;
    if ("timeRange"  in s) this.TIME_RANGE.value    = s.timeRange;
    if ("teamFilter" in s) this.TEAM_FILTER.value   = s.teamFilter;
    if ("minPasses"  in s) this.MIN_PASSES.value    = s.minPasses;
    if ("showFailed" in s) this.SHOW_FAILED.checked = s.showFailed;
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

    // Average tracking positions — cached by [start, end]
    const cacheKey = `${start},${end}`;
    if (this.avgPosCacheKey !== cacheKey || this.avgPosCache === null) {
      this.avgPosCache    = readPlayerAveragePositions(start, end);
      this.avgPosCacheKey = cacheKey;
    }
    const avgPos = this.avgPosCache;

    let actions      = readSoccerActions(start, end);
    let teamFilterNum = this.TEAM_FILTER.value !== "all" ? parseInt(this.TEAM_FILTER.value) : -1;
    let minPasses    = Math.max(1, parseInt(this.MIN_PASSES.value) || 1);

    // Per-player action count (for node sizing)
    let actionCount = new Map<number, number>();
    for (const action of actions) {
      actionCount.set(action.playerId, (actionCount.get(action.playerId) ?? 0) + 1);
    }

    // Pass edges (successful) and failed pass edges
    let edgeCounts       = new Map<string, { from: number; to: number; count: number; teamId: number }>();
    let failedEdgeCounts = new Map<string, { from: number; to: number; count: number; teamId: number }>();
    let n = actions.length;

    for (let i = 0; i < n; i++) {
      const action = actions[i];
      if (!PASS_ACTION_IDS.includes(action.actionTypeId)) continue;
      if (teamFilterNum !== -1 && action.teamId !== teamFilterNum) continue;

      const positions = readPlayerPositions(action.timestamp);
      if (positions.length === 0) continue;

      let receiver: number | null = null;
      let bestDistSq = Infinity;
      for (const pos of positions) {
        if (pos.playerId === action.playerId) continue;
        const dx = pos.x - action.endX;
        const dy = pos.y - action.endY;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          receiver = pos.playerId;
        }
      }

      if (receiver === null || receiver === action.playerId) continue;
      if (!avgPos.has(action.playerId) || !avgPos.has(receiver)) continue;

      const key = `${action.playerId}-${receiver}`;
      const isSuccess = action.resultId === 1;
      const target = isSuccess ? edgeCounts : failedEdgeCounts;

      const existing = target.get(key);
      if (existing) {
        existing.count++;
      } else {
        target.set(key, { from: action.playerId, to: receiver, count: 1, teamId: action.teamId });
      }
    }

    // Build nodes from tracking positions
    let nodes: PassesNetNode[] = [];
    avgPos.forEach((pos, pid) => {
      if (teamFilterNum !== -1 && pos.teamId !== teamFilterNum) return;
      nodes.push({
        playerId:    pid,
        teamId:      pos.teamId,
        avgX:        pos.x,
        avgY:        pos.y,
        actionCount: actionCount.get(pid) ?? 0
      });
    });

    // Build edges
    let edges: PassesNetEdge[] = [];
    let failedEdges: PassesNetEdge[] = [];
    let maxEdgeCount = 0;

    edgeCounts.forEach((e) => {
      if (e.count >= minPasses) {
        edges.push({ fromPlayer: e.from, toPlayer: e.to, count: e.count, teamId: e.teamId });
        if (e.count > maxEdgeCount) maxEdgeCount = e.count;
      }
    });

    failedEdgeCounts.forEach((e) => {
      if (e.count >= minPasses) {
        failedEdges.push({ fromPlayer: e.from, toPlayer: e.to, count: e.count, teamId: e.teamId });
        if (e.count > maxEdgeCount) maxEdgeCount = e.count;
      }
    });

    // Live positions + fading arrows
    let renderTime    = window.selection.getRenderTime() ?? logRange[0];
    let livePositions = readPlayerPositions(renderTime);
    let recentPasses  = readRecentPasses(renderTime, FADE_SECONDS);

    if (teamFilterNum !== -1) {
      livePositions = livePositions.filter((p) => p.teamId === teamFilterNum);
      recentPasses  = recentPasses.filter((p)  => p.teamId === teamFilterNum);
    }

    return {
      nodes,
      edges,
      failedEdges,
      showFailedPasses: this.SHOW_FAILED.checked,
      maxEdgeCount,
      livePositions,
      recentPasses
    };
  }
}
