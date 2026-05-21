// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import Log from "../../../shared/log/Log";
import { HistoricalDataSource_WorkerRequest, HistoricalDataSource_WorkerResponse } from "../HistoricalDataSource";
import { SPADL_ACTION_TYPES, SPADL_BODYPART_TYPES, SPADL_RESULT_TYPES } from "../../../shared/SoccerTypes";

function sendResponse(response: HistoricalDataSource_WorkerResponse) {
  self.postMessage(response);
}

self.onmessage = async (event) => {
  let request: HistoricalDataSource_WorkerRequest = event.data;
  if (request.type !== "start") return;

  try {
    let text = new TextDecoder().decode(request.data[0]);
    let log = new Log(false);

    let lines = text.split("\n");
    // Find header line (skip comment lines starting with #)
    let headerLineIdx = 0;
    while (headerLineIdx < lines.length && lines[headerLineIdx].trimStart().startsWith("#")) {
      headerLineIdx++;
    }
    if (headerLineIdx >= lines.length) {
      sendResponse({ type: "failed" });
      return;
    }

    let header = lines[headerLineIdx].split(",").map((h) => h.trim().toLowerCase());
    let colIdx: Record<string, number> = {};
    header.forEach((col, i) => {
      colIdx[col] = i;
    });

    // Required columns
    const requiredCols = [
      "game_id",
      "period_id",
      "time_seconds",
      "team_id",
      "player_id",
      "start_x",
      "start_y",
      "end_x",
      "end_y",
      "action_type_id",
      "result_id",
      "bodypart_id"
    ];
    for (let col of requiredCols) {
      if (!(col in colIdx)) {
        console.error(`SPADL worker: missing column "${col}"`);
        sendResponse({ type: "failed" });
        return;
      }
    }

    let dataLines = lines.slice(headerLineIdx + 1);
    let totalLines = dataLines.length;
    let lastTimestamp = -Infinity;
    let duplicateOffset = 0;

    for (let i = 0; i < dataLines.length; i++) {
      let line = dataLines[i].trim();
      if (!line) continue;

      let cols = line.split(",");
      if (cols.length < header.length) continue;

      let timeSeconds = parseFloat(cols[colIdx["time_seconds"]]);
      if (isNaN(timeSeconds)) continue;

      // Handle duplicate timestamps with tiny offsets
      if (timeSeconds <= lastTimestamp) {
        duplicateOffset += 0.001;
        timeSeconds = lastTimestamp + 0.001;
      } else {
        duplicateOffset = 0;
      }
      lastTimestamp = timeSeconds;

      let periodId = parseFloat(cols[colIdx["period_id"]]);
      let teamId = parseFloat(cols[colIdx["team_id"]]);
      let playerId = parseFloat(cols[colIdx["player_id"]]);
      let startX = parseFloat(cols[colIdx["start_x"]]);
      let startY = parseFloat(cols[colIdx["start_y"]]);
      let endX = parseFloat(cols[colIdx["end_x"]]);
      let endY = parseFloat(cols[colIdx["end_y"]]);
      let actionTypeId = parseInt(cols[colIdx["action_type_id"]], 10);
      let resultId = parseInt(cols[colIdx["result_id"]], 10);
      let bodypartId = parseInt(cols[colIdx["bodypart_id"]], 10);

      log.putNumber("/SPADL/period_id", timeSeconds, periodId);
      log.putNumber("/SPADL/team_id", timeSeconds, teamId);
      log.putNumber("/SPADL/player_id", timeSeconds, playerId);
      log.putNumber("/SPADL/action_type_id", timeSeconds, actionTypeId);
      log.putString("/SPADL/action_type", timeSeconds, SPADL_ACTION_TYPES[actionTypeId] ?? "unknown");
      log.putNumber("/SPADL/result_id", timeSeconds, resultId);
      log.putString("/SPADL/result", timeSeconds, SPADL_RESULT_TYPES[resultId] ?? "unknown");
      log.putNumber("/SPADL/bodypart_id", timeSeconds, bodypartId);
      log.putString("/SPADL/bodypart", timeSeconds, SPADL_BODYPART_TYPES[bodypartId] ?? "unknown");
      log.putNumber("/SPADL/start_x", timeSeconds, startX);
      log.putNumber("/SPADL/start_y", timeSeconds, startY);
      log.putNumber("/SPADL/end_x", timeSeconds, endX);
      log.putNumber("/SPADL/end_y", timeSeconds, endY);

      if (i % 500 === 0) {
        sendResponse({ type: "progress", value: i / totalLines });
      }
    }

    log.getChangedFields();
    sendResponse({ type: "progress", value: 1 });
    sendResponse({
      type: "initial",
      log: log.toSerialized(),
      isPartial: false
    });
  } catch (e) {
    console.error(e);
    sendResponse({ type: "failed" });
  }
};
