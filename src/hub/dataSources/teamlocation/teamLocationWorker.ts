// Copyright (c) 2021-2026 Littleton Robotics
// http://github.com/Mechanical-Advantage
//
// Use of this source code is governed by a BSD
// license that can be found in the LICENSE file
// at the root directory of this project.

import Log from "../../../shared/log/Log";
import LoggableType from "../../../shared/log/LoggableType";
import { HistoricalDataSource_WorkerRequest, HistoricalDataSource_WorkerResponse } from "../HistoricalDataSource";

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
    // Find header line (skip comment lines)
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

    const requiredCols = ["timestamp", "player_id", "team_id", "x", "y"];
    for (let col of requiredCols) {
      if (!(col in colIdx)) {
        console.error(`TeamLocation worker: missing column "${col}"`);
        sendResponse({ type: "failed" });
        return;
      }
    }

    let dataLines = lines.slice(headerLineIdx + 1);
    let totalLines = dataLines.length;

    // Track last timestamp per player to handle duplicates
    let lastTimestampPerPlayer: Record<number, number> = {};

    // Track player prefixes so each can be registered as a draggable group
    let playerPrefixes: Set<string> = new Set();

    for (let i = 0; i < dataLines.length; i++) {
      let line = dataLines[i].trim();
      if (!line) continue;

      let cols = line.split(",");
      if (cols.length < header.length) continue;

      let timestamp = parseFloat(cols[colIdx["timestamp"]]);
      let playerId = parseInt(cols[colIdx["player_id"]], 10);
      let teamId = parseFloat(cols[colIdx["team_id"]]);
      let x = parseFloat(cols[colIdx["x"]]);
      let y = parseFloat(cols[colIdx["y"]]);

      if (isNaN(timestamp) || isNaN(playerId)) continue;

      // Handle duplicate timestamps per player
      let lastTs = lastTimestampPerPlayer[playerId] ?? -Infinity;
      if (timestamp <= lastTs) {
        timestamp = lastTs + 0.001;
      }
      lastTimestampPerPlayer[playerId] = timestamp;

      let prefix = `/TeamLocation/${playerId}`;
      log.putNumber(`${prefix}/x`, timestamp, x);
      log.putNumber(`${prefix}/y`, timestamp, y);
      log.putNumber(`${prefix}/team_id`, timestamp, teamId);
      playerPrefixes.add(prefix);

      if (i % 500 === 0) {
        sendResponse({ type: "progress", value: i / totalLines });
      }
    }

    // Register each player as a structured field so the whole player (not just
    // the individual x/y coordinates) can be dragged onto a tab and grouped.
    playerPrefixes.forEach((prefix) => {
      log.createBlankField(prefix, LoggableType.Empty);
      log.setStructuredType(prefix, "TeamLocationPlayer");
    });

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
