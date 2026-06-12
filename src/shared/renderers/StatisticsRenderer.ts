// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { TEAM_COLORS } from "../SoccerTypes";
import TabRenderer from "./TabRenderer";

export interface StatisticsRow {
  playerId: number;
  teamId: number;
  touches: number;
  passesCompleted: number;
  passesAttempted: number;
  shots: number;
  tackles: number;
  interceptions: number;
  distanceKm: number;
  topSpeedKmh: number;
}

export interface StatisticsRendererCommand {
  rows: StatisticsRow[];
}

type Column = {
  label: string;
  title: string;
  value: (row: StatisticsRow) => number;
  text: (row: StatisticsRow) => string;
};

export default class StatisticsRenderer implements TabRenderer {
  private TABLE: HTMLTableElement;
  private BODY: HTMLTableSectionElement;
  private lastRenderKey = "";
  private lastCommand: StatisticsRendererCommand | null = null;

  private sortIndex = 0; // default sort by player number
  private sortDescending = false;

  private columns: Column[] = [
    { label: "Player", title: "Player number", value: (r) => r.playerId, text: (r) => r.playerId.toString() },
    { label: "Touches", title: "Total on-ball actions", value: (r) => r.touches, text: (r) => r.touches.toString() },
    {
      label: "Passes (cmp/att)",
      title: "Passes completed / attempted",
      value: (r) => r.passesCompleted,
      text: (r) => `${r.passesCompleted}/${r.passesAttempted}`
    },
    {
      label: "Pass accuracy",
      title: "Pass accuracy",
      value: (r) => (r.passesAttempted === 0 ? -1 : r.passesCompleted / r.passesAttempted),
      text: (r) => (r.passesAttempted === 0 ? "—" : Math.round((r.passesCompleted / r.passesAttempted) * 100) + "%")
    },
    { label: "Shots", title: "Shots", value: (r) => r.shots, text: (r) => r.shots.toString() },
    { label: "Tackles", title: "Tackles", value: (r) => r.tackles, text: (r) => r.tackles.toString() },
    {
      label: "Interceptions",
      title: "Interceptions",
      value: (r) => r.interceptions,
      text: (r) => r.interceptions.toString()
    },
    {
      label: "Distance (km)",
      title: "Distance covered, in kilometres",
      value: (r) => r.distanceKm,
      text: (r) => (r.distanceKm > 0 ? r.distanceKm.toFixed(1) : "—")
    },
    {
      label: "Top speed (km/h)",
      title: "Top speed, in kilometres per hour",
      value: (r) => r.topSpeedKmh,
      text: (r) => (r.topSpeedKmh > 0 ? r.topSpeedKmh.toFixed(1) : "—")
    }
  ];

  constructor(root: HTMLElement) {
    root.innerHTML = "";
    let scroll = document.createElement("div");
    scroll.classList.add("player-stats-scroll");
    root.appendChild(scroll);

    this.TABLE = document.createElement("table");
    this.TABLE.classList.add("player-stats-table");
    scroll.appendChild(this.TABLE);

    // Header (sortable)
    let head = document.createElement("thead");
    this.TABLE.appendChild(head);
    let headRow = document.createElement("tr");
    head.appendChild(headRow);
    this.columns.forEach((column, index) => {
      let th = document.createElement("th");
      th.innerText = column.label;
      th.title = column.title + " (click to sort)";
      th.addEventListener("click", () => {
        if (this.sortIndex === index) {
          this.sortDescending = !this.sortDescending;
        } else {
          this.sortIndex = index;
          this.sortDescending = index !== 0; // text-ish first column sorts ascending by default
        }
        this.lastRenderKey = "";
        if (this.lastCommand) this.render(this.lastCommand);
      });
      headRow.appendChild(th);
    });

    this.BODY = document.createElement("tbody");
    this.TABLE.appendChild(this.BODY);
  }

  saveState(): unknown {
    return { sortIndex: this.sortIndex, sortDescending: this.sortDescending };
  }

  restoreState(state: unknown): void {
    if (typeof state !== "object" || state === null) return;
    let s = state as any;
    if (typeof s.sortIndex === "number") this.sortIndex = s.sortIndex;
    if (typeof s.sortDescending === "boolean") this.sortDescending = s.sortDescending;
  }

  getAspectRatio(): number | null {
    return null;
  }

  render(command: StatisticsRendererCommand): void {
    this.lastCommand = command;

    let renderKey = JSON.stringify([command.rows, this.sortIndex, this.sortDescending]);
    if (renderKey === this.lastRenderKey) return;
    this.lastRenderKey = renderKey;

    // Mark the active sort column in the header
    let headerCells = this.TABLE.tHead!.rows[0].cells;
    for (let i = 0; i < headerCells.length; i++) {
      let arrow = i === this.sortIndex ? (this.sortDescending ? " ▾" : " ▴") : "";
      headerCells[i].innerText = this.columns[i].label + arrow;
    }

    if (command.rows.length === 0) {
      this.BODY.innerHTML = '<tr><td class="player-stats-empty" colspan="9">Load a .spadl and .tracking file</td></tr>';
      return;
    }

    let column = this.columns[this.sortIndex];
    let sorted = [...command.rows].sort((a, b) => {
      let diff = column.value(a) - column.value(b);
      if (diff === 0) diff = a.playerId - b.playerId;
      return this.sortDescending ? -diff : diff;
    });

    this.BODY.innerHTML = "";
    sorted.forEach((row) => {
      let tr = document.createElement("tr");
      this.columns.forEach((col, index) => {
        let td = document.createElement("td");
        td.innerText = col.text(row);
        if (index === 0) {
          td.classList.add("player-stats-id");
          td.style.borderLeft = "4px solid " + (TEAM_COLORS[row.teamId] ?? "#888");
        }
        tr.appendChild(td);
      });
      this.BODY.appendChild(tr);
    });
  }
}
