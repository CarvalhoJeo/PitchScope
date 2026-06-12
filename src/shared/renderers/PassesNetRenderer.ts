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

  /** Node circle radius in canvas pixels, scaled by how active the player was. */
  private nodeRadius(node: PassesNetNode): number {
    return Math.max(10, Math.min(25, 10 + node.actionCount / 5));
  }

  /**
   * Improves readability of the layout in two passes, mutating `nodePos`:
   *   1. Spread — push each team's nodes out from the team centroid so the
   *      formation fills the pitch instead of bunching toward midfield.
   *   2. Relax — iteratively separate any node circles that still overlap.
   * Positions are clamped to the pitch so nodes never leave the canvas.
   */
  private declutter(nodes: PassesNetNode[], nodePos: Map<number, [number, number]>, W: number, H: number): void {
    if (nodes.length < 2) return;
    const SPREAD = 1.3; // gentle fan-out from the team centroid (positions are now direction-normalized)
    const PADDING = 4; // extra gap between separated circles (px)
    const MAX_ITERATIONS = 80;

    let clamp = (p: [number, number], r: number) => {
      p[0] = Math.min(W - r, Math.max(r, p[0]));
      p[1] = Math.min(H - r, Math.max(r, p[1]));
    };

    // 1. Spread each team out from its own centroid
    let teams = new Map<number, PassesNetNode[]>();
    nodes.forEach((node) => {
      let group = teams.get(node.teamId);
      if (group === undefined) teams.set(node.teamId, [node]);
      else group.push(node);
    });
    teams.forEach((teamNodes) => {
      if (teamNodes.length < 2) return;
      let cx = 0;
      let cy = 0;
      teamNodes.forEach((node) => {
        let p = nodePos.get(node.playerId)!;
        cx += p[0];
        cy += p[1];
      });
      cx /= teamNodes.length;
      cy /= teamNodes.length;
      teamNodes.forEach((node) => {
        let p = nodePos.get(node.playerId)!;
        p[0] = cx + (p[0] - cx) * SPREAD;
        p[1] = cy + (p[1] - cy) * SPREAD;
        clamp(p, this.nodeRadius(node));
      });
    });

    // 2. Relax overlaps
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      let moved = false;
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          let a = nodePos.get(nodes[i].playerId)!;
          let b = nodePos.get(nodes[j].playerId)!;
          let minDist = this.nodeRadius(nodes[i]) + this.nodeRadius(nodes[j]) + PADDING;
          let dx = b[0] - a[0];
          let dy = b[1] - a[1];
          let dist = Math.hypot(dx, dy) || 0.01;
          if (dist < minDist) {
            let shift = (minDist - dist) / 2;
            let ux = dx / dist;
            let uy = dy / dist;
            a[0] -= ux * shift;
            a[1] -= uy * shift;
            b[0] += ux * shift;
            b[1] += uy * shift;
            moved = true;
          }
        }
      }
      nodes.forEach((node) => clamp(nodePos.get(node.playerId)!, this.nodeRadius(node)));
      if (!moved) break;
    }
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

    // De-clutter: average positions bunch toward midfield, so spread each
    // team's nodes out from their centroid and then separate any overlaps.
    this.declutter(command.nodes, nodePos, W, H);

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

      let radius = this.nodeRadius(node);
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
