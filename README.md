# PitchScope

PitchScope is fork from [AdvantageScope](https://docs.advantagescope.org) robot diagnostics, log review/analysis, and data visualization application for FIRST teams developed by Team 6328. 

PitchScope is meant to be used for similar purposes but with soccer data.

PitchScope includes the following tools:

- A wide selection of flexible graphs and charts
- 2D soccer field visualization.
- Synchronized video playback from a separately loaded match video
- Swerve drive module vector displays
- Log statistics analysis
- Flexible export options, with support for SPADL and players tracking

---

## Data File Formats

PitchScope loads two custom file types. Both are plain CSV files with a header row; lines beginning with `#` are treated as comments and skipped.

### `.spadl` — Action events

Each row is one SPADL action. The header must include every column below (case-insensitive, any column order):

| Column | Type | Description |
|---|---|---|
| `game_id` | integer | Match identifier |
| `period_id` | integer | Period number (1 = first half, 2 = second half, …) |
| `time_seconds` | float | Event time in seconds from kick-off |
| `team_id` | integer | Team (1 = home, 2 = away) |
| `player_id` | integer | Player identifier |
| `start_x` | float | Action start x-coordinate (0 – 100) |
| `start_y` | float | Action start y-coordinate (0 – 100) |
| `end_x` | float | Action end x-coordinate (0 – 100) |
| `end_y` | float | Action end y-coordinate (0 – 100) |
| `action_type_id` | integer | See action type table below |
| `result_id` | integer | See result table below |
| `bodypart_id` | integer | See body-part table below |

**Coordinate system:** origin (0, 0) is the bottom-left corner of the pitch; (100, 100) is the top-right corner. The pitch is rendered with a 105 × 68 m aspect ratio.

**Timestamps:** `time_seconds` must be strictly increasing. If two rows share the same value the second is automatically offset by 0.001 s.

**Action type IDs**

| ID | Name |
|---|---|
| 0 | pass |
| 1 | cross |
| 2 | throw_in |
| 3 | freekick_cross |
| 4 | freekick_shot |
| 5 | corner_cross |
| 6 | corner_short |
| 7 | take_on |
| 8 | foul |
| 9 | tackle |
| 10 | interception |
| 11 | shot |
| 12 | penalty_shot |
| 13 | free_kick_shot |
| 14 | keeper_pick_up |
| 15 | clearance |
| 16 | bad_touch |
| 17 | non_action |
| 18 | dribble |
| 19 | goalkick |

> Pass-family actions (used by the Pass Network widget): IDs 0, 1, 2, 3, 5, 6.

**Result IDs**

| ID | Name |
|---|---|
| 0 | fail |
| 1 | success |
| 2 | offside |
| 3 | owngoal |
| 4 | yellow_card |
| 5 | red_card |
| 6 | yellow_red_card |

**Body-part IDs**

| ID | Name |
|---|---|
| 0 | foot |
| 1 | head |
| 2 | other |
| 3 | no_touch |

**Example rows**

```csv
game_id,period_id,time_seconds,team_id,player_id,start_x,start_y,end_x,end_y,action_type_id,result_id,bodypart_id
1,1,5.00,1,1,5.0,50.0,22.0,38.0,0,1,0
1,1,9.00,1,3,22.0,38.0,50.0,38.0,0,1,0
1,1,37.00,1,10,68.0,42.0,68.0,42.0,9,1,0
1,2,2820.00,2,24,78.0,62.0,52.0,38.0,0,1,0
```

---

### `.tracking` — Player positions

Each row is one position sample for one player. The header must include every column below (case-insensitive, any column order):

| Column | Type | Description |
|---|---|---|
| `timestamp` | float | Sample time in seconds |
| `player_id` | integer | Player identifier (must match IDs used in `.spadl`) |
| `team_id` | integer | Team (1 = home, 2 = away) |
| `x` | float | Player x-coordinate (0 – 100) |
| `y` | float | Player y-coordinate (0 – 100) |

**Timestamps:** Multiple players can share the same timestamp (one row per player per frame). Duplicate timestamps for the same player are offset by 0.001 s automatically.

**Player IDs:** Must be consistent with the `player_id` values in the `.spadl` file. The Pass Network and Heat Map widgets derive average positions from tracking data and match them to SPADL actions by player ID.

**Example rows**

```csv
timestamp,player_id,team_id,x,y
0.0,1,1,6.6,51.1
0.0,3,1,24.2,35.5
0.0,24,2,78.0,38.0
1.0,1,1,6.7,51.0
1.0,3,1,24.3,35.6
```

---

### Sample files

The repository includes `sample-match.spadl` and `sample-match.tracking` with a synthetic 90-minute match (two teams, 11 players each) that can be loaded directly to test all widgets.
