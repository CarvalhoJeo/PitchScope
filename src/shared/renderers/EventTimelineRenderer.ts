// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { TEAM_COLORS } from "../SoccerTypes";
import TabRenderer from "./TabRenderer";

export interface EventTimelineRendererCommand {
  events: { timestamp: number; actionType: string; teamId: number; playerId: number }[];
  timeRange: [number, number];
  selectedTime: number | null;
}

// Action type → color
const ACTION_COLORS: Record<string, string> = {
  pass: "#3498db",
  cross: "#2ecc71",
  shot: "#e74c3c",
  dribble: "#f39c12",
  tackle: "#9b59b6",
  interception: "#1abc9c",
  foul: "#e67e22",
  take_on: "#f1c40f"
};

function actionColor(actionType: string, teamId: number): string {
  return ACTION_COLORS[actionType] ?? TEAM_COLORS[teamId] ?? "#888888";
}

export default class EventTimelineRenderer implements TabRenderer {
  private CONTAINER: HTMLElement;
  private CANVAS: HTMLCanvasElement;
  private lastRenderState = "";

  constructor(root: HTMLElement) {
    this.CONTAINER = root.getElementsByClassName("event-timeline-canvas-container")[0] as HTMLElement;
    this.CANVAS = root.getElementsByClassName("event-timeline-canvas")[0] as HTMLCanvasElement;
  }

  saveState(): unknown {
    return null;
  }

  restoreState(_state: unknown): void {}

  getAspectRatio(): number | null {
    return null;
  }

  render(command: EventTimelineRendererCommand): void {
    let W = this.CONTAINER.clientWidth;
    let H = this.CONTAINER.clientHeight;
    if (W === 0 || H === 0) return;

    let renderState = JSON.stringify([W, H, window.devicePixelRatio, command]);
    if (renderState === this.lastRenderState) return;
    this.lastRenderState = renderState;

    this.CANVAS.style.width = W + "px";
    this.CANVAS.style.height = H + "px";
    this.CANVAS.width = W * window.devicePixelRatio;
    this.CANVAS.height = H * window.devicePixelRatio;

    let ctx = this.CANVAS.getContext("2d") as CanvasRenderingContext2D;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, W, H);

    let [tMin, tMax] = command.timeRange;
    let tSpan = tMax - tMin || 1;
    let PAD_LEFT = 50;
    let PAD_RIGHT = 16;
    let PAD_TOP = 20;
    let PAD_BOTTOM = 30;
    let plotW = W - PAD_LEFT - PAD_RIGHT;
    let plotH = H - PAD_TOP - PAD_BOTTOM;

    function toX(t: number) {
      return PAD_LEFT + ((t - tMin) / tSpan) * plotW;
    }

    // Grid and axis
    ctx.strokeStyle = "#333355";
    ctx.lineWidth = 1;
    let tickCount = Math.min(10, Math.floor(plotW / 80));
    for (let i = 0; i <= tickCount; i++) {
      let x = PAD_LEFT + (i / tickCount) * plotW;
      ctx.beginPath();
      ctx.moveTo(x, PAD_TOP);
      ctx.lineTo(x, PAD_TOP + plotH);
      ctx.stroke();
      let t = tMin + (i / tickCount) * tSpan;
      ctx.fillStyle = "#888";
      ctx.font = "10px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(t.toFixed(1) + "s", x, PAD_TOP + plotH + 4);
    }

    // Two rows: home (top) and away (bottom)
    let rowH = plotH / 2;
    let rowCenters = [PAD_TOP + rowH * 0.5, PAD_TOP + rowH * 1.5];

    // Row labels
    ctx.fillStyle = TEAM_COLORS[1] ?? "#e74c3c";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("Home", PAD_LEFT - 4, rowCenters[0]);
    ctx.fillStyle = TEAM_COLORS[2] ?? "#3498db";
    ctx.fillText("Away", PAD_LEFT - 4, rowCenters[1]);

    // Separator line
    ctx.strokeStyle = "#444466";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(PAD_LEFT, PAD_TOP + rowH);
    ctx.lineTo(PAD_LEFT + plotW, PAD_TOP + rowH);
    ctx.stroke();

    if (command.events.length === 0) {
      ctx.fillStyle = "rgba(255,255,255,0.4)";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No SPADL data — load a .spadl file", W / 2, H / 2);
      return;
    }

    // Draw events
    command.events.forEach((ev) => {
      let x = toX(ev.timestamp);
      if (x < PAD_LEFT || x > PAD_LEFT + plotW) return;
      let rowIdx = ev.teamId === 2 ? 1 : 0;
      let cy = rowCenters[rowIdx];
      let color = actionColor(ev.actionType, ev.teamId);

      ctx.beginPath();
      ctx.arc(x, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });

    // Selected time marker
    if (command.selectedTime !== null) {
      let sx = toX(command.selectedTime);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(sx, PAD_TOP);
      ctx.lineTo(sx, PAD_TOP + plotH);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}
