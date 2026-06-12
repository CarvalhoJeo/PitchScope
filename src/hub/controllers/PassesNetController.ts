// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { PASS_ACTION_IDS } from "../../shared/SoccerTypes";
import { PassesNetEdge, PassesNetNode, PassesNetRendererCommand } from "../../shared/renderers/PassesNetRenderer";
import { getStartingPlayerIds, readSoccerActions, readTrackedPosition } from "../../shared/soccer/SoccerLogReader";
import { createUUID } from "../../shared/util";
import TabController from "./TabController";

type EdgeCount = { from: number; to: number; count: number; teamId: number };
type PassesNetData = { nodes: PassesNetNode[]; edgeCounts: Map<string, EdgeCount> };

export default class PassesNetController implements TabController {
  UUID = createUUID();

  private TEAM_FILTER: HTMLSelectElement;
  private MIN_PASSES: HTMLInputElement;

  // Cache for the heavy network computation (position sampling), keyed by
  // match range + team filter. Edge thresholding is applied cheaply later.
  private cache: PassesNetData | null = null;
  private cacheKey = "";

  constructor(root: HTMLElement) {
    this.TEAM_FILTER  = root.getElementsByClassName("team-filter")[0] as HTMLSelectElement;
    this.MIN_PASSES   = root.getElementsByClassName("min-passes")[0]  as HTMLInputElement;
  }

  saveState(): unknown {
    return {
      teamFilter: this.TEAM_FILTER.value,
      minPasses:  this.MIN_PASSES.value
    };
  }

  restoreState(state: unknown): void {
    if (typeof state !== "object" || state === null) return;
    let s = state as any;
    if ("teamFilter" in s) this.TEAM_FILTER.value   = s.teamFilter;
    if ("minPasses"  in s) this.MIN_PASSES.value    = s.minPasses;
  }

  refresh(): void {}

  newAssets(): void {}

  getActiveFields(): string[] {
    return ["/SPADL", "/TeamLocation"];
  }

  showTimeline(): boolean {
    return false;
  }

  getCommand(): PassesNetRendererCommand {
    // Static whole-match network restricted to the starting players.
    let [start, end]: [number, number] = window.log.getTimestampRange();
    let teamFilterNum = this.TEAM_FILTER.value !== "all" ? parseInt(this.TEAM_FILTER.value) : -1;
    let minPasses     = Math.max(1, parseInt(this.MIN_PASSES.value) || 1);

    // Recompute nodes/edge counts only when the match range or team filter changes.
    const cacheKey = `${start},${end},${teamFilterNum}`;
    if (this.cache === null || this.cacheKey !== cacheKey) {
      this.cache    = this.computeNetwork(start, end, teamFilterNum);
      this.cacheKey = cacheKey;
    }
    let { nodes, edgeCounts } = this.cache;

    // Apply the min-passes threshold (cheap; the input may change every frame)
    let edges: PassesNetEdge[] = [];
    let maxEdgeCount = 0;
    edgeCounts.forEach((e) => {
      if (e.count >= minPasses) {
        edges.push({ fromPlayer: e.from, toPlayer: e.to, count: e.count, teamId: e.teamId });
        if (e.count > maxEdgeCount) maxEdgeCount = e.count;
      }
    });

    return {
      nodes,
      edges,
      maxEdgeCount
    };
  }

  /**
   * Builds the static pass network, restricted to the starting players (to
   * avoid the substitution problem). Each node is positioned at the mean of the
   * player's tracked position sampled at the moments they passed or received
   * (i.e. their passing involvements).
   */
  private computeNetwork(start: number, end: number, teamFilterNum: number): PassesNetData {
    let actions = readSoccerActions(start, end);
    let n = actions.length;

    // Only include the starting XI; substitutes are excluded entirely.
    let starters = getStartingPlayerIds();

    // Per-player action count (for node sizing)
    let actionCount = new Map<number, number>();
    for (const action of actions) {
      actionCount.set(action.playerId, (actionCount.get(action.playerId) ?? 0) + 1);
    }

    let edgeCounts = new Map<string, EdgeCount>();

    // Accumulated tracked positions sampled at each player's pass involvements
    let nodeSamples = new Map<number, { sumX: number; sumY: number; count: number; teamId: number }>();
    let addSample = (pid: number, pos: { x: number; y: number; teamId: number }) => {
      let sample = nodeSamples.get(pid);
      if (sample === undefined) {
        sample = { sumX: 0, sumY: 0, count: 0, teamId: pos.teamId };
        nodeSamples.set(pid, sample);
      }
      sample.sumX += pos.x;
      sample.sumY += pos.y;
      sample.count++;
      sample.teamId = pos.teamId;
    };

    for (let i = 0; i < n; i++) {
      const action = actions[i];
      if (!PASS_ACTION_IDS.includes(action.actionTypeId)) continue;
      if (action.resultId !== 1) continue;
      if (teamFilterNum !== -1 && action.teamId !== teamFilterNum) continue;
      if (!starters.has(action.playerId)) continue;

      let receiver: number | null = null;
      for (let j = i + 1; j < n; j++) {
        if (actions[j].periodId !== action.periodId) break;
        if (actions[j].teamId !== action.teamId) break;
        receiver = actions[j].playerId;
        break;
      }

      if (receiver === null || receiver === action.playerId) continue;
      if (!starters.has(receiver)) continue; // keep the network within the starting XI

      // Sample both players' tracked position at the moment of the pass.
      let passerPos   = readTrackedPosition(action.playerId, action.timestamp);
      let receiverPos = readTrackedPosition(receiver, action.timestamp);
      if (passerPos === null || receiverPos === null) continue;
      addSample(action.playerId, passerPos);
      addSample(receiver, receiverPos);

      const key = `${action.playerId}-${receiver}`;
      const existing = edgeCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        edgeCounts.set(key, { from: action.playerId, to: receiver, count: 1, teamId: action.teamId });
      }
    }

    // Build nodes — only players involved in passes, at their mean position
    let nodes: PassesNetNode[] = [];
    nodeSamples.forEach((sample, pid) => {
      nodes.push({
        playerId:    pid,
        teamId:      sample.teamId,
        avgX:        sample.sumX / sample.count,
        avgY:        sample.sumY / sample.count,
        actionCount: actionCount.get(pid) ?? 0
      });
    });

    return { nodes, edgeCounts };
  }
}
