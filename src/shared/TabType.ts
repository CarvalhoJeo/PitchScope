// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

// Numeric values are explicit and stable: the hub looks up each tab's control
// and renderer panels by id ("controller<value>" / "renderer<value>"), so
// removing a tab type must not renumber the survivors. FRC-specific tabs have
// been purged, leaving gaps in the sequence.
enum TabType {
  Documentation = 0,
  LineGraph = 1,
  Statistics = 6,
  Video = 7,
  SoccerField = 13,
  PassesNet = 14,
  ActionHeatmap = 15,
  PositionHeatmap = 17
}

export default TabType;

export function getAllTabTypes(): TabType[] {
  return Object.values(TabType).filter((tabType) => typeof tabType === "number") as TabType[];
}

export const LITE_COMPATIBLE_TABS = [
  TabType.Documentation,
  TabType.LineGraph,
  TabType.Statistics,
  TabType.SoccerField,
  TabType.PassesNet,
  TabType.ActionHeatmap,
  TabType.PositionHeatmap
];

export function getDefaultTabTitle(type: TabType): string {
  switch (type) {
    case TabType.Documentation:
      return "";
    case TabType.LineGraph:
      return "Line Graph";
    case TabType.Statistics:
      return "Statistics";
    case TabType.Video:
      return "Video";
    case TabType.SoccerField:
      return "Soccer Field";
    case TabType.PassesNet:
      return "Passing Network";
    case TabType.ActionHeatmap:
      return "Action Heatmap";
    case TabType.PositionHeatmap:
      return "Position Heatmap";
    default:
      return "";
  }
}

export function getTabIcon(type: TabType): string {
  switch (type) {
    case TabType.Documentation:
      return "📖";
    case TabType.LineGraph:
      return "📉";
    case TabType.Statistics:
      return "📊";
    case TabType.Video:
      return "🎬";
    case TabType.SoccerField:
      return "⚽";
    case TabType.PassesNet:
      return "🕸";
    case TabType.ActionHeatmap:
      return "🌡";
    case TabType.PositionHeatmap:
      return "🔥";
    default:
      return "";
  }
}

export function getTabAccelerator(type: TabType): string {
  if (type === TabType.Documentation) return "";
  return (
    "Alt+" +
    (() => {
      switch (type) {
        case TabType.LineGraph:
          return "G";
        case TabType.Statistics:
          return "S";
        case TabType.Video:
          return "V";
        case TabType.SoccerField:
          return "F";
        case TabType.PassesNet:
          return "N";
        case TabType.ActionHeatmap:
          return "H";
        case TabType.PositionHeatmap:
          return "Y";
        default:
          return "";
      }
    })()
  );
}
