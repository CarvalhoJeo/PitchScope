// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import { SourceListConfig } from "../../shared/SourceListConfig";

export const PositionHeatmapController_Config: SourceListConfig = {
  title: "Players",
  autoAdvance: false,
  allowChildrenFromDrag: false,
  types: [
    {
      key: "player",
      display: "Player",
      symbol: "location.fill",
      showInTypeName: false,
      color: "#888888",
      sourceTypes: ["TeamLocationPlayer"],
      showDocs: false,
      options: []
    }
  ]
};
