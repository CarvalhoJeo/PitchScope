// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { EventTimelineRendererCommand } from "../../shared/renderers/EventTimelineRenderer";
import { readSoccerActions } from "../../shared/soccer/SoccerLogReader";
import { createUUID } from "../../shared/util";
import TabController from "./TabController";

export default class EventTimelineController implements TabController {
  UUID = createUUID();

  private TEAM_FILTER: HTMLSelectElement;

  constructor(root: HTMLElement) {
    this.TEAM_FILTER = root.getElementsByClassName("team-filter")[0] as HTMLSelectElement;
  }

  saveState(): unknown {
    return { teamFilter: this.TEAM_FILTER.value };
  }

  restoreState(state: unknown): void {
    if (typeof state !== "object" || state === null) return;
    let s = state as any;
    if ("teamFilter" in s) this.TEAM_FILTER.value = s.teamFilter;
  }

  refresh(): void {}

  newAssets(): void {}

  getActiveFields(): string[] {
    return ["/SPADL"];
  }

  showTimeline(): boolean {
    return true;
  }

  getCommand(): EventTimelineRendererCommand {
    let timeRange = window.log.getTimestampRange() as [number, number];
    let [start, end] = timeRange;

    let actions = readSoccerActions(start, end);
    let selectedTeam = this.TEAM_FILTER.value !== "all" ? parseInt(this.TEAM_FILTER.value) : -1;

    let events: EventTimelineRendererCommand["events"] = [];
    for (const action of actions) {
      if (selectedTeam !== -1 && action.teamId !== selectedTeam) continue;
      events.push({
        timestamp: action.timestamp,
        actionType: action.actionType,
        teamId: action.teamId,
        playerId: action.playerId
      });
    }

    return { events, timeRange, selectedTime: window.selection.getSelectedTime() };
  }
}
