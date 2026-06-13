// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { PITCH_ASPECT_RATIO, TEAM_COLORS } from "../SoccerTypes";
import { createUUID } from "../util";
import { drawSoccerPitch, pitchToCanvas } from "./soccer/SoccerPitch";
import { ZoomPanState } from "./soccer/ZoomPan";
import TabRenderer from "./TabRenderer";

export interface SoccerFieldRendererCommand {
  players: { playerId: number; teamId: number; x: number; y: number }[];
  showLabels: boolean;
  teamFilter: string;
}

interface PlayerGroup {
  id: string;
  color: string;
  playerIds: number[];
}

// Distinct from TEAM_COLORS (red/blue) so group lines stand out against player dots.
const GROUP_COLORS = ["#f1c40f", "#9b59b6", "#1abc9c", "#e67e22", "#ecf0f1", "#e84393"];

// Max pointer movement (CSS px) between mousedown and mouseup still treated as a click, not a pan.
const CLICK_MOVE_THRESHOLD = 5;

// Player hit radius in pitch/world units (player dots are drawn at radius 8).
const HIT_RADIUS = 12;

export default class SoccerFieldRenderer implements TabRenderer {
  private CONTAINER: HTMLElement;
  private CANVAS: HTMLCanvasElement;
  private TOOLBAR: HTMLElement;
  private lastRenderState = "";
  private lastCommand: SoccerFieldRendererCommand | null = null;
  private zoomPan = new ZoomPanState();

  // Group state
  private groups: PlayerGroup[] = [];
  private activeGroupId: string | null = null;
  private showHull = true;

  // Click vs. drag tracking
  private downX = 0;
  private downY = 0;

  // Geometry of the last render, needed to hit-test clicks against player dots.
  private lastDims: { W: number; H: number } | null = null;

  constructor(root: HTMLElement) {
    this.CONTAINER = root.getElementsByClassName("soccer-field-canvas-container")[0] as HTMLElement;
    this.CANVAS = root.getElementsByClassName("soccer-field-canvas")[0] as HTMLCanvasElement;
    this.zoomPan.attach(this.CANVAS, () => {
      this.lastRenderState = "";
      if (this.lastCommand) this.render(this.lastCommand);
    });

    // Build the group-management toolbar overlaid on the pitch.
    this.TOOLBAR = document.createElement("div");
    this.TOOLBAR.classList.add("soccer-group-toolbar");
    this.CONTAINER.appendChild(this.TOOLBAR);
    this.renderToolbar();

    // Click-to-select players (independent of ZoomPan's drag-to-pan).
    this.CANVAS.addEventListener("mousedown", (e) => {
      this.downX = e.clientX;
      this.downY = e.clientY;
    });
    this.CANVAS.addEventListener("mouseup", (e) => {
      let moved = Math.hypot(e.clientX - this.downX, e.clientY - this.downY);
      if (moved <= CLICK_MOVE_THRESHOLD) this.handleClick(e);
    });
  }

  saveState(): unknown {
    return {
      groups: this.groups,
      activeGroupId: this.activeGroupId,
      showHull: this.showHull
    };
  }

  restoreState(state: unknown): void {
    if (typeof state !== "object" || state === null) return;
    let s = state as any;
    if (Array.isArray(s.groups)) this.groups = s.groups;
    if (typeof s.activeGroupId === "string" || s.activeGroupId === null) this.activeGroupId = s.activeGroupId;
    if (typeof s.showHull === "boolean") this.showHull = s.showHull;
    this.renderToolbar();
    this.lastRenderState = "";
  }

  getAspectRatio(): number | null {
    return PITCH_ASPECT_RATIO;
  }

  /** Converts a mouse event to pitch/world coordinates, inverting the zoom/pan transform. */
  private eventToWorld(e: MouseEvent): [number, number] {
    let rect = this.CANVAS.getBoundingClientRect();
    let mx = e.clientX - rect.left;
    let my = e.clientY - rect.top;
    return [(mx - this.zoomPan.panX) / this.zoomPan.zoom, (my - this.zoomPan.panY) / this.zoomPan.zoom];
  }

  /** Handles a click on the pitch: toggles the nearest player in/out of the active group. */
  private handleClick(e: MouseEvent): void {
    if (!this.lastCommand || !this.lastDims) return;
    let { W, H } = this.lastDims;
    let [wx, wy] = this.eventToWorld(e);

    // Find nearest player within the hit radius.
    let players = this.filterPlayers(this.lastCommand);
    let nearest: { playerId: number; dist: number } | null = null;
    for (let player of players) {
      let [cx, cy] = pitchToCanvas(player.x, player.y, W, H);
      let dist = Math.hypot(wx - cx, wy - cy);
      if (dist <= HIT_RADIUS && (nearest === null || dist < nearest.dist)) {
        nearest = { playerId: player.playerId, dist };
      }
    }
    if (nearest === null) return;

    // Ensure there is an active group to add to.
    let group = this.groups.find((g) => g.id === this.activeGroupId);
    if (!group) group = this.addGroup();

    let idx = group.playerIds.indexOf(nearest.playerId);
    if (idx === -1) {
      group.playerIds.push(nearest.playerId);
    } else {
      group.playerIds.splice(idx, 1);
    }
    this.renderToolbar();
    this.lastRenderState = "";
    this.render(this.lastCommand);
  }

  private addGroup(): PlayerGroup {
    let color = GROUP_COLORS[this.groups.length % GROUP_COLORS.length];
    let group: PlayerGroup = { id: createUUID(), color, playerIds: [] };
    this.groups.push(group);
    this.activeGroupId = group.id;
    return group;
  }

  private deleteGroup(id: string): void {
    this.groups = this.groups.filter((g) => g.id !== id);
    if (this.activeGroupId === id) {
      this.activeGroupId = this.groups.length > 0 ? this.groups[this.groups.length - 1].id : null;
    }
  }

  /** Rebuilds the toolbar DOM from current group state. */
  private renderToolbar(): void {
    this.TOOLBAR.replaceChildren();

    let row = document.createElement("div");
    row.classList.add("soccer-group-row");
    this.TOOLBAR.appendChild(row);

    let addButton = document.createElement("button");
    addButton.textContent = "＋ Group";
    addButton.title = "Create a new player group";
    addButton.addEventListener("click", () => {
      this.addGroup();
      this.renderToolbar();
      this.lastRenderState = "";
      if (this.lastCommand) this.render(this.lastCommand);
    });
    row.appendChild(addButton);

    // One chip per group.
    this.groups.forEach((group) => {
      let chip = document.createElement("div");
      chip.classList.add("soccer-group-chip");
      if (group.id === this.activeGroupId) chip.classList.add("active");
      chip.style.setProperty("--group-color", group.color);
      chip.title = "Click to make active";
      chip.addEventListener("click", (e) => {
        if (e.target === chip.querySelector(".soccer-group-delete")) return;
        this.activeGroupId = group.id;
        this.renderToolbar();
        this.lastRenderState = "";
        if (this.lastCommand) this.render(this.lastCommand);
      });

      let dot = document.createElement("span");
      dot.classList.add("soccer-group-dot");
      chip.appendChild(dot);

      let label = document.createElement("span");
      label.textContent = group.playerIds.length.toString();
      chip.appendChild(label);

      let del = document.createElement("span");
      del.classList.add("soccer-group-delete");
      del.textContent = "✕";
      del.title = "Delete group";
      del.addEventListener("click", (e) => {
        e.stopPropagation();
        this.deleteGroup(group.id);
        this.renderToolbar();
        this.lastRenderState = "";
        if (this.lastCommand) this.render(this.lastCommand);
      });
      chip.appendChild(del);

      row.appendChild(chip);
    });

    // Hull toggle + clear (only meaningful once groups exist).
    if (this.groups.length > 0) {
      let hullLabel = document.createElement("label");
      hullLabel.classList.add("soccer-group-hull");
      let hullCheck = document.createElement("input");
      hullCheck.type = "checkbox";
      hullCheck.checked = this.showHull;
      hullCheck.addEventListener("change", () => {
        this.showHull = hullCheck.checked;
        this.lastRenderState = "";
        if (this.lastCommand) this.render(this.lastCommand);
      });
      hullLabel.appendChild(hullCheck);
      hullLabel.appendChild(document.createTextNode(" Hull"));
      row.appendChild(hullLabel);

      let clearButton = document.createElement("button");
      clearButton.textContent = "Clear";
      clearButton.title = "Remove all groups";
      clearButton.addEventListener("click", () => {
        this.groups = [];
        this.activeGroupId = null;
        this.renderToolbar();
        this.lastRenderState = "";
        if (this.lastCommand) this.render(this.lastCommand);
      });
      row.appendChild(clearButton);
    }

    let hint = document.createElement("div");
    hint.classList.add("soccer-group-hint");
    hint.textContent =
      this.groups.length === 0
        ? "Add a group, then click players to build a formation line."
        : "Click players to add them to the active group.";
    this.TOOLBAR.appendChild(hint);
  }

  private filterPlayers(command: SoccerFieldRendererCommand): SoccerFieldRendererCommand["players"] {
    if (command.teamFilter === "all") return command.players;
    let teamId = parseInt(command.teamFilter);
    return command.players.filter((p) => p.teamId === teamId);
  }

  /** Draws all group geometry (hull, connecting line, member rings) over the player dots. */
  private drawGroups(ctx: CanvasRenderingContext2D, players: SoccerFieldRendererCommand["players"], W: number, H: number): void {
    let positionsById = new Map<number, [number, number]>();
    players.forEach((player) => positionsById.set(player.playerId, pitchToCanvas(player.x, player.y, W, H)));

    this.groups.forEach((group) => {
      let points = group.playerIds
        .map((id) => positionsById.get(id))
        .filter((p): p is [number, number] => p !== undefined);
      if (points.length === 0) return;

      // Translucent convex hull (the shape/block the group covers).
      if (this.showHull && points.length >= 3) {
        let hull = convexHull(points);
        ctx.beginPath();
        hull.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.closePath();
        ctx.fillStyle = hexToRgba(group.color, 0.12);
        ctx.fill();
      }

      // Connecting line, sorted by vertical position so a back line reads cleanly.
      if (points.length >= 2) {
        let ordered = [...points].sort((a, b) => a[1] - b[1]);
        ctx.beginPath();
        ordered.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
        ctx.strokeStyle = group.color;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }

      // Ring around each member so grouped players are identifiable.
      ctx.strokeStyle = group.color;
      ctx.lineWidth = 2.5;
      points.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 11, 0, Math.PI * 2);
        ctx.stroke();
      });
    });
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
    this.lastDims = { W, H };

    let renderState = JSON.stringify([
      W,
      H,
      window.devicePixelRatio,
      command,
      this.zoomPan.key(),
      this.groups,
      this.activeGroupId,
      this.showHull
    ]);
    if (renderState === this.lastRenderState) return;
    this.lastRenderState = renderState;

    this.CANVAS.style.width = W + "px";
    this.CANVAS.style.height = H + "px";
    this.CANVAS.width = W * window.devicePixelRatio;
    this.CANVAS.height = H * window.devicePixelRatio;

    let ctx = this.CANVAS.getContext("2d") as CanvasRenderingContext2D;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Filter players
    let players = this.filterPlayers(command);

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

    // Draw group lines/hulls/rings on top of the dots.
    this.drawGroups(ctx, players, W, H);

    ctx.restore();
  }
}

/** Andrew's monotone chain convex hull. Returns hull vertices in order. */
function convexHull(points: [number, number][]): [number, number][] {
  let pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;
  let cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  let lower: [number, number][] = [];
  for (let p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  let upper: [number, number][] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    let p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Converts a #rrggbb hex color to an rgba() string with the given alpha. */
function hexToRgba(hex: string, alpha: number): string {
  let r = parseInt(hex.slice(1, 3), 16);
  let g = parseInt(hex.slice(3, 5), 16);
  let b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
