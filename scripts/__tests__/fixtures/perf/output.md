# Performance Comparison Report

- **Current**: HEAD (c7a57089c57c6b929c2b69dc85148db702bd0be6) - 2026-10-17 23:42:35Z
- **Baseline**: HEAD (c7a57089c57c6b929c2b69dc85148db702bd0be6) - 2026-10-17 23:42:05Z

### Significant Changes To Duration

<details open>
<summary>Show entries</summary>

| Name                                                                      | Type   | Duration                                 | Count    |
| ------------------------------------------------------------------------- | ------ | ---------------------------------------- | -------- |
| Sheet render performance opens and closes from the owner state            | render | 5.8 ms → 4.7 ms (-1.1 ms, -19.2%)  🟢    | 3 → 3    |
| ChatView render performance streams tokens into the newest assistant turn | render | 97.5 ms → 84.7 ms (-12.8 ms, -13.1%)  🟢 | 23 → 23  |

</details>

<details>
<summary>Show details</summary>

| Name                                                                      | Type   | Duration                                                                                                                                                                                                                                                                                                                 | Count                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sheet render performance opens and closes from the owner state            | render | **Baseline**<br/>Mean: 5.8 ms<br/>Stdev: 0.5 ms (8.6%)<br/>Runs: 6.0 5.2 6.2<br/>Warmup runs: 5.8<br/>Removed outliers: (none)<br/>Stability: 8.6%<br/><br/>**Current**<br/>Mean: 4.7 ms<br/>Stdev: 0.0 ms (0.2%)<br/>Runs: 4.7 4.7<br/>Warmup runs: 6.4<br/>Removed outliers: 5.1<br/>Stability: 4.4%                   | **Baseline**<br/>Mean: 3<br/>Stdev: 0 (0.0%)<br/>Runs: 3 3 3<br/>Render issues:<br/>- Redundant updates: 2 (1, 2)<br/><br/>**Current**<br/>Mean: 3<br/>Stdev: 0 (0.0%)<br/>Runs: 3 3 3<br/>Render issues:<br/>- Redundant updates: 2 (1, 2) |
| ChatView render performance streams tokens into the newest assistant turn | render | **Baseline**<br/>Mean: 97.5 ms<br/>Stdev: 1.9 ms (1.9%)<br/>Runs: 98.4 98.7 95.3<br/>Warmup runs: 104.2<br/>Removed outliers: (none)<br/>Stability: 1.9%<br/><br/>**Current**<br/>Mean: 84.7 ms<br/>Stdev: 3.7 ms (4.4%)<br/>Runs: 83.3 88.9 81.9<br/>Warmup runs: 86.1<br/>Removed outliers: (none)<br/>Stability: 4.4% | **Baseline**<br/>Mean: 23<br/>Stdev: 0 (0.0%)<br/>Runs: 23 23 23<br/>Render issues:<br/>- Initial updates: 1<br/><br/>**Current**<br/>Mean: 23<br/>Stdev: 0 (0.0%)<br/>Runs: 23 23 23<br/>Render issues:<br/>- Initial updates: 1           |

</details>

### Meaningless Changes To Duration

<details>
<summary>Show entries</summary>

| Name                                                                                       | Type   | Duration                               | Count    |
| ------------------------------------------------------------------------------------------ | ------ | -------------------------------------- | -------- |
| ChatPalModelPickerSheet render performance opens and closes the picker from the chat input | render | 110.0 ms → 114.4 ms (+4.5 ms, +4.1%)   | 7 → 7    |
| ChatView render performance types into the chat input                                      | render | 204.3 ms → 202.3 ms (-2.1 ms, -1.0%)   | 23 → 23  |
| ModelsScreen render performance filters the list to downloaded models                      | render | 110.0 ms → 97.8 ms (-12.2 ms, -11.1%)  | 6 → 6    |
| SettingsScreen render performance expands the advanced settings                            | render | 125.3 ms → 133.7 ms (+8.4 ms, +6.7%)   | 4 → 4    |

</details>

<details>
<summary>Show details</summary>

| Name                                                                                       | Type   | Duration                                                                                                                                                                                                                                                                                                                             | Count                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatPalModelPickerSheet render performance opens and closes the picker from the chat input | render | **Baseline**<br/>Mean: 110.0 ms<br/>Stdev: 8.3 ms (7.5%)<br/>Runs: 100.5 113.4 115.9<br/>Warmup runs: 100.6<br/>Removed outliers: (none)<br/>Stability: 7.5%<br/><br/>**Current**<br/>Mean: 114.4 ms<br/>Stdev: 3.4 ms (3.0%)<br/>Runs: 115.4 117.3 110.6<br/>Warmup runs: 95.9<br/>Removed outliers: (none)<br/>Stability: 3.0%     | **Baseline**<br/>Mean: 7<br/>Stdev: 0 (0.0%)<br/>Runs: 7 7 7<br/>Render issues:<br/>- Initial updates: 1<br/>- Redundant updates: 2 (4, 6)<br/><br/>**Current**<br/>Mean: 7<br/>Stdev: 0 (0.0%)<br/>Runs: 7 7 7<br/>Render issues:<br/>- Initial updates: 1<br/>- Redundant updates: 2 (4, 6)                                                                         |
| ChatView render performance types into the chat input                                      | render | **Baseline**<br/>Mean: 204.3 ms<br/>Stdev: 18.5 ms (9.0%)<br/>Runs: 219.8 209.3 183.9<br/>Warmup runs: 219.7<br/>Removed outliers: (none)<br/>Stability: 9.0%<br/><br/>**Current**<br/>Mean: 202.3 ms<br/>Stdev: 12.0 ms (5.9%)<br/>Runs: 189.0 205.4 212.4<br/>Warmup runs: 201.1<br/>Removed outliers: (none)<br/>Stability: 5.9%  | **Baseline**<br/>Mean: 23<br/>Stdev: 0 (0.0%)<br/>Runs: 23 23 23<br/>Render issues:<br/>- Initial updates: 1<br/>- Redundant updates: 10 (4, 6, 8, 10, 12, 14, 16, 18, 20, 22)<br/><br/>**Current**<br/>Mean: 23<br/>Stdev: 0 (0.0%)<br/>Runs: 23 23 23<br/>Render issues:<br/>- Initial updates: 1<br/>- Redundant updates: 10 (4, 6, 8, 10, 12, 14, 16, 18, 20, 22) |
| ModelsScreen render performance filters the list to downloaded models                      | render | **Baseline**<br/>Mean: 110.0 ms<br/>Stdev: 19.7 ms (17.9%)<br/>Runs: 114.5 127.1 88.4<br/>Warmup runs: 122.9<br/>Removed outliers: (none)<br/>Stability: 17.9%<br/><br/>**Current**<br/>Mean: 97.8 ms<br/>Stdev: 7.1 ms (7.3%)<br/>Runs: 103.8 89.9 99.8<br/>Warmup runs: 137.8<br/>Removed outliers: (none)<br/>Stability: 7.3%     | **Baseline**<br/>Mean: 6<br/>Stdev: 0 (0.0%)<br/>Runs: 6 6 6<br/>Render issues:<br/>- Redundant updates: 2 (4, 5)<br/><br/>**Current**<br/>Mean: 6<br/>Stdev: 0 (0.0%)<br/>Runs: 6 6 6<br/>Render issues:<br/>- Redundant updates: 2 (4, 5)                                                                                                                           |
| SettingsScreen render performance expands the advanced settings                            | render | **Baseline**<br/>Mean: 125.3 ms<br/>Stdev: 19.2 ms (15.3%)<br/>Runs: 135.0 137.7 103.2<br/>Warmup runs: 150.1<br/>Removed outliers: (none)<br/>Stability: 15.3%<br/><br/>**Current**<br/>Mean: 133.7 ms<br/>Stdev: 1.0 ms (0.7%)<br/>Runs: 132.6 134.5 134.0<br/>Warmup runs: 135.3<br/>Removed outliers: (none)<br/>Stability: 0.7% | **Baseline**<br/>Mean: 4<br/>Stdev: 0 (0.0%)<br/>Runs: 4 4 4<br/>Render issues:<br/><br/>**Current**<br/>Mean: 4<br/>Stdev: 0 (0.0%)<br/>Runs: 4 4 4<br/>Render issues:                                                                                                                                                                                               |

</details>

### Render Count Changes

*There are no entries*

### Render Issues

| Name                                                                                       | Initial Updates | Redundant Updates                           |
| ------------------------------------------------------------------------------------------ | --------------- | ------------------------------------------- |
| ChatView render performance types into the chat input                                      | 1 🔴            | 10 (4, 6, 8, 10, 12, 14, 16, 18, 20, 22) 🔴 |
| ChatView render performance streams tokens into the newest assistant turn                  | 1 🔴            | -                                           |
| ChatPalModelPickerSheet render performance opens and closes the picker from the chat input | 1 🔴            | 2 (4, 6) 🔴                                 |
| ModelsScreen render performance filters the list to downloaded models                      | -               | 2 (4, 5) 🔴                                 |
| Sheet render performance opens and closes from the owner state                             | -               | 2 (1, 2) 🔴                                 |

### Added Entries

*There are no entries*

### Removed Entries

*There are no entries*

### Stability

| Name             | Baseline | Current |
| ---------------- | -------- | ------- |
| Weighted Average | 10.4%    | 4.3%    |