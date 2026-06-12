// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { PASS_ACTION_IDS } from "../../shared/SoccerTypes";
import { PassesNetEdge, PassesNetNode, PassesNetRendererCommand } from "../../shared/renderers/PassesNetRenderer";
import {
  getStartingPlayerIds,
  readPlayerNormalizedAveragePositions,
  readSoccerActions,
  readTrackedPosition,
  shouldFlipPeriod
} from "../../shared/soccer/SoccerLogReader";
import { createUUID } from "../../shared/util";
import TabController from "./TabController";

type EdgeCount = { from: number; to: number; count: number; teamId: number };
type PassesNetData = { nodes: PassesNetNode[]; edgeCounts: Map<string, EdgeCount> };

export default class PassesNetController implements TabController {
  UUID = createUUID();

  private TEAM_FILTER: HTMLSelectElement;
  private MIN_PASSES: HTMLInputElement;
  private POSITION_MODE: HTMLSelectElement;
  private SHOW_COUNTS: HTMLInputElement;

  // Cache for the heavy network computation (position sampling), keyed by
  // match range + team filter + position mode. Edge thresholding is cheap.
  private cache: PassesNetData | null = null;
  private cacheKey = "";

  constructor(root: HTMLElement) {
    this.TEAM_FILTER    = root.getElementsByClassName("team-filter")[0]   as HTMLSelectElement;
    this.MIN_PASSES     = root.getElementsByClassName("min-passes")[0]    as HTMLInputElement;
    this.POSITION_MODE  = root.getElementsByClassName("position-mode")[0] as HTMLSelectElement;
    this.SHOW_COUNTS    = root.getElementsByClassName("show-counts")[0]   as HTMLInputElement;
  }

  saveState(): unknown {
    return {
      teamFilter:   this.TEAM_FILTER.value,
      minPasses:    this.MIN_PASSES.value,
      positionMode: this.POSITION_MODE.value,
      showCounts:   this.SHOW_COUNTS.checked
    };
  }

  restoreState(state: unknown): void {
    if (typeof state !== "object" || state === null) return;
    let s = state as any;
    if ("teamFilter" in s)   this.TEAM_FILTER.value   = s.teamFilter;
    if ("minPasses"  in s)   this.MIN_PASSES.value    = s.minPasses;
    if ("positionMode" in s) this.POSITION_MODE.value = s.positionMode;
    if ("showCounts" in s)   this.SHOW_COUNTS.checked = s.showCounts;
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
    let useAverage    = this.POSITION_MODE.value === "average";

    // Recompute only when the match range, team filter or position mode changes.
    const cacheKey = `${start},${end},${teamFilterNum},${useAverage}`;
    if (this.cache === null || this.cacheKey !== cacheKey) {
      this.cache    = this.computeNetwork(start, end, teamFilterNum, useAverage);
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
      maxEdgeCount,
      showCounts: this.SHOW_COUNTS.checked
    };
  }

  /**
   * Builds the static pass network, restricted to the starting players (to
   * avoid the substitution problem). Nodes are positioned in one of two ways,
   * both direction-normalized for the halftime end-switch:
   *  - events:  mean of each player's tracked position at their pass involvements
   *  - average: each player's whole-match average tracked position
   */
  private computeNetwork(start: number, end: number, teamFilterNum: number, useAverage: boolean): PassesNetData {
    let actions = readSoccerActions(start, end);
    let n = actions.length;

    // Only include the starting XI; substitutes are excluded entirely.
    let starters = getStartingPlayerIds();

    // Whole-match averages (only needed in "average" mode)
    let averagePositions = useAverage ? readPlayerNormalizedAveragePositions() : null;

    // Per-player action count (for node sizing)
    let actionCount = new Map<number, number>();
    for (const action of actions) {
      actionCount.set(action.playerId, (actionCount.get(action.playerId) ?? 0) + 1);
    }

    let edgeCounts = new Map<string, EdgeCount>();
    let involved = new Set<number>(); // players appearing in a counted pass

    // Event-mode positions: mean of tracked positions at pass involvements
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

      if (useAverage) {
        // Both players must have a whole-match average to be placed.
        if (!averagePositions!.has(action.playerId) || !averagePositions!.has(receiver)) continue;
      } else {
        // Sample both players' tracked position at the moment of the pass.
        let passerPos   = readTrackedPosition(action.playerId, action.timestamp);
        let receiverPos = readTrackedPosition(receiver, action.timestamp);
        if (passerPos === null || receiverPos === null) continue;

        // Teams switch ends each half, so mirror the attacking axis (x -> 100 - x)
        // on even periods so every sample shares one attacking direction.
        if (shouldFlipPeriod(action.periodId)) {
          passerPos = { x: 100 - passerPos.x, y: passerPos.y, teamId: passerPos.teamId };
          receiverPos = { x: 100 - receiverPos.x, y: receiverPos.y, teamId: receiverPos.teamId };
        }
        addSample(action.playerId, passerPos);
        addSample(receiver, receiverPos);
      }

      involved.add(action.playerId);
      involved.add(receiver);

      // Undirected: A->B and B->A share one edge (canonical low-high key),
      // so a pair is drawn as a single connection weighted by total passes.
      let low = Math.min(action.playerId, receiver);
      let high = Math.max(action.playerId, receiver);
      const key = `${low}-${high}`;
      const existing = edgeCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        edgeCounts.set(key, { from: low, to: high, count: 1, teamId: action.teamId });
      }
    }

    // Build nodes — players involved in passes, positioned by the chosen mode
    let nodes: PassesNetNode[] = [];
    involved.forEach((pid) => {
      let pos: { x: number; y: number; teamId: number };
      if (useAverage) {
        pos = averagePositions!.get(pid)!;
      } else {
        let sample = nodeSamples.get(pid)!;
        pos = { x: sample.sumX / sample.count, y: sample.sumY / sample.count, teamId: sample.teamId };
      }
      nodes.push({
        playerId:    pid,
        teamId:      pos.teamId,
        avgX:        pos.x,
        avgY:        pos.y,
        actionCount: actionCount.get(pid) ?? 0
      });
    });

    return { nodes, edgeCounts };
  }
}
