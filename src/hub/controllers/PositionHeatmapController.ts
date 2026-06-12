// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { PositionHeatmapRendererCommand } from "../../shared/renderers/PositionHeatmapRenderer";
import { SourceListState } from "../../shared/SourceListConfig";
import { binPlayerPositions } from "../../shared/soccer/SoccerLogReader";
import { createUUID } from "../../shared/util";
import SourceList from "../SourceList";
import { PositionHeatmapController_Config } from "./PositionHeatmapController_Config";
import TabController from "./TabController";

/** Separable Gaussian blur of a grid, in place. */
function gaussianBlur(grid: Float32Array, w: number, h: number, sigma: number) {
  const radius = Math.max(1, Math.ceil(sigma * 2));
  const kernel = new Float32Array(radius * 2 + 1);
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    let v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel[i + radius] = v;
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;

  const tmp = new Float32Array(grid.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        let xx = x + k;
        if (xx < 0) xx = 0;
        else if (xx >= w) xx = w - 1;
        acc += grid[y * w + xx] * kernel[k + radius];
      }
      tmp[y * w + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        let yy = y + k;
        if (yy < 0) yy = 0;
        else if (yy >= h) yy = h - 1;
        acc += tmp[yy * w + x] * kernel[k + radius];
      }
      grid[y * w + x] = acc;
    }
  }
}

export default class PositionHeatmapController implements TabController {
  UUID = createUUID();

  private GRID_W = 120;
  private GRID_H = 78; // ≈ GRID_W / pitch aspect ratio (105/68), so cells are square on the canvas
  private SIGMA = 4;

  private sourceList: SourceList;
  private TIME_RANGE: HTMLSelectElement;
  private NORMALIZE: HTMLInputElement;

  // The binned density grid is expensive, so cache it by inputs (sources +
  // range + normalize) and only recompute when one of those changes.
  private cache: { key: string; grid: Float32Array; maxVal: number; playerCount: number; sampleCount: number } | null =
    null;

  constructor(root: HTMLElement) {
    this.sourceList = new SourceList(
      root.getElementsByClassName("position-heatmap-sources")[0] as HTMLElement,
      PositionHeatmapController_Config,
      []
    );
    this.TIME_RANGE = root.getElementsByClassName("time-range")[0] as HTMLSelectElement;
    this.NORMALIZE = root.getElementsByClassName("normalize")[0] as HTMLInputElement;
  }

  saveState(): unknown {
    return {
      sources: this.sourceList.getState(),
      timeRange: this.TIME_RANGE.value,
      normalize: this.NORMALIZE.checked
    };
  }

  restoreState(state: unknown): void {
    if (typeof state !== "object" || state === null) return;
    let s = state as any;
    if ("timeRange" in s) this.TIME_RANGE.value = s.timeRange;
    if ("normalize" in s) this.NORMALIZE.checked = s.normalize;
    if ("sources" in s) this.sourceList.setState(s.sources as SourceListState);
  }

  refresh(): void {
    this.sourceList.refresh();
  }

  newAssets(): void {}

  getActiveFields(): string[] {
    return this.sourceList.getActiveFields();
  }

  showTimeline(): boolean {
    return true;
  }

  getCommand(): PositionHeatmapRendererCommand {
    let logRange = window.log.getTimestampRange();
    let [start, end]: [number, number] =
      this.TIME_RANGE.value === "visible" ? window.selection.getTimelineRange() : [logRange[0], logRange[1]];
    let normalize = this.NORMALIZE.checked;
    let sources = this.sourceList.getState(true);

    let key = JSON.stringify(sources.map((item) => item.logKey)) + `|${start}|${end}|${normalize}`;
    if (this.cache === null || this.cache.key !== key) {
      let grid = new Float32Array(this.GRID_W * this.GRID_H);
      let playerCount = 0;
      let sampleCount = 0;
      sources.forEach((item) => {
        let added = binPlayerPositions(item.logKey, start, end, normalize, grid, this.GRID_W, this.GRID_H);
        if (added > 0) {
          playerCount++;
          sampleCount += added;
        }
      });
      if (sampleCount > 0) gaussianBlur(grid, this.GRID_W, this.GRID_H, this.SIGMA);
      let maxVal = 0;
      for (let i = 0; i < grid.length; i++) if (grid[i] > maxVal) maxVal = grid[i];
      this.cache = { key, grid, maxVal: maxVal || 1, playerCount, sampleCount };
    }

    return {
      key,
      grid: this.cache.grid,
      gridW: this.GRID_W,
      gridH: this.GRID_H,
      maxVal: this.cache.maxVal,
      playerCount: this.cache.playerCount,
      sampleCount: this.cache.sampleCount
    };
  }
}
