// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { TEAM_COLORS } from "../SoccerTypes";
import { TimelineZoomState } from "./soccer/TimelineZoom";
import TabRenderer from "./TabRenderer";

export interface EventTimelineRendererCommand {
  events: { timestamp: number; actionType: string; teamId: number; playerId: number }[];
  timeRange: [number, number];
  selectedTime: number | null;
}

const ACTION_COLORS: Record<string, string> = {
  pass:         "#3498db",
  cross:        "#2ecc71",
  shot:         "#e74c3c",
  dribble:      "#f39c12",
  tackle:       "#9b59b6",
  interception: "#1abc9c",
  foul:         "#e67e22",
  take_on:      "#f1c40f"
};

function actionColor(actionType: string, teamId: number): string {
  return ACTION_COLORS[actionType] ?? TEAM_COLORS[teamId] ?? "#888888";
}

export default class EventTimelineRenderer implements TabRenderer {
  private CONTAINER: HTMLElement;
  private CANVAS: HTMLCanvasElement;
  private lastRenderState = "";
  private lastCommand: EventTimelineRendererCommand | null = null;
  private zoom = new TimelineZoomState();

  // Kept up-to-date by render(); read by zoom event handlers.
  private lastTimeRange: [number, number] = [0, 1];
  private lastPlot = { left: 50, width: 1 };

  constructor(root: HTMLElement) {
    this.CONTAINER = root.getElementsByClassName("event-timeline-canvas-container")[0] as HTMLElement;
    this.CANVAS    = root.getElementsByClassName("event-timeline-canvas")[0] as HTMLCanvasElement;

    this.zoom.attach(
      this.CANVAS,
      () => this.lastTimeRange,
      () => this.lastPlot,
      () => {
        this.lastRenderState = "";
        if (this.lastCommand) this.render(this.lastCommand);
      }
    );
  }

  saveState(): unknown { return null; }
  restoreState(_state: unknown): void {}
  getAspectRatio(): number | null { return null; }

  render(command: EventTimelineRendererCommand): void {
    this.lastCommand = command;

    let W = this.CONTAINER.clientWidth;
    let H = this.CONTAINER.clientHeight;
    if (W === 0 || H === 0) return;

    let renderState = JSON.stringify([W, H, window.devicePixelRatio, command, this.zoom.key()]);
    if (renderState === this.lastRenderState) return;
    this.lastRenderState = renderState;

    this.CANVAS.style.width  = W + "px";
    this.CANVAS.style.height = H + "px";
    this.CANVAS.width  = W * window.devicePixelRatio;
    this.CANVAS.height = H * window.devicePixelRatio;

    let ctx = this.CANVAS.getContext("2d") as CanvasRenderingContext2D;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, W, H);

    const PAD_LEFT   = 50;
    const PAD_RIGHT  = 16;
    const PAD_TOP    = 20;
    const PAD_BOTTOM = 44;   // extra room for tick labels + mini-map bar
    const plotW = W - PAD_LEFT - PAD_RIGHT;
    const plotH = H - PAD_TOP - PAD_BOTTOM;

    // Expose to zoom event handlers before any early returns.
    this.lastTimeRange = command.timeRange;
    this.lastPlot = { left: PAD_LEFT, width: plotW };

    const [tMin, tMax] = this.zoom.visibleRange(command.timeRange[0], command.timeRange[1]);
    const tSpan = tMax - tMin || 1;

    const toX = (t: number) => PAD_LEFT + ((t - tMin) / tSpan) * plotW;

    // Grid lines + tick labels
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

    // Two rows: home (top) / away (bottom)
    const rowH = plotH / 2;
    const rowCenters = [PAD_TOP + rowH * 0.5, PAD_TOP + rowH * 1.5];

    ctx.fillStyle = TEAM_COLORS[1] ?? "#e74c3c";
    ctx.font = "bold 10px sans-serif";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText("Home", PAD_LEFT - 4, rowCenters[0]);
    ctx.fillStyle = TEAM_COLORS[2] ?? "#3498db";
    ctx.fillText("Away", PAD_LEFT - 4, rowCenters[1]);

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
    } else {
      // Show action-type labels when there are >= 5 pixels per second (spread out enough).
      const pxPerSec  = plotW / tSpan;
      const showLabels = pxPerSec >= 5;

      command.events.forEach((ev) => {
        const x = toX(ev.timestamp);
        if (x < PAD_LEFT - 6 || x > PAD_LEFT + plotW + 6) return;
        const rowIdx = ev.teamId === 2 ? 1 : 0;
        const cy     = rowCenters[rowIdx];
        const color  = actionColor(ev.actionType, ev.teamId);

        ctx.beginPath();
        ctx.arc(x, cy, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (showLabels) {
          ctx.fillStyle = "#cccccc";
          ctx.font = "9px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillText(ev.actionType.replace("_", " "), x, cy - 7);
        }
      });

      // Selected-time marker (only when inside visible range)
      if (command.selectedTime !== null) {
        const sx = toX(command.selectedTime);
        if (sx >= PAD_LEFT && sx <= PAD_LEFT + plotW) {
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

    // ── Mini-map: shows the visible window relative to the full log range ──
    const mapY = PAD_TOP + plotH + 30;
    const mapH = 6;

    ctx.fillStyle = "#2a2a4a";
    ctx.fillRect(PAD_LEFT, mapY, plotW, mapH);

    const [fullMin, fullMax] = command.timeRange;
    const fullSpan = fullMax - fullMin || 1;
    const barX = PAD_LEFT + ((tMin - fullMin) / fullSpan) * plotW;
    const barW = Math.max(4, (plotW * (tMax - tMin)) / fullSpan);

    ctx.fillStyle = "#5566aa";
    ctx.fillRect(barX, mapY, barW, mapH);

    // Hint text (only when zoomed)
    if (this.zoom.isZoomed()) {
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText("scroll · drag · dbl-click to reset", W - PAD_RIGHT, 3);
    }
  }
}
