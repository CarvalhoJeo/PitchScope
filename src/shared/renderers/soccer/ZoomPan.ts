// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

/** Shared zoom/pan state for soccer pitch renderers.
 *  Scroll to zoom (centered on cursor), drag to pan, double-click to reset.
 */
export class ZoomPanState {
  zoom = 1;
  panX = 0;
  panY = 0;
  private dragging = false;
  private lastX = 0;
  private lastY = 0;

  attach(canvas: HTMLCanvasElement, onChanged: () => void): void {
    canvas.style.cursor = "grab";

    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        let rect = canvas.getBoundingClientRect();
        let mx = e.clientX - rect.left;
        let my = e.clientY - rect.top;
        let factor = e.deltaY < 0 ? 1.2 : 1 / 1.2;
        let newZoom = Math.max(0.5, Math.min(15, this.zoom * factor));
        let scale = newZoom / this.zoom;
        this.panX = mx + scale * (this.panX - mx);
        this.panY = my + scale * (this.panY - my);
        this.zoom = newZoom;
        onChanged();
      },
      { passive: false }
    );

    canvas.addEventListener("mousedown", (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      canvas.style.cursor = "grabbing";
    });

    window.addEventListener("mousemove", (e) => {
      if (!this.dragging) return;
      this.panX += e.clientX - this.lastX;
      this.panY += e.clientY - this.lastY;
      this.lastX = e.clientX;
      this.lastY = e.clientY;
      onChanged();
    });

    window.addEventListener("mouseup", () => {
      if (!this.dragging) return;
      this.dragging = false;
      canvas.style.cursor = "grab";
    });

    canvas.addEventListener("dblclick", () => {
      this.zoom = 1;
      this.panX = 0;
      this.panY = 0;
      onChanged();
    });
  }

  apply(ctx: CanvasRenderingContext2D): void {
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.zoom, this.zoom);
  }

  key(): string {
    return `${this.zoom.toFixed(4)},${this.panX.toFixed(2)},${this.panY.toFixed(2)}`;
  }
}
