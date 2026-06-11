// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { PASS_ACTION_IDS } from "../../shared/SoccerTypes";
import { PassesNetEdge, PassesNetNode, PassesNetRendererCommand } from "../../shared/renderers/PassesNetRenderer";
import { readSoccerActions, readPlayerAveragePositions } from "../../shared/soccer/SoccerLogReader";
import { createUUID } from "../../shared/util";
import TabController from "./TabController";

export default class PassesNetController implements TabController {
  UUID = createUUID();

  private TEAM_FILTER: HTMLSelectElement;
  private MIN_PASSES: HTMLInputElement;
  private EDGE_LIST: HTMLElement;

  private avgPosCache: Map<number, { x: number; y: number; teamId: number }> | null = null;
  private avgPosCacheKey = "";
  private lastEdgeListKey = "";

  constructor(root: HTMLElement) {
    this.TEAM_FILTER  = root.getElementsByClassName("team-filter")[0]          as HTMLSelectElement;
    this.MIN_PASSES   = root.getElementsByClassName("min-passes")[0]           as HTMLInputElement;
    this.EDGE_LIST    = root.getElementsByClassName("passes-net-edge-list")[0] as HTMLElement;
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
    let logRange = window.log.getTimestampRange();
    let [start, end]: [number, number] = [logRange[0], logRange[1]];

    // Average tracking positions — cached by [start, end]
    const cacheKey = `${start},${end}`;
    if (this.avgPosCacheKey !== cacheKey || this.avgPosCache === null) {
      this.avgPosCache    = readPlayerAveragePositions(start, end);
      this.avgPosCacheKey = cacheKey;
    }
    const avgPos = this.avgPosCache;

    let actions       = readSoccerActions(start, end);
    let teamFilterNum = this.TEAM_FILTER.value !== "all" ? parseInt(this.TEAM_FILTER.value) : -1;
    let minPasses     = Math.max(1, parseInt(this.MIN_PASSES.value) || 1);

    // Per-player action count (for node sizing)
    let actionCount = new Map<number, number>();
    for (const action of actions) {
      actionCount.set(action.playerId, (actionCount.get(action.playerId) ?? 0) + 1);
    }

    // Pass edges (successful only)
    let edgeCounts = new Map<string, { from: number; to: number; count: number; teamId: number }>();
    let n = actions.length;

    for (let i = 0; i < n; i++) {
      const action = actions[i];
      if (!PASS_ACTION_IDS.includes(action.actionTypeId)) continue;
      if (action.resultId !== 1) continue;
      if (teamFilterNum !== -1 && action.teamId !== teamFilterNum) continue;

      let receiver: number | null = null;
      for (let j = i + 1; j < n; j++) {
        if (actions[j].periodId !== action.periodId) break;
        if (actions[j].teamId !== action.teamId) break;
        receiver = actions[j].playerId;
        break;
      }

      if (receiver === null || receiver === action.playerId) continue;
      if (!avgPos.has(action.playerId) || !avgPos.has(receiver)) continue;

      const key = `${action.playerId}-${receiver}`;
      const existing = edgeCounts.get(key);
      if (existing) {
        existing.count++;
      } else {
        edgeCounts.set(key, { from: action.playerId, to: receiver, count: 1, teamId: action.teamId });
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
    let maxEdgeCount = 0;

    edgeCounts.forEach((e) => {
      if (e.count >= minPasses) {
        edges.push({ fromPlayer: e.from, toPlayer: e.to, count: e.count, teamId: e.teamId });
        if (e.count > maxEdgeCount) maxEdgeCount = e.count;
      }
    });

    // Edge list panel — update DOM only when edge data changes
    const edgeListKey = edges.map((e) => `${e.fromPlayer}-${e.toPlayer}:${e.count}`).join("|");
    if (edgeListKey !== this.lastEdgeListKey) {
      this.lastEdgeListKey = edgeListKey;
      const sorted = [...edges].sort((a, b) => b.count - a.count);
      if (sorted.length === 0) {
        this.EDGE_LIST.innerHTML = '<span class="passes-net-edge-empty">No data</span>';
      } else {
        const rows = sorted
          .map((e) => `<tr><td>${e.fromPlayer}</td><td>→</td><td>${e.toPlayer}</td><td>${e.count}</td></tr>`)
          .join("");
        this.EDGE_LIST.innerHTML = `<table class="passes-net-edge-table"><thead><tr><th>From</th><th></th><th>To</th><th>#</th></tr></thead><tbody>${rows}</tbody></table>`;
      }
    }

    return {
      nodes,
      edges,
      maxEdgeCount
    };
  }
}
