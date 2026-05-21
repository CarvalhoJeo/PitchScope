// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { SoccerFieldRendererCommand } from "../../shared/renderers/SoccerFieldRenderer";
import { readPlayerPositions } from "../../shared/soccer/SoccerLogReader";
import { createUUID } from "../../shared/util";
import TabController from "./TabController";

export default class SoccerFieldController implements TabController {
  UUID = createUUID();

  private SHOW_LABELS: HTMLInputElement;
  private TEAM_FILTER: HTMLSelectElement;

  constructor(root: HTMLElement) {
    this.SHOW_LABELS = root.getElementsByClassName("show-labels")[0] as HTMLInputElement;
    this.TEAM_FILTER = root.getElementsByClassName("team-filter")[0] as HTMLSelectElement;
  }

  saveState(): unknown {
    return {
      showLabels: this.SHOW_LABELS.checked,
      teamFilter: this.TEAM_FILTER.value
    };
  }

  restoreState(state: unknown): void {
    if (typeof state !== "object" || state === null) return;
    if ("showLabels" in state && typeof (state as any).showLabels === "boolean") {
      this.SHOW_LABELS.checked = (state as any).showLabels;
    }
    if ("teamFilter" in state && typeof (state as any).teamFilter === "string") {
      this.TEAM_FILTER.value = (state as any).teamFilter;
    }
  }

  refresh(): void {}

  newAssets(): void {}

  getActiveFields(): string[] {
    return ["/TeamLocation"];
  }

  showTimeline(): boolean {
    return true;
  }

  getCommand(): SoccerFieldRendererCommand {
    let time = window.selection.getRenderTime() ?? window.log.getTimestampRange()[0];
    return {
      players: readPlayerPositions(time),
      showLabels: this.SHOW_LABELS.checked,
      teamFilter: this.TEAM_FILTER.value
    };
  }
}
