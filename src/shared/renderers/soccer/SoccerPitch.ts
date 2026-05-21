// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { PITCH_HEIGHT_M, PITCH_WIDTH_M } from "../../SoccerTypes";

/**
 * Converts SPADL pitch coordinates (0-100 x, 0-100 y) to canvas pixels.
 * SPADL: x goes 0→100 left to right, y goes 0→100 bottom to top.
 * Canvas: y axis is flipped (0 at top, H at bottom).
 */
export function pitchToCanvas(x: number, y: number, W: number, H: number): [number, number] {
  return [(x / 100) * W, (1 - y / 100) * H];
}

/**
 * Draws a full soccer pitch on the given canvas context.
 * W and H are the canvas logical dimensions (before devicePixelRatio scaling).
 */
export function drawSoccerPitch(ctx: CanvasRenderingContext2D, W: number, H: number): void {
  // Metric proportions relative to canvas size
  const scaleX = (m: number) => (m / PITCH_WIDTH_M) * W;
  const scaleY = (m: number) => (m / PITCH_HEIGHT_M) * H;

  // Background
  ctx.fillStyle = "#2d5a1b";
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Helper to draw a filled circle
  function fillCircle(cx: number, cy: number, r: number) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Helper to draw a stroked circle/arc
  function strokeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.stroke();
  }

  function strokeRect(x: number, y: number, w: number, h: number) {
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.stroke();
  }

  // Outer boundary
  strokeRect(0, 0, W, H);

  // Center line
  ctx.beginPath();
  ctx.moveTo(W / 2, 0);
  ctx.lineTo(W / 2, H);
  ctx.stroke();

  // Center circle (radius 9.15m)
  strokeArc(W / 2, H / 2, scaleX(9.15), 0, Math.PI * 2);

  // Center spot
  ctx.fillStyle = "#ffffff";
  fillCircle(W / 2, H / 2, 3);

  // --- Left penalty area (16.5m deep, 40.32m wide = 2 * 20.16m from center) ---
  const paDepth = scaleX(16.5);
  const paHalfH = scaleY(20.16);
  const paCenterY = H / 2;

  // Left penalty area
  strokeRect(0, paCenterY - paHalfH, paDepth, paHalfH * 2);

  // Right penalty area
  strokeRect(W - paDepth, paCenterY - paHalfH, paDepth, paHalfH * 2);

  // --- Goal areas: 5.5m deep, 18.32m wide = 2 * 9.16m from center ---
  const gaDepth = scaleX(5.5);
  const gaHalfH = scaleY(9.16);

  // Left goal area
  strokeRect(0, paCenterY - gaHalfH, gaDepth, gaHalfH * 2);

  // Right goal area
  strokeRect(W - gaDepth, paCenterY - gaHalfH, gaDepth, gaHalfH * 2);

  // --- Penalty spots at 11m from each goal line ---
  const penSpotX_left = scaleX(11);
  const penSpotX_right = W - scaleX(11);
  fillCircle(penSpotX_left, paCenterY, 3);
  fillCircle(penSpotX_right, paCenterY, 3);

  // --- Penalty arcs (9.15m radius from penalty spot, outside penalty area) ---
  const penArcRadius = scaleX(9.15);
  // Left arc: portion outside penalty area (angle where arc exits box)
  const leftArcAngle = Math.acos((paDepth - scaleX(11)) / penArcRadius);
  strokeArc(penSpotX_left, paCenterY, penArcRadius, -leftArcAngle, leftArcAngle);

  // Right arc: portion outside penalty area (mirror)
  const rightArcAngle = Math.PI - leftArcAngle;
  strokeArc(penSpotX_right, paCenterY, penArcRadius, rightArcAngle, Math.PI + leftArcAngle);

  // --- Goals: 2.44m deep (into pitch from line), 7.32m wide = 2 * 3.66m from center ---
  const goalDepth = scaleX(2.44);
  const goalHalfH = scaleY(3.66);

  ctx.fillStyle = "rgba(255, 255, 255, 0.15)";
  ctx.strokeStyle = "#ffffff";

  // Left goal
  ctx.beginPath();
  ctx.rect(-goalDepth, paCenterY - goalHalfH, goalDepth, goalHalfH * 2);
  ctx.fill();
  ctx.stroke();

  // Right goal
  ctx.beginPath();
  ctx.rect(W, paCenterY - goalHalfH, goalDepth, goalHalfH * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#ffffff";

  // --- Corner arcs (1m radius) ---
  const cornerR = scaleX(1);
  // Top-left corner (canvas top = SPADL y=100)
  strokeArc(0, 0, cornerR, 0, Math.PI / 2);
  // Top-right corner
  strokeArc(W, 0, cornerR, Math.PI / 2, Math.PI);
  // Bottom-right corner
  strokeArc(W, H, cornerR, Math.PI, (3 * Math.PI) / 2);
  // Bottom-left corner
  strokeArc(0, H, cornerR, (3 * Math.PI) / 2, 2 * Math.PI);
}
