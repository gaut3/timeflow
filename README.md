<picture>
  <source media="(prefers-color-scheme: dark)" srcset="brand/png/wordmark/timeflow-wordmark-dark-2x.png">
  <img alt="Timeflow" src="brand/png/wordmark/timeflow-wordmark-light-2x.png" width="220">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/gaut3/timeflow/blob/main/images/Wide%20-%20Dark%20mode%20-%20Home.png?raw=true">
  <img alt="Timeflow dashboard — wide layout" src="https://github.com/gaut3/timeflow/blob/main/images/Wide%20-%20Light%20mode%20-%20Home.png?raw=true">
</picture>

timeflow is a flextime tracking dashboard built around one question — **where's my flextime balance?** It pairs a live, color-coded balance with a **built-in timer**, a calm calendar and statistics, and extensive customization. Structural colors come from Obsidian's own theme variables, so it looks at home in any light or dark theme.

> **Note:** timeflow was originally designed for Norwegian work culture (7.5h workdays, 37.5h weeks, specific leave types like "avspasering" and "egenmelding"). However, all settings are fully customizable - workday hours, work week structure, leave types, colors, and labels can all be adjusted to match your country's work culture and personal needs.


_The same dashboard adapts to a narrow sidebar — nothing is dropped on mobile:_

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/gaut3/timeflow/blob/main/images/Sidebar%20-%20Dark%20mode%20-%20Home.png?raw=true">
  <img alt="Timeflow in the sidebar — narrow layout" src="https://github.com/gaut3/timeflow/blob/main/images/Sidebar%20-%20Light%20mode%20-%20Home.png?raw=true" width="340">
</picture>

## Features

### 🌐 Multi-Language Support
- **Norwegian (Norsk)** - Default language
- **English** - Full English translation
- Switch languages instantly in Settings
- Dates format automatically (DD.MM.YYYY for Norwegian, YYYY-MM-DD for English)
- Absence type names and note types translate automatically

### ⏱️ Built-in Timer System

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/gaut3/timeflow/blob/main/images/Sidebar%20-%20Dark%20mode%20-%20Edit%20time.png?raw=true">
  <img alt="Editing a day's time entries in the calendar's inline drawer" src="https://github.com/gaut3/timeflow/blob/main/images/Sidebar%20-%20Light%20mode%20-%20Edit%20time.png?raw=true" width="340">
</picture>

- **Start/Stop Timers** - Start and stop work timers directly from the dashboard
- **Live Timer Display** - See running timers with real-time duration updates in the balance hero and running-timer banner
- **Automatic Logging** - Completed timers are automatically saved to your data file
- **Quick Access** - Start/stop timers via command palette or dashboard buttons
- **Comment System** (v1.3.6) - Add comments to timer entries when stopping
  - Optional comment modal appears when stopping timers
  - Overtime comment requirement when exceeding daily goal + threshold
  - Comments displayed in history table and calendar context menu
  - Comments included in CSV exports

### 📊 Tracking & Visualization

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/gaut3/timeflow/blob/main/images/Sidebar%20-%20Dark%20mode%20-%20Stats%20and%20history.png?raw=true">
  <img alt="Leave tracking and recent history in the sidebar" src="https://github.com/gaut3/timeflow/blob/main/images/Sidebar%20-%20Light%20mode%20-%20Stats%20and%20history.png?raw=true" width="340">
</picture>

- **Flextime balance hero** - Your balance is the centerpiece: a large, color-coded number with a live clock, today's contribution, and Start/Stop timer controls
- **Weekly progress strip** - At-a-glance bars showing this week's hours against your goal, colored by compliance status
- **Interactive bar calendar** - A month grid where each day carries a thin, type-colored bar; today is outlined, and week numbers + per-week compliance dots are optional
  - Click any day to open an inline drawer: view the day, add or edit work time, register absences, or create notes
- **Statistics** - Switch between month, year, and total; see hours logged, daily and weekly averages, workload %, work days, and comp-time used
- **Trends** - "vs last week / vs last month" deltas with direction arrows (a quiet down-arrow for lower hours — leave isn't an error)
- **Weekly chart** - Recent weeks at a glance
- **Upcoming days** - Planned absences ahead, with consecutive same-type days collapsed into clean date ranges (e.g. `6.–16. July · 8 days · Vacation`)
- **Leave tracking** - Per-type usage against your yearly quota (days for leave types, hours for comp time)
- **Week numbers** - ISO 8601 week numbers in the calendar (toggle in settings)
- **History** - List and heatmap views with day-type filtering and bulk editing in wide mode

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/gaut3/timeflow/blob/main/images/Wide%20-%20Dark%20mode%20-%20History%20list.png?raw=true">
  <img alt="History — list view with day-type filters, grouped by month" src="https://github.com/gaut3/timeflow/blob/main/images/Wide%20-%20Light%20mode%20-%20History%20list.png?raw=true">
</picture>

![Heatmap view of work history](https://github.com/gaut3/timeflow/blob/main/images/Wide%20-%20Light%20mode%20-%20Heatmap.png?raw=true)

### 🎯 Planning & Organization

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://github.com/gaut3/timeflow/blob/main/images/Sidebar%20-%20Dark%20mode%20-%20Add%20absence.png?raw=true">
  <img alt="Registering an absence from the calendar's inline day drawer" src="https://github.com/gaut3/timeflow/blob/main/images/Sidebar%20-%20Light%20mode%20-%20Add%20absence.png?raw=true" width="340">
</picture>

- **Holiday Planning** - Integrate planned holidays and absences from a markdown file
- **Customizable Note Types** - Create and manage custom note templates with flexible configuration
  - Daily notes, meeting notes, project notes, weekly reviews, reflections
  - Custom folders, templates, tags, and filename patterns
  - Add/edit/delete note types through settings
- **Smart Sick Day Registration** (v1.2.0)
  - Clock-based time inputs (From/To) for precise sick time tracking
  - Auto-fill calculates remaining time based on existing work entries and daily goal
  - "Full day" checkbox for quick full-day sick leave registration
  - Only full sick days count towards annual limits
- **Calendar Context Menu** - Click any date to:
  - Add work time entries
  - Edit existing entries (with running timer support)
  - Register absences (vacation, sick leave, courses, etc.)
  - Create custom note types
  - View day summary with running timers
- **Data Validation** - Automatically detect issues like negative durations, long-running timers, and overlapping entries
- **Delete Confirmation** - Safety dialog before deleting entries to prevent accidental data loss
- **CSV Export** - Export your time data to CSV for further analysis
  - Month selector modal for targeted exports
  - "All months" option for complete data export
  - Comments included in exports (v1.3.6)
- **Multi-Format Import** - Import time data from multiple formats:
  - Timekeep JSON format
  - CSV files (Norwegian DD.MM.YYYY or ISO YYYY-MM-DD dates)
  - Generic JSON arrays
  - Auto-detection of format and delimiter
  - Preview before importing with validation feedback

### ⚙️ Advanced Customization

![timeflow-settings](https://github.com/gaut3/timeflow/blob/main/images/timeflow-settings.png?raw=true)

#### Work Configuration
- **Flexible Work Schedules**
  - Configurable workday hours (e.g., 7.5, 8, 6-hour days)
  - Configurable workweek hours (e.g., 37.5, 40, 30-hour weeks) - *optional, can be hidden if weekly goals disabled*
  - Work percentage (full-time, part-time employment) - *optional, can be hidden if weekly goals disabled*
  - **Lunch break deduction** - Automatically subtract lunch breaks from work hours
  - **Flexible work days** - Select any combination of days as your work week (Mon-Sun)
  - **Alternating weeks support** - Configure different work days for alternating weeks (e.g., every other weekend)
  - **Weekly/monthly goals toggle** - Disable weekly goals for flexible schedules without fixed hours

#### Leave Management
- **Configurable Leave Quotas** - Each absence type can carry a yearly quota (`maxDaysPerYear`)
  - Counted per **calendar year** or on a **rolling 365-day** basis (per type)
  - Defaults: vacation (ferie) 25 days; self-reported sick leave (egenmelding) tracked on a rolling 365-day window
  - The leave-tracking panel shows usage against each quota; quota-less types just show the value (no bar)

#### Absence Types
- **Fully Customizable** - Change names, colors, icons, and text colors for all day types:
  - Jobb (Work) - configurable as a work type
  - Avspasering (Comp time)
  - Ferie (Vacation)
  - Helligdag (Public holiday)
  - Velferdspermisjon (Welfare leave)
  - Egenmelding (Self-reported sick leave) - rolling 365-day limit tracking
  - Sykemelding (Doctor's note sick leave)
  - Kurs (Course/Training)
  - Studie (Study leave)
- **Automatic History Conversion** - Planned absences are automatically converted to timer entries when they pass, ensuring they appear in Historikk and statistics

#### Advanced Configuration
- **Balance Calculation Settings**
  - Configurable balance start date - Choose when to start counting flextime balance
  - **Starting flextime balance** (v1.3.6) - Set an initial balance for users migrating from other time tracking systems
  - Half-day hours - Fixed value or percentage-based (e.g., 50% of workday)
  - Balance color thresholds - Customize when balance shows green/yellow/red
  - Data validation thresholds - Adjust warning levels for long sessions, weekly totals, etc.
- **Work Schedule History** (v1.2.0)
  - Track changes to your work schedule over time
  - Historical flextime calculations use the correct schedule for each period
  - Automatically created when you first change work settings
- **Simple Tracking Mode** - Disable goal tracking for flexible schedules without fixed targets
- **Compliance Warnings** - Optional warnings for Norwegian labor law compliance (daily/weekly hour limits, rest periods)
- **Overtime Comment Requirement** (v1.3.6) - Require comments when work exceeds daily goal + configurable threshold
- **Custom Colors** - Optionally override the balance and progress-bar colors

#### Theme & Layout
- **System Theme** - Automatically follows Obsidian's light/dark theme; structural colors use Obsidian's own variables, so any theme works with zero setup
- **Optional Background Override** - Set a custom dashboard background per light/dark theme (off by default — the only sanctioned theme override; everything else defers to your theme)
- **Hour Unit Preference** - Display hours as "h" or "t" (timer)
- **Flexible View Location** - Open in sidebar or main window
  - Default location configurable in settings
  - Quick toggle button in the dashboard
- **Responsive Design** - One layout that adapts at 600px
  - Wide mode: two-column layout with a stats grid, weekly chart, and bulk history editing
  - Sidebar / narrow keeps the **full** feature stack (balance, calendar, leave tracking, history) — nothing is dropped on mobile
  - "See all / Show less" expands long sections in place

### 📱 Cross-Device Sync
- **Automatic Settings Sync** - Settings are saved in `timeflow/data.md` alongside your timer data, so if you have Obsidian set up with syncing, timeflow will automatically use the settings specified in `timeflow/data.md`
- **Zero Configuration** - No manual setup required, just enable the plugin on another device

## Requirements

- **Obsidian** v1.7.2 or higher

## Installation

### Manual Installation
1. Download the latest release from the [Releases page](https://github.com/gaut3/timeflow/releases)
2. Extract `main.js`, `manifest.json`, and `styles.css` to your vault's plugin folder:
   `<your-vault>/.obsidian/plugins/timeflow/`
3. Reload Obsidian (Ctrl/Cmd + R)
4. Go to Settings → Community plugins → Enable "timeflow"

### Using BRAT (Beta Reviewers Auto-update Tester)
For automatic updates during beta testing:
1. Install the [BRAT plugin](https://github.com/TfTHacker/obsidian42-brat) from Community plugins
2. Open BRAT settings and click "Add Beta plugin"
3. Enter: `https://github.com/gaut3/timeflow`
4. BRAT will install and keep the plugin updated automatically

#### Timer Data Storage

- All timer data is stored in `timeflow/data.md` in your vault
- Uses **Timekeep-compatible format** (backwards compatible!)
- Data is stored in a `timekeep` codeblock as JSON
- Format: `{"entries":[...],"settings":{...}}`
- Settings are automatically synced for cross-device use
- You can import existing Timekeep data with duplicate detection

```markdown
# timeflow data

This file contains your time tracking data in Timekeep-compatible format.

\`\`\`timekeep
{
  "entries": [
    {
      "name": "Jobb",
      "startTime": "2025-11-25T07:44:34",
      "endTime": "2025-11-25T15:52:31",
      "subEntries": null,
      "comment": "Optional comment for this entry"
    }
  ]
}
\`\`\`

\`\`\`timeflow-settings
{
  "workPercent": 1.0,
  "baseWorkday": 7.5,
  "baseWorkweek": 37.5,
  ...
}
\`\`\`
```

This means:
- ✅ You can import existing Timekeep data
- ✅ Data can be read by Timekeep plugin if you switch back
- ✅ Support for collapsed entries and subEntries

### File Structure

timeflow uses a simple folder structure to organize its files:

```
Your Vault/
└── timeflow/                     # timeflow plugin folder
    ├── data.md                   # Timer data + settings (Timekeep-compatible)
    ├── holidays.md               # Holiday and absence definitions
    └── templates/                # Note templates (customizable)
        ├── daily-notes.md
        ├── meeting-note.md
        ├── project-note.md
        ├── weekly-review.md
        └── reflection-note.md
```

**Note**: These paths are configurable in settings. You can adjust them to match your vault structure.

## Holiday File Format

Create a file (default: `timeflow/holidays.md`) with the following format:

```markdown
- 2025-12-25: helligdag: Jul
- 2025-07-01: ferie: Sommerferie
- 2025-06-23: ferie:half: Halv dag før sankthans
- 2025-06-15: avspasering:14:00-16:00: Leaving early
```

Format: `- YYYY-MM-DD: type[:modifier]: description`

Modifiers:
- `:half` - Half day (4 hours instead of full workday)
- `:HH:MM-HH:MM` - Time range for avspasering (e.g., `14:00-16:00` for leaving early)

Supported types:
- `helligdag` - Public holiday (counts as full workday, no flextime change)
- `ferie` - Vacation (counts as full workday, no flextime change)
- `avspasering` - Comp time (withdraws from flextime based on duration)
- `egenmelding` - Self-reported sick leave (reduces daily goal by sick hours)
- `sykemelding` - Doctor's note sick leave (reduces daily goal by sick hours)
- `velferdspermisjon` - Welfare leave (reduces daily goal by sick hours)
- `kurs` - Course/Training (regular workday applies)
- `studie` - Study leave (regular workday applies)

## Importing Data

timeflow supports importing time data from **Timekeep JSON**, **CSV** (Norwegian DD.MM.YYYY or ISO dates), and **JSON arrays**.

Go to **Settings → timeflow → Data Management → Import Data** to upload a file or paste data. The importer auto-detects the format and provides a preview with validation before importing. Duplicate entries are automatically detected and skipped.

## Flextime Calculation

- **Workdays**: Hours beyond the daily goal contribute to flextime
- **Lunch Breaks**: Automatically deducted from work hours (if configured)
- **Weekends**: Behavior depends on settings:
  - Default: All work hours count as flextime bonus
  - With weekend work enabled: Count toward weekly goals
- **Absences**: Days marked as holidays, sick leave, etc. count as full workday (no flextime change)
- **Half Days**: Goal is 4 hours instead of full workday
- **Avspasering (Comp Time)**: Withdraws from flextime balance
- **Courses/Training**: Regular workday goal applies

### Sick Day Handling (v1.2.0)

Sick leave types (egenmelding, sykemelding, velferdspermisjon) use intelligent goal reduction:

- **Goal Reduction**: Instead of counting against flextime, sick time reduces your daily goal
- **Partial Sick Days**: If you work 5 hours and take 2.5 hours sick leave, your goal becomes 5 hours
- **Full Sick Days**: A full day of sick leave means 0 hours goal for that day
- **Smart Counting**: Partial sick days (from data.md) do NOT count towards your annual sick leave limit - only full days registered in holidays.md count
- **Auto-Fill**: When registering partial sick time, the end time auto-fills based on your work entries and remaining daily goal

This ensures your flextime balance isn't unfairly affected when you're sick, while still accurately tracking your sick leave usage.

## Color Coding

Color does one job at a time: your **theme accent** drives chrome (the Start button, today's outline), while a separate **status palette** (green / amber / red) signals work-hour compliance. A calm, normal state never looks like an alarm.

### Flextime balance
The balance number is color-coded against configurable thresholds (Settings → Advanced Configuration → Balance Color Thresholds). Defaults:

- 🟢 **Green** (on track): 0–80 hours
- 🟡 **Amber** (approaching a limit): −15 to 0, or 80–95 hours
- 🔴 **Red** (outside the recommended range): below −15 or above 95 hours

### Calendar days
- Each day shows a thin bar tinted with the day type's color (work, vacation, sick leave, comp time, …) — fully customizable per type
- **Today** is marked with an outline, not a fill
- Future days are dimmed; planned absences stay visible
- Weekends and past empty weekdays are muted

### Progress & leave bars
- Status is carried by the **fill color**, not the bar height (calm by design)
- Bars meet an accessibility floor: ≥8px for progress/leave bars, ≥4px for calendar bars

## Troubleshooting

### Dashboard not loading
- Check that the plugin is enabled in Obsidian settings
- Verify `timeflow/data.md` exists and is readable
- Check console for errors (Ctrl+Shift+I)

### Settings not syncing
- Ensure `timeflow/data.md` contains the `settings` field
- Verify Obsidian Sync or your sync solution is working
- Check that the data file is not excluded from sync

### Timer not showing in calendar
- Make sure you've stopped the timer (running timers show in the banner)
- Check that the timer has both startTime and endTime
- Verify the date matches the calendar view

### Data validation warnings
- Check for entries with negative durations
- Look for long-running timers that haven't been stopped
- Verify entries don't have overlapping time ranges

### Holiday file not found
- Check the file path in settings (Settings → timeflow → File Paths)
- Ensure the file exists in your vault
- File path should be relative to vault root

## Credits

Originally a dataview script that used TimeKeep data for tracking time.
Converted to Obsidian plugin with full TypeScript implementation with AI

## License

MIT License

## Support

For issues and feature requests, please create an issue on GitHub.

---

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/png/lockup/timeflow-lockup-dark-2x.png">
    <img alt="Timeflow" src="brand/png/lockup/timeflow-lockup-light-2x.png" width="300">
  </picture>
</p>
