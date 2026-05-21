// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { PITCH_ASPECT_RATIO, TEAM_COLORS } from "../SoccerTypes";
import { drawSoccerPitch, pitchToCanvas } from "./soccer/SoccerPitch";
import { ZoomPanState } from "./soccer/ZoomPan";
import TabRenderer from "./TabRenderer";

export interface SoccerFieldRendererCommand {
  players: { playerId: number; teamId: number; x: number; y: number }[];
  showLabels: boolean;
  teamFilter: string;
}

export default class SoccerFieldRenderer implements TabRenderer {
  private CONTAINER: HTMLElement;
  private CANVAS: HTMLCanvasElement;
  private lastRenderState = "";
  private lastCommand: SoccerFieldRendererCommand | null = null;
  private zoomPan = new ZoomPanState();

  constructor(root: HTMLElement) {
    this.CONTAINER = root.getElementsByClassName("soccer-field-canvas-container")[0] as HTMLElement;
    this.CANVAS = root.getElementsByClassName("soccer-field-canvas")[0] as HTMLCanvasElement;
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

  render(command: SoccerFieldRendererCommand): void {
    this.lastCommand = command;
    let containerWidth = this.CONTAINER.clientWidth;
    let containerHeight = this.CONTAINER.clientHeight;
    if (containerWidth === 0 || containerHeight === 0) return;

    // Maintain aspect ratio within container
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

    // Filter players
    let players = command.players;
    if (command.teamFilter !== "all") {
      let teamId = parseInt(command.teamFilter);
      players = players.filter((p) => p.teamId === teamId);
    }

    if (players.length === 0) {
      drawSoccerPitch(ctx, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No tracking data — load a .tracking file", W / 2, H / 2);
      return;
    }

    ctx.save();
    this.zoomPan.apply(ctx);

    drawSoccerPitch(ctx, W, H);

    // Draw player dots
    players.forEach((player) => {
      let [cx, cy] = pitchToCanvas(player.x, player.y, W, H);
      let color = TEAM_COLORS[player.teamId] ?? "#aaaaaa";

      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      if (command.showLabels) {
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(player.playerId.toString(), cx, cy);
      }
    });

    ctx.restore();
  }
}
