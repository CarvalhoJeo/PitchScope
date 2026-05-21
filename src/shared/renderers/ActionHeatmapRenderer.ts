// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { PITCH_ASPECT_RATIO } from "../SoccerTypes";
import { drawSoccerPitch, pitchToCanvas } from "./soccer/SoccerPitch";
import { ZoomPanState } from "./soccer/ZoomPan";
import TabRenderer from "./TabRenderer";

export interface ActionHeatmapRendererCommand {
  points: { x: number; y: number }[];
  actionType: string;
  totalCount: number;
}

export default class ActionHeatmapRenderer implements TabRenderer {
  private CONTAINER: HTMLElement;
  private CANVAS: HTMLCanvasElement;
  private lastRenderState = "";
  private lastCommand: ActionHeatmapRendererCommand | null = null;
  private zoomPan = new ZoomPanState();

  constructor(root: HTMLElement) {
    this.CONTAINER = root.getElementsByClassName("action-heatmap-canvas-container")[0] as HTMLElement;
    this.CANVAS = root.getElementsByClassName("action-heatmap-canvas")[0] as HTMLCanvasElement;
    this.zoomPan.attach(this.CANVAS, () => {
      this.lastRenderState = "";
      if (this.lastCommand) this.render(this.lastCommand);
    });
  }

  saveState(): unknown {
    return null;
  }

  restoreState(_state: unknown): void {}

  getAspectRatio(): number | null {
    return PITCH_ASPECT_RATIO;
  }

  render(command: ActionHeatmapRendererCommand): void {
    this.lastCommand = command;
    let containerWidth = this.CONTAINER.clientWidth;
    let containerHeight = this.CONTAINER.clientHeight;
    if (containerWidth === 0 || containerHeight === 0) return;

    let W: number, H: number;
    if (containerWidth / containerHeight > PITCH_ASPECT_RATIO) {
      H = containerHeight;
      W = H * PITCH_ASPECT_RATIO;
    } else {
      W = containerWidth;
      H = W / PITCH_ASPECT_RATIO;
    }

    let renderState = JSON.stringify([W, H, window.devicePixelRatio, command, this.zoomPan.key()]);
    if (renderState === this.lastRenderState) return;
    this.lastRenderState = renderState;

    this.CANVAS.style.width = W + "px";
    this.CANVAS.style.height = H + "px";
    this.CANVAS.width = W * window.devicePixelRatio;
    this.CANVAS.height = H * window.devicePixelRatio;

    let ctx = this.CANVAS.getContext("2d") as CanvasRenderingContext2D;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    if (command.points.length === 0) {
      drawSoccerPitch(ctx, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No SPADL data — load a .spadl file", W / 2, H / 2);
      return;
    }

    ctx.save();
    this.zoomPan.apply(ctx);

    drawSoccerPitch(ctx, W, H);

    // Build density grid for smooth heatmap
    let gridW = Math.floor(W / 4);
    let gridH = Math.floor(H / 4);
    let grid = new Float32Array(gridW * gridH);
    let sigma = Math.max(gridW, gridH) * 0.05; // Gaussian sigma

    command.points.forEach((pt) => {
      let [cx, cy] = pitchToCanvas(pt.x, pt.y, W, H);
      let gx = Math.floor((cx / W) * gridW);
      let gy = Math.floor((cy / H) * gridH);
      let radius = Math.ceil(sigma * 2);
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          let nx = gx + dx;
          let ny = gy + dy;
          if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
          let dist2 = dx * dx + dy * dy;
          grid[ny * gridW + nx] += Math.exp(-dist2 / (2 * sigma * sigma));
        }
      }
    });

    // Normalize grid
    let maxVal = 0;
    for (let i = 0; i < grid.length; i++) if (grid[i] > maxVal) maxVal = grid[i];
    if (maxVal === 0) maxVal = 1;

    // Draw heatmap as colored cells
    let cellW = W / gridW;
    let cellH = H / gridH;
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        let val = grid[gy * gridW + gx] / maxVal;
        if (val < 0.01) continue;
        // Color: blue → cyan → yellow → red (cool to hot)
        let r: number, g: number, b: number;
        if (val < 0.25) {
          r = 0; g = Math.round(val * 4 * 255); b = 255;
        } else if (val < 0.5) {
          r = 0; g = 255; b = Math.round((1 - (val - 0.25) * 4) * 255);
        } else if (val < 0.75) {
          r = Math.round((val - 0.5) * 4 * 255); g = 255; b = 0;
        } else {
          r = 255; g = Math.round((1 - (val - 0.75) * 4) * 255); b = 0;
        }
        ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(0.8, val * 0.9)})`;
        ctx.fillRect(gx * cellW, gy * cellH, cellW + 1, cellH + 1);
      }
    }

    ctx.restore();

    // Label stays fixed (not affected by zoom/pan)
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(4, 4, 200, 22);
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(`${command.actionType} · ${command.totalCount} events`, 8, 15);
  }
}
