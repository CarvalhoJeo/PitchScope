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

export interface PassesNetNode {
  playerId: number;
  teamId: number;
  avgX: number;
  avgY: number;
  actionCount: number;
}

export interface PassesNetEdge {
  fromPlayer: number;
  toPlayer: number;
  count: number;
  teamId: number;
}

export interface PassesNetRendererCommand {
  nodes: PassesNetNode[];
  edges: PassesNetEdge[];
  maxEdgeCount: number;
  showCounts: boolean;
}

export default class PassesNetRenderer implements TabRenderer {
  private CONTAINER: HTMLElement;
  private CANVAS: HTMLCanvasElement;
  private lastRenderState = "";
  private lastCommand: PassesNetRendererCommand | null = null;
  private zoomPan = new ZoomPanState();

  constructor(root: HTMLElement) {
    this.CONTAINER = root.getElementsByClassName("passes-net-canvas-container")[0] as HTMLElement;
    this.CANVAS = root.getElementsByClassName("passes-net-canvas")[0] as HTMLCanvasElement;
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

  render(command: PassesNetRendererCommand): void {
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

    if (command.nodes.length === 0) {
      drawSoccerPitch(ctx, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = "16px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("Load a .spadl and .tracking file", W / 2, H / 2);
      return;
    }

    ctx.save();
    this.zoomPan.apply(ctx);

    drawSoccerPitch(ctx, W, H);

    // Build node position lookup
    let nodePos = new Map<number, [number, number]>();
    command.nodes.forEach((n) => {
      nodePos.set(n.playerId, pitchToCanvas(n.avgX, n.avgY, W, H));
    });

    // Draw edges — one undirected line per player pair, weighted by total passes
    let maxCount = command.maxEdgeCount || 1;
    command.edges.forEach((edge) => {
      let from = nodePos.get(edge.fromPlayer);
      let to = nodePos.get(edge.toPlayer);
      if (!from || !to) return;

      let color = TEAM_COLORS[edge.teamId] ?? "#aaaaaa";
      let alpha = 0.3 + 0.5 * (edge.count / maxCount);
      let lineWidth = 1 + (edge.count / maxCount) * 8;
      let strokeColor = color + Math.round(alpha * 255).toString(16).padStart(2, "0");

      ctx.beginPath();
      ctx.moveTo(from[0], from[1]);
      ctx.lineTo(to[0], to[1]);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.stroke();

      // Count label at the line midpoint
      if (command.showCounts) {
        const midX = (from[0] + to[0]) / 2;
        const midY = (from[1] + to[1]) / 2;
        ctx.save();
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "rgba(0,0,0,0.75)";
        ctx.lineWidth = 3;
        ctx.strokeText(edge.count.toString(), midX, midY);
        ctx.fillText(edge.count.toString(), midX, midY);
        ctx.restore();
      }
    });

    // Draw nodes
    command.nodes.forEach((node) => {
      let pos = nodePos.get(node.playerId);
      if (!pos) return;

      let radius = Math.max(10, Math.min(25, 10 + node.actionCount / 5));
      let color = TEAM_COLORS[node.teamId] ?? "#aaaaaa";

      ctx.beginPath();
      ctx.arc(pos[0], pos[1], radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.max(8, radius * 0.7)}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(node.playerId.toString(), pos[0], pos[1]);
    });

    ctx.restore();
  }
}
