// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { ActionHeatmapRendererCommand } from "../../shared/renderers/ActionHeatmapRenderer";
import { readSoccerActions } from "../../shared/soccer/SoccerLogReader";
import { createUUID } from "../../shared/util";
import TabController from "./TabController";

export default class ActionHeatmapController implements TabController {
  UUID = createUUID();

  private ACTION_TYPE: HTMLSelectElement;
  private TEAM_FILTER: HTMLSelectElement;
  private TIME_RANGE: HTMLSelectElement;

  constructor(root: HTMLElement) {
    this.ACTION_TYPE = root.getElementsByClassName("action-type")[0] as HTMLSelectElement;
    this.TEAM_FILTER = root.getElementsByClassName("team-filter")[0] as HTMLSelectElement;
    this.TIME_RANGE = root.getElementsByClassName("time-range")[0] as HTMLSelectElement;
  }

  saveState(): unknown {
    return {
      actionType: this.ACTION_TYPE.value,
      teamFilter: this.TEAM_FILTER.value,
      timeRange: this.TIME_RANGE.value
    };
  }

  restoreState(state: unknown): void {
    if (typeof state !== "object" || state === null) return;
    let s = state as any;
    if ("actionType" in s) this.ACTION_TYPE.value = s.actionType;
    if ("teamFilter" in s) this.TEAM_FILTER.value = s.teamFilter;
    if ("timeRange" in s) this.TIME_RANGE.value = s.timeRange;
  }

  refresh(): void {}

  newAssets(): void {}

  getActiveFields(): string[] {
    return ["/SPADL"];
  }

  showTimeline(): boolean {
    return true;
  }

  getCommand(): ActionHeatmapRendererCommand {
    let logRange = window.log.getTimestampRange();
    let [start, end]: [number, number] =
      this.TIME_RANGE.value === "visible" ? window.selection.getTimelineRange() : [logRange[0], logRange[1]];

    let actions = readSoccerActions(start, end);
    let selectedActionId = this.ACTION_TYPE.value !== "all" ? parseInt(this.ACTION_TYPE.value) : -1;
    let selectedTeam = this.TEAM_FILTER.value !== "all" ? parseInt(this.TEAM_FILTER.value) : -1;

    let points: { x: number; y: number }[] = [];
    for (const action of actions) {
      if (selectedActionId !== -1 && action.actionTypeId !== selectedActionId) continue;
      if (selectedTeam !== -1 && action.teamId !== selectedTeam) continue;
      points.push({ x: action.startX, y: action.startY });
    }

    let actionLabel =
      this.ACTION_TYPE.value === "all"
        ? "All Actions"
        : (this.ACTION_TYPE.options[this.ACTION_TYPE.selectedIndex]?.text ?? this.ACTION_TYPE.value);

    return { points, actionType: actionLabel, totalCount: points.length };
  }
}
