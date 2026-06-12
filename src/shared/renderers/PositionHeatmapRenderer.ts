// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { PITCH_ASPECT_RATIO } from "../SoccerTypes";
import { drawSoccerPitch } from "./soccer/SoccerPitch";
import { ZoomPanState } from "./soccer/ZoomPan";
import TabRenderer from "./TabRenderer";

export interface PositionHeatmapRendererCommand {
  /** Cheap identity of the underlying data, used for render caching. */
  key: string;
  /** Pre-binned, pre-blurred density grid (canvas-oriented: gx from x, gy from flipped y). */
  grid: Float32Array;
  gridW: number;
  gridH: number;
  maxVal: number;
  playerCount: number;
  sampleCount: number;
}

export default class PositionHeatmapRenderer implements TabRenderer {
  private CONTAINER: HTMLElement;
  private CANVAS: HTMLCanvasElement;
  private lastRenderState = "";
  private lastCommand: PositionHeatmapRendererCommand | null = null;
  private zoomPan = new ZoomPanState();

  constructor(root: HTMLElement) {
    this.CONTAINER = root.getElementsByClassName("position-heatmap-canvas-container")[0] as HTMLElement;
    this.CANVAS = root.getElementsByClassName("position-heatmap-canvas")[0] as HTMLCanvasElement;
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

  render(command: PositionHeatmapRendererCommand): void {
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

    // Render cache keyed by size/zoom + the data identity (NOT the grid itself).
    let renderState = JSON.stringify([W, H, window.devicePixelRatio, command.key, this.zoomPan.key()]);
    if (renderState === this.lastRenderState) return;
    this.lastRenderState = renderState;

    this.CANVAS.style.width = W + "px";
    this.CANVAS.style.height = H + "px";
    this.CANVAS.width = W * window.devicePixelRatio;
    this.CANVAS.height = H * window.devicePixelRatio;

    let ctx = this.CANVAS.getContext("2d") as CanvasRenderingContext2D;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    if (command.sampleCount === 0) {
      drawSoccerPitch(ctx, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Drag players to the Players box", W / 2, H / 2);
      return;
    }

    ctx.save();
    this.zoomPan.apply(ctx);

    drawSoccerPitch(ctx, W, H);

    // Colorize the precomputed grid (blue → cyan → yellow → red)
    let { grid, gridW, gridH, maxVal } = command;
    let cellW = W / gridW;
    let cellH = H / gridH;
    for (let gy = 0; gy < gridH; gy++) {
      for (let gx = 0; gx < gridW; gx++) {
        let val = grid[gy * gridW + gx] / maxVal;
        if (val < 0.01) continue;
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
    ctx.fillRect(4, 4, 220, 22);
    ctx.fillStyle = "#ffffff";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let playerLabel = command.playerCount === 1 ? "1 player" : `${command.playerCount} players`;
    ctx.fillText(`${playerLabel} · ${command.sampleCount} samples`, 8, 15);
  }
}
