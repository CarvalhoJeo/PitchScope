// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

/** 1-D horizontal zoom/pan for the Event Timeline canvas. */
export class TimelineZoomState {
  private _zoom = 1;   // 1 = full range visible; higher = zoomed in
  private _pan  = 0;   // left-edge offset as fraction of full span [0, 1 - 1/zoom]

  /**
   * Attach wheel / drag / dblclick listeners to the canvas.
   * @param getRange  Returns the full [tMin, tMax] of the log (may change each render).
   * @param getPlot   Returns the plot area {left, width} in CSS pixels.
   * @param onChange  Called whenever zoom or pan changes — the caller should redraw.
   */
  attach(
    canvas: HTMLCanvasElement,
    getRange: () => [number, number],
    getPlot:  () => { left: number; width: number },
    onChange: () => void
  ): void {
    let dragStartX   = 0;
    let dragStartPan = 0;
    let dragging     = false;

    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const [tMin, tMax] = getRange();
      const { left, width } = getPlot();
      // Map clientX to a fraction [0,1] within the plot area.
      const rect = canvas.getBoundingClientRect();
      const cssX  = e.clientX - rect.left - left;
      const frac  = Math.max(0, Math.min(1, cssX / width));
      this._applyWheel(e.deltaY, frac, tMin, tMax);
      onChange();
    }, { passive: false });

    canvas.addEventListener("mousedown", (e) => {
      dragging     = true;
      dragStartX   = e.clientX;
      dragStartPan = this._pan;
    });

    canvas.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const [tMin, tMax] = getRange();
      const { width } = getPlot();
      const rect = canvas.getBoundingClientRect();
      const dx = e.clientX - dragStartX;  // CSS pixels since drag start
      this._applyDrag(dx, dragStartPan, width, tMin, tMax);
      onChange();
    });

    const endDrag = () => { dragging = false; };
    canvas.addEventListener("mouseup",    endDrag);
    canvas.addEventListener("mouseleave", endDrag);

    canvas.addEventListener("dblclick", () => {
      this.reset();
      onChange();
    });
  }

  /** Compute the visible [start, end] time from the full [tMin, tMax]. */
  visibleRange(tMin: number, tMax: number): [number, number] {
    const span = tMax - tMin;
    const visDuration = span / this._zoom;
    const start = tMin + this._pan * span;
    return [start, start + visDuration];
  }

  /** True when the view is zoomed in (use to show/hide hints). */
  isZoomed(): boolean {
    return this._zoom > 1.001;
  }

  reset(): void {
    this._zoom = 1;
    this._pan  = 0;
  }

  /** Opaque string — include in render-cache key to detect zoom/pan changes. */
  key(): string {
    return `${this._zoom.toFixed(6)},${this._pan.toFixed(6)}`;
  }

  private _applyWheel(deltaY: number, cursorFraction: number, tMin: number, tMax: number): void {
    const span = tMax - tMin;
    const [visStart] = this.visibleRange(tMin, tMax);
    const visDuration = span / this._zoom;
    const cursorTime  = visStart + cursorFraction * visDuration;

    const factor = deltaY > 0 ? 1 / 1.15 : 1.15;
    this._zoom = Math.max(1, Math.min(200, this._zoom * factor));

    const newVisDuration = span / this._zoom;
    const newVisStart    = cursorTime - cursorFraction * newVisDuration;
    this._pan = this._clampPan((newVisStart - tMin) / span);
  }

  private _applyDrag(
    dx: number,
    startPan: number,
    plotWidthCss: number,
    tMin: number,
    tMax: number
  ): void {
    const span        = tMax - tMin;
    const visDuration = span / this._zoom;
    const timePerPx   = visDuration / plotWidthCss;
    // Dragging right moves the view left (negative pan delta).
    const deltaPan    = -(dx * timePerPx) / span;
    this._pan = this._clampPan(startPan + deltaPan);
  }

  private _clampPan(pan: number): number {
    const maxPan = Math.max(0, 1 - 1 / this._zoom);
    return Math.max(0, Math.min(maxPan, pan));
  }
}
