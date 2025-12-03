![timeflow Dashboard](https://github.com/gaut3/timeflow/blob/main/images/timeflow.png?raw=true)

![timeflow Wide Dashboard](https://github.com/gaut3/timeflow/blob/main/images/timeflow%20wide%20dashboard%20-%20english.png?raw=true)

timeflow provides a comprehensive flextime tracking dashboard with **built-in timer functionality**, beautiful visualizations, and extensive customization options.

> **Note:** timeflow was originally designed for Norwegian work culture (7.5h workdays, 37.5h weeks, specific leave types like "avspasering" and "egenmelding"). However, all settings are fully customizable - workday hours, work week structure, leave types, colors, and labels can all be adjusted to match your country's work culture and personal needs.

## Features

### 🌐 Multi-Language Support
- **Norwegian (Norsk)** - Default language
- **English** - Full English translation
- Switch languages instantly in Settings
- Dates format automatically (DD.MM.YYYY for Norwegian, YYYY-MM-DD for English)
- Special day names and note types translate automatically

### ⏱️ Built-in Timer System
![timeflow-day-week-month](https://github.com/gaut3/timeflow/blob/main/images/timeflow%20day-week-month.png?raw=true)
- **Start/Stop Timers** - Start and stop work timers directly from the dashboard
- **Live Timer Display** - See running timers with real-time duration updates in the day/week cards.
- **Automatic Logging** - Completed timers are automatically saved to your data file
- **Quick Access** - Start/stop timers via command palette or dashboard buttons

### 📊 Tracking & Visualization
![timeflow-stats](https://github.com/gaut3/timeflow/blob/main/images/timeflow%20stats.png?raw=true)
- **Real-time Flextime Balance Tracking** - See your current flextime balance with color-coded indicators
- **Daily, Weekly, Monthly and Yearly Views** - Track your work hours with intuitive cards and responsive layout
- **Week Numbers** - ISO 8601 week numbers displayed in calendar and week card (toggle in settings)
- **Interactive Month Calendar** - Visual calendar with color-coded days for planned holidays and flextime
  - Click any date for quick actions
  - Edit work time, register special days, create notes
  - View running timers and day summaries in info panel
  - Week number column for easy reference
- **Comprehensive Statistics** - View statistics for total, yearly, and monthly periods
- **Multiple History Views** - List and heatmap visualizations of your work history
  - Filtering by day type in list view
  - Bulk editing in wide mode
![timeflow-history-info](https://github.com/gaut3/timeflow/blob/main/images/timeflow%20info%20history%20wide%20-%20english.png?raw=true)

### 🎯 Planning & Organization
![timeflow-context](https://github.com/gaut3/timeflow/blob/main/images/timeflow%20context%20-%20english.png?raw=true)
- **Holiday Planning** - Integrate planned holidays and special days from a markdown file
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
  - Register special days (vacation, sick leave, courses, etc.)
  - Create custom note types
  - View day summary with running timers
- **Data Validation** - Automatically detect issues like negative durations, long-running timers, and overlapping entries
- **Delete Confirmation** - Safety dialog before deleting entries to prevent accidental data loss
- **CSV Export** - Export your time data to CSV for further analysis
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
- **Configurable Leave Limits**
  - Maximum sick leave days (egenmelding) - default: 8 days
  - Maximum vacation days (ferie) - default: 25 days
  - Dashboard displays usage against configured limits

#### Special Day Types
- **Fully Customizable** - Change names, colors, icons, and text colors for all day types:
  - Jobb (Work) - configurable as a work type
  - Avspasering (Comp time)
  - Ferie (Vacation)
  - Velferdspermisjon (Welfare leave)
  - Egenmelding (Self-reported sick leave)
  - Sykemelding (Doctor's note sick leave)
  - Kurs (Course/Training)
  - Studie (Study leave)
- **Automatic History Conversion** - Planned special days are automatically converted to timer entries when they pass, ensuring they appear in Historikk and statistics

#### Advanced Configuration
- **Balance Calculation Settings**
  - Configurable balance start date - Choose when to start counting flextime balance
  - Half-day hours - Fixed value or percentage-based (e.g., 50% of workday)
  - Balance color thresholds - Customize when balance shows green/yellow/red
  - Data validation thresholds - Adjust warning levels for long sessions, weekly totals, etc.
- **Work Schedule History** (v1.2.0)
  - Track changes to your work schedule over time
  - Historical flextime calculations use the correct schedule for each period
  - Automatically created when you first change work settings

#### Theme & Layout
- **System Theme** - Automatically follows Obsidian's light/dark theme
- **Hour Unit Preference** - Display hours as "h" or "t" (timer)
- **Flexible View Location** - Open in sidebar or main window
  - Default location configurable in settings
  - Quick toggle button below System Status
- **Responsive Design**
  - Scales smoothly with sidebar width
  - Wide mode enables bulk editing in Historikk
  - Two-column Informasjon layout in wide mode
  - Optimized for mobile devices
  - Collapsible sections prevent content cut-off

### 📱 Cross-Device Sync
- **Automatic Settings Sync** - Settings are saved in `timeflow/data.md` alongside your timer data, so if you have Obsidian set up with syncing, timeflow will automatically use the settings specified in `timeflow/data.md`
- **Zero Configuration** - No manual setup required, just enable the plugin on another device

## Requirements

- **Obsidian** v0.15.0 or higher

## Installation

### From Source

1. Clone or download this repository into your vault's `.obsidian/plugins/` folder
2. Install dependencies:
   ```bash
   npm install
   ```
3. Build the plugin:
   ```bash
   npm run build
   ```
4. Reload Obsidian
5. Enable the timeflow plugin in Obsidian settings

### Manual Installation

1. Download the latest release from GitHub
2. Extract the files to `<vault>/.obsidian/plugins/timeflow/`
3. Reload Obsidian
4. Enable the timeflow plugin in Obsidian settings

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
      "startTime": "2025-11-25T06:44:34.414Z",
      "endTime": "2025-11-25T15:52:31.638Z",
      "subEntries": null
    }
  ],
  "settings": {
    "workPercent": 1.0,
    "baseWorkday": 7.5,
    "baseWorkweek": 37.5,
    ...
  }
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
    ├── holidays.md               # Holiday and special days definitions
    └── templates/                # Note templates (customizable)
        ├── daily-notes.md
        ├── meeting-note.md
        ├── project-note.md
        ├── weekly-review.md
        └── reflection-note.md
```

**Note**: These paths are configurable in settings. You can adjust them to match your vault structure.

## Configuration

Go to Settings → timeflow to configure:

### Display Settings
- **Language** - Choose between Norwegian (Norsk) and English
- **Hour Unit** - Display hours as "h" or "t" (timer)
- **Week Numbers** - Show/hide ISO week numbers in calendar and week card
- **Default View Location** - Open in sidebar or main window by default

### Special Day Types
Customize names and colors for:
- Comp time (Avspasering)
- Vacation (Ferie)
- Welfare leave (Velferdspermisjon)
- Self-reported sick leave (Egenmelding)
- Doctor's note sick leave (Sykemelding)
- Courses/Training (Kurs)
- Study leave (Studie)

### Work Configuration
- **Base Workday Hours** - Standard daily hours (e.g., 7.5, 8, 6)
- **Work Percentage** - Employment level (1.0 = 100%, 0.8 = 80%, etc.) - *only shown when weekly goals enabled*
- **Base Workweek Hours** - Standard weekly hours (e.g., 37.5, 40, 30) - *only shown when weekly goals enabled*
- **Lunch Break Duration** - Daily lunch break in minutes (automatically deducted)
- **Work Days** - Select which days are part of your work week (clickable buttons for each day)
- **Alternating Weeks** - Enable to configure different work days for alternating weeks
- **Enable Weekly/Monthly Goals** - Toggle to show/hide weekly goals and progress bars

### Leave Limits
- **Max Sick Leave Days** - Annual self-reported sick days (typically 8 in Norway)
  - Note: Only full sick days count towards this limit; partial sick days do not
- **Max Vacation Days** - Annual vacation days (typically 25 in Norway)

### Note Types
Configure custom note types with:
- Unique ID and display label
- Custom icon (emoji)
- Folder location
- Template path
- Auto-applied tags
- Filename pattern with variables: `{YYYY}`, `{MM}`, `{DD}`, `{WEEK}`

### File Paths
- **Holidays File Path** - Location of holidays definition file
- **Daily Notes Folder** - Where daily notes are created
- **Daily Notes Template** - Template for daily notes

### Advanced Configuration
- **Balance Calculation**
  - **Balance Start Date** - Set when to start counting flextime balance (default: Jan 1 of current year)
  - **Work Schedule History** - Historical schedule periods are tracked automatically for accurate flextime calculations when your work settings change
- **Half-Day Settings**
  - **Half-Day Mode** - Choose "Fixed" or "Percentage" based calculation
  - **Fixed Hours** - If using fixed mode, set the number of hours (default: 4)
- **Balance Color Thresholds** - Customize when the balance badge shows different colors
  - **Critical Low** - Hours below this show red (default: -15)
  - **Warning Low** - Hours below this show yellow (default: 0)
  - **Warning High** - Hours above this show yellow (default: 80)
  - **Critical High** - Hours above this show red (default: 95)
- **Data Validation Thresholds** - Adjust warning levels
  - **Long-running Timer** - Hours before warning about timer (default: 12)
  - **Very Long Session** - Hours before warning about session (default: 16)
  - **Maximum Duration** - Hours before error on duration (default: 24)
  - **High Weekly Total** - Hours before info on weekly total (default: 60)

### Other Settings
- **Update Interval** - How often to refresh the dashboard (default: 30 seconds)
- **Heatmap Columns** - Number of columns in history heatmap
- **Consecutive Flextime Warning** - Days before warning about streak

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

timeflow supports importing time data from multiple formats:

### Supported Formats

1. **Timekeep JSON** - The native format from Timekeep plugin
   ```json
   {"entries": [{"name": "jobb", "startTime": "2024-01-15T09:00:00Z", "endTime": "2024-01-15T17:00:00Z"}]}
   ```

2. **CSV** - Spreadsheet format with automatic delimiter detection
   ```csv
   Dato;Start;Slutt;Aktivitet
   15.01.2024;09:00;17:00;jobb
   16.01.2024;08:30;16:30;jobb
   ```
   - Supports Norwegian date format (DD.MM.YYYY) and ISO format (YYYY-MM-DD)
   - Auto-detects delimiter (semicolon, comma, or tab)
   - Flexible column name matching (Dato/Date, Start/Starttid, Slutt/End, etc.)

3. **JSON Array** - Simple array of objects
   ```json
   [{"date": "2024-01-15", "start": "09:00", "end": "17:00", "activity": "jobb"}]
   ```

### How to Import

1. Go to **Settings → timeflow → Data Management**
2. Click **Import Data**
3. Either:
   - Click **"Select file..."** to upload a file (.json, .csv, .txt)
   - Paste data directly into the text area
4. The importer will auto-detect the format and show a preview
5. Review the parsed entries and any warnings
6. Click **"Import"** to add the entries

### Import Features
- **Auto-detection** of format and delimiter
- **Preview** of first 5 entries before importing
- **Validation** with error and warning messages
- **Duplicate detection** - skips entries that already exist
- **Detailed feedback** showing added vs. skipped entries

## Configuration Examples for Different Work Scenarios

These examples show how to configure the plugin settings for common work situations. All values are set in Settings → timeflow.

### Standard Norwegian Worker
```
Base Workday: 7.5 hours
Base Workweek: 37.5 hours
Work Percentage: 100%
Lunch Break: 0 minutes (included in 7.5h)
Work Days: Mon, Tue, Wed, Thu, Fri
Enable Weekly Goals: ✅ Yes
Max Egenmelding: 8 days
Max Ferie: 25 days
```

### 8-Hour Day with Lunch Break
```
Base Workday: 8 hours
Base Workweek: 40 hours
Lunch Break: 30 minutes
Work Days: Mon, Tue, Wed, Thu, Fri
Result: 7.5 hours counted per day
```

### 4-Day Workweek
```
Base Workday: 7.5 hours
Base Workweek: 30 hours
Work Days: Mon, Tue, Wed, Thu (or any 4 days)
```

### Weekend Shift Worker
```
Base Workday: 7.5 hours
Base Workweek: 37.5 hours
Work Days: Mon, Tue, Wed, Thu, Fri, Sat, Sun
Result: All 7 days count toward weekly goals
```

### Alternating Weekend Worker
```
Base Workday: 7.5 hours
Base Workweek: 37.5 hours
Enable Alternating Weeks: ✅ Yes
Week 1 Work Days: Mon, Tue, Wed, Thu, Fri
Week 2 Work Days: Mon, Tue, Wed, Thu, Fri, Sat, Sun
Result: Work every other weekend
```

### Part-Time Worker
```
Work Percentage: 0.5 (50%)
Base Workday: 7.5 hours
Base Workweek: 18.75 hours (37.5 * 0.5)
Work Days: Mon, Tue, Wed, Thu, Fri
```

### Flexible Freelancer (No Fixed Schedule)
```
Base Workday: 7.5 hours
Enable Weekly Goals: ❌ No
Work Days: Select all days or just work days
Result: No weekly goals shown, just daily tracking and flextime balance
```

## How It Works

1. **Data Source**: The plugin stores timer data in `timeflow/data.md`
2. **Settings Sync**: Settings are embedded in the data file for cross-device sync
3. **Processing**: Entries are processed into daily/weekly/monthly summaries
4. **Holiday Integration**: Planned days are loaded from the holidays file
5. **Balance Calculation**: Flextime balance is calculated by comparing worked hours to daily goals
   - Lunch breaks are automatically deducted
   - Weekend behavior respects user configuration
6. **Real-time Updates**: Dashboard updates every 30 seconds with live clock updates every second
7. **Visualizations**: Multiple views provide insights into your work patterns

## Flextime Calculation

- **Workdays**: Hours beyond the daily goal contribute to flextime
- **Lunch Breaks**: Automatically deducted from work hours (if configured)
- **Weekends**: Behavior depends on settings:
  - Default: All work hours count as flextime bonus
  - With weekend work enabled: Count toward weekly goals
- **Special Days**: Days marked as holidays, sick leave, etc. count as full workday (no flextime change)
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

### Timesaldo Badge
The flextime balance badge uses color coding to indicate compliance with recommended limits:

- 🟢 **Green**: 0-80 hours (healthy flextime balance within guidelines)
- 🟡 **Yellow**: -15 to 0 or 80-95 hours (approaching limits, consider adjusting)
- 🔴 **Red**: < -15 or > 95 hours (outside recommended range, action needed)

These thresholds are configurable in Settings → Advanced Configuration → Balance Color Thresholds.

### Calendar Days
- **Light to dark green gradient**: Positive flextime (overtid) - darker green = more hours worked beyond goal
- **Light to dark blue gradient**: Negative flextime (undertid) - darker blue = more deficit
- **Special colors**: Customizable colors for vacation, sick leave, courses, etc.
- **Border**: Today's date has a colored border
- **Gray**: Weekends with no work (unless weekend work is enabled)
- **Light gray**: Past empty weekdays (no work registered)

### Day and Week Cards
- Dynamic background colors based on progress toward goals
- Progress bars showing percentage of goal completion
- Contextual messages based on work patterns

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
