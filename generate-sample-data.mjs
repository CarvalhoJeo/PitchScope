/**
 * Generates sample soccer data files for PitchScope testing.
 * Run: node generate-sample-data.mjs
 * Output: sample-match.spadl, sample-match.tracking
 *
 * Design goals:
 *  - Short match (5 min) so it loads instantly
 *  - Tracking at 10 fps so position updates feel smooth
 *  - Players move via a random walk so they don't jump around
 *  - Passes every ~2-3 s so the fading pass-arrow overlay is always active
 *  - SPADL start/end coords are taken from the actual tracking grid
 */

import fs from "fs";

const PLAYERS = [
  // Home team (team_id = 1)
  { id: 1,  team: 1, role: "gk",  baseX: 5,  baseY: 50 },
  { id: 2,  team: 1, role: "lb",  baseX: 20, baseY: 20 },
  { id: 3,  team: 1, role: "cb",  baseX: 20, baseY: 38 },
  { id: 4,  team: 1, role: "cb",  baseX: 20, baseY: 62 },
  { id: 5,  team: 1, role: "rb",  baseX: 20, baseY: 80 },
  { id: 6,  team: 1, role: "cm",  baseX: 40, baseY: 35 },
  { id: 7,  team: 1, role: "cm",  baseX: 40, baseY: 65 },
  { id: 8,  team: 1, role: "cam", baseX: 55, baseY: 50 },
  { id: 9,  team: 1, role: "lw",  baseX: 65, baseY: 20 },
  { id: 10, team: 1, role: "rw",  baseX: 65, baseY: 80 },
  { id: 11, team: 1, role: "st",  baseX: 75, baseY: 50 },

  // Away team (team_id = 2)
  { id: 21, team: 2, role: "gk",  baseX: 95, baseY: 50 },
  { id: 22, team: 2, role: "lb",  baseX: 80, baseY: 80 },
  { id: 23, team: 2, role: "cb",  baseX: 80, baseY: 62 },
  { id: 24, team: 2, role: "cb",  baseX: 80, baseY: 38 },
  { id: 25, team: 2, role: "rb",  baseX: 80, baseY: 20 },
  { id: 26, team: 2, role: "cm",  baseX: 60, baseY: 65 },
  { id: 27, team: 2, role: "cm",  baseX: 60, baseY: 35 },
  { id: 28, team: 2, role: "cam", baseX: 45, baseY: 50 },
  { id: 29, team: 2, role: "lw",  baseX: 35, baseY: 80 },
  { id: 30, team: 2, role: "rw",  baseX: 35, baseY: 20 },
  { id: 31, team: 2, role: "st",  baseX: 25, baseY: 50 },
];

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function rnd(lo, hi)       { return lo + Math.random() * (hi - lo); }

// ─── TRACKING DATA ─────────────────────────────────────────────────────────
const MATCH_DURATION    = 300;   // seconds
const TRACKING_INTERVAL = 0.1;  // 10 fps
const TOTAL_FRAMES      = Math.round(MATCH_DURATION / TRACKING_INTERVAL) + 1;

// Max units a player moves per frame (0.3 ≈ 3 u/s = ~4.5 km/h walking pace).
// Sprinting is up to ~10 m/s; on a 100-unit pitch ≈ 10 u/s → 1.0 u/frame.
const STEP_MAX  = 0.6;  // normal random drift
// How strongly players drift back toward their role position (0 = no pull, 1 = snap).
const HOME_PULL = 0.008;

// Initialise player positions at their base coordinates.
const pos = PLAYERS.map(p => ({ x: p.baseX, y: p.baseY }));

// Build grid: trackingGrid[frameIndex][playerIndex] = { x, y }
const trackingGrid = new Array(TOTAL_FRAMES);
let trackingRows = ["timestamp,player_id,team_id,x,y"];

for (let fi = 0; fi < TOTAL_FRAMES; fi++) {
  const t     = fi * TRACKING_INTERVAL;
  const phase = t / MATCH_DURATION;
  trackingGrid[fi] = [];

  for (let pi = 0; pi < PLAYERS.length; pi++) {
    const p = PLAYERS[pi];

    // Role position drifts slightly forward as the match progresses.
    const xBias  = p.team === 1 ? phase * 5 : -phase * 5;
    const targetX = clamp(p.baseX + xBias, 0, 100);
    const targetY = p.baseY;

    // Random walk step.
    pos[pi].x += rnd(-STEP_MAX, STEP_MAX);
    pos[pi].y += rnd(-STEP_MAX, STEP_MAX);

    // Gentle elastic pull back toward role position so players stay in shape.
    pos[pi].x += (targetX - pos[pi].x) * HOME_PULL;
    pos[pi].y += (targetY - pos[pi].y) * HOME_PULL;

    pos[pi].x = clamp(pos[pi].x, 0, 100);
    pos[pi].y = clamp(pos[pi].y, 0, 100);

    trackingGrid[fi].push({ x: pos[pi].x, y: pos[pi].y });
    trackingRows.push(`${t.toFixed(2)},${p.id},${p.team},${pos[pi].x.toFixed(2)},${pos[pi].y.toFixed(2)}`);
  }
}

fs.writeFileSync("sample-match.tracking", trackingRows.join("\n"), "utf8");
console.log(`✓ sample-match.tracking  (${trackingRows.length - 1} rows, 10 fps)`);

// Look up a player's tracked position at a given timestamp.
function playerPosAt(player, time) {
  const fi = Math.min(Math.round(time / TRACKING_INTERVAL), TOTAL_FRAMES - 1);
  const pi = PLAYERS.indexOf(player);
  return trackingGrid[fi][pi];
}

// ─── SPADL ACTIONS ─────────────────────────────────────────────────────────
const ACTION_TYPES = [
  { id: 0,  weight: 60, name: "pass" },
  { id: 1,  weight: 8,  name: "cross" },
  { id: 7,  weight: 5,  name: "take_on" },
  { id: 8,  weight: 3,  name: "foul" },
  { id: 9,  weight: 5,  name: "tackle" },
  { id: 10, weight: 4,  name: "interception" },
  { id: 11, weight: 4,  name: "shot" },
  { id: 18, weight: 6,  name: "dribble" },
];

const TOTAL_WEIGHT = ACTION_TYPES.reduce((s, a) => s + a.weight, 0);

function pickAction() {
  let r = Math.random() * TOTAL_WEIGHT;
  for (let a of ACTION_TYPES) { r -= a.weight; if (r <= 0) return a; }
  return ACTION_TYPES[0];
}

function resultFor(id) {
  const rates = { 0: 0.85, 1: 0.65, 7: 0.55, 8: 0.50, 9: 0.60, 10: 0.65, 11: 0.20, 18: 0.65 };
  return Math.random() < (rates[id] ?? 0.6) ? 1 : 0;
}

function bodypartFor(id) {
  if (id === 1)  return Math.random() < 0.7 ? 0 : 2;
  if (id === 11) return Math.random() < 0.15 ? 1 : 0;
  return 0;
}

let spadlRows = ["game_id,period_id,time_seconds,team_id,player_id,start_x,start_y,end_x,end_y,action_type_id,result_id,bodypart_id"];

let currentTime   = 0;
let possessionTeam   = 1;
let possessionPlayer = PLAYERS.find(p => p.role === "cm" && p.team === 1);

while (currentTime < MATCH_DURATION) {
  const action     = pickAction();
  const resultId   = resultFor(action.id);
  const bodypartId = bodypartFor(action.id);

  const p   = possessionPlayer;
  const pPos = playerPosAt(p, currentTime);
  const sx   = pPos.x;
  const sy   = pPos.y;

  let ex, ey;

  if (action.id === 0 || action.id === 1) {
    // Pass / cross: end = receiver's actual tracked position
    const teamPlayers = PLAYERS.filter(q => q.team === possessionTeam && q.id !== p.id);
    const receiver    = teamPlayers[Math.floor(Math.random() * teamPlayers.length)];
    const rPos        = playerPosAt(receiver, currentTime);
    ex = rPos.x;
    ey = rPos.y;
  } else if (action.id === 11) {
    ex = possessionTeam === 1 ? clamp(rnd(90, 105), 0, 100) : clamp(rnd(-5, 10), 0, 100);
    ey = rnd(35, 65);
  } else {
    ex = clamp(sx + rnd(-5, 5), 0, 100);
    ey = clamp(sy + rnd(-5, 5), 0, 100);
  }

  spadlRows.push(
    `1,1,${currentTime.toFixed(2)},${possessionTeam},${p.id},` +
    `${sx.toFixed(2)},${sy.toFixed(2)},${ex.toFixed(2)},${ey.toFixed(2)},` +
    `${action.id},${resultId},${bodypartId}`
  );

  currentTime += rnd(1.5, 3.0);

  if (resultId === 0 || action.id === 9 || action.id === 10) {
    possessionTeam = possessionTeam === 1 ? 2 : 1;
  }

  const nextTeam = PLAYERS.filter(q => q.team === possessionTeam);
  possessionPlayer = nextTeam[Math.floor(Math.random() * nextTeam.length)];
}

fs.writeFileSync("sample-match.spadl", spadlRows.join("\n"), "utf8");
console.log(`✓ sample-match.spadl     (${spadlRows.length - 1} actions)`);
console.log("\nDone! Load both files in PitchScope (after npm run compile):");
console.log("  File > Open Log            → sample-match.spadl");
console.log("  File > Open Additional Log → sample-match.tracking");
