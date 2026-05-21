// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

export const PITCH_WIDTH_M = 105;
export const PITCH_HEIGHT_M = 68;
export const PITCH_ASPECT_RATIO = PITCH_WIDTH_M / PITCH_HEIGHT_M;

export const SPADL_ACTION_TYPES: Record<number, string> = {
  0: "pass",
  1: "cross",
  2: "throw_in",
  3: "freekick_cross",
  4: "freekick_shot",
  5: "corner_cross",
  6: "corner_short",
  7: "take_on",
  8: "foul",
  9: "tackle",
  10: "interception",
  11: "shot",
  12: "penalty_shot",
  13: "free_kick_shot",
  14: "keeper_pick_up",
  15: "clearance",
  16: "bad_touch",
  17: "non_action",
  18: "dribble",
  19: "goalkick"
};

export const SPADL_RESULT_TYPES: Record<number, string> = {
  0: "fail",
  1: "success",
  2: "offside",
  3: "owngoal",
  4: "yellow_card",
  5: "red_card",
  6: "yellow_red_card"
};

export const SPADL_BODYPART_TYPES: Record<number, string> = {
  0: "foot",
  1: "head",
  2: "other",
  3: "no_touch"
};

// Pass action IDs (pass, cross, throw_in, freekick_cross, corner_cross, corner_short)
export const PASS_ACTION_IDS = [0, 1, 2, 3, 5, 6];

// Team colors (team_id 1 = home, 2 = away)
export const TEAM_COLORS: Record<number, string> = {
  1: "#e74c3c",
  2: "#3498db"
};

export const TEAM_COLORS_DARK: Record<number, string> = {
  1: "#c0392b",
  2: "#2980b9"
};
