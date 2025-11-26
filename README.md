# timeflow Plugin

timeflow provides a comprehensive flextime tracking dashboard with **built-in timer functionality**, beautiful visualizations, and extensive customization options.

![timeflow Dashboard](timeflow.png)

## Features

### ⏱️ Built-in Timer System
- **Start/Stop Timers** - Start and stop work timers directly from the dashboard
- **Live Timer Display** - See running timers with real-time duration updates in the top banner
- **Automatic Logging** - Completed timers are automatically saved to your data file
- **Quick Access** - Start/stop timers via command palette or dashboard buttons

### 📊 Tracking & Visualization
- **Real-time Flextime Balance Tracking** - See your current flextime balance with color-coded indicators
- **Daily, Weekly, and Monthly Views** - Track your work hours with intuitive cards and responsive layout
- **Interactive Month Calendar** - Visual calendar with color-coded days for planned holidays and flextime
  - Click any date for quick actions
  - Edit work time, register special days, create notes
  - View running timers and day summaries in info panel
- **Comprehensive Statistics** - View statistics for total, yearly, and monthly periods
- **Contextual Messages** - Get motivational and informative messages based on your work patterns
- **Multiple History Views** - List and heatmap visualizations of your work history

### 🎯 Planning & Organization
- **Holiday Planning** - Integrate planned holidays and special days from a markdown file
- **Customizable Note Types** - Create and manage custom note templates with flexible configuration
  - Daily notes, meeting notes, project notes, weekly reviews, reflections
  - Custom folders, templates, tags, and filename patterns
  - Add/edit/delete note types through settings
- **Calendar Context Menu** - Click any date to:
  - Add work time entries
  - Edit existing entries (with running timer support)
  - Register special days (vacation, sick leave, courses, etc.)
  - Create custom note types
  - View day summary with running timers
- **Data Validation** - Automatically detect issues like negative durations, long-running timers, and overlapping entries
- **CSV Export** - Export your time data to CSV for further analysis
- **Import/Export** - Import existing Timekeep data with duplicate detection

### ⚙️ Advanced Customization

#### Work Configuration
- **Flexible Work Schedules**
  - Configurable workday hours (e.g., 7.5, 8, 6-hour days)
  - Configurable workweek hours (e.g., 37.5, 40, 30-hour weeks)
  - Work percentage (full-time, part-time employment)
  - **Lunch break deduction** - Automatically subtract lunch breaks from work hours
  - **Weekend work support** - Toggle Saturday/Sunday as regular workdays

#### Leave Management
- **Configurable Leave Limits**
  - Maximum sick leave days (egenmelding) - default: 8 days
  - Maximum vacation days (ferie) - default: 25 days
  - Dashboard displays usage against configured limits

#### Special Day Types
- **Fully Customizable** - Change names and colors for all special day types:
  - Avspasering (Comp time)
  - Ferie (Vacation)
  - Velferdspermisjon (Welfare leave)
  - Egenmelding (Self-reported sick leave)
  - Sykemelding (Doctor's note sick leave)
  - Kurs (Course/Training)
  - Studie (Study leave)

#### Theme Support
- **Multiple Theme Options**
  - Light theme with vibrant gradients
  - Dark theme with muted tones
  - System theme matching Obsidian's theme
  - Hour unit preference (h or t for "timer")

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
4. Enable the TimeFlow plugin in Obsidian settings

## Usage

### Opening the Dashboard

- Click the calendar-clock icon in the ribbon
- Or use the command palette: "Open timeflow Dashboard"

### Using Timers

#### Starting a Timer

1. **From the Dashboard**: Click the **Start"** button in the top banner
2. **From Command Palette**: Run "Start Timer" command
3. The timer will appear in the banner with a live duration display

#### Stopping a Timer

1. Click the timer badge in the top banner to see all running timers
2. Click **Stop** button next to the timer you want to stop
3. Or use "Stop All Timers" from the command palette
4. The timer data will be automatically saved to `timeflow/data.md`

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
- ✅ You can import your existing Timekeep data
- ✅ Data can be read by Timekeep plugin if you switch back
- ✅ Support for collapsed entries and subEntries
- ✅ Settings sync across devices automatically
- ✅ Seamless migration path

### File Structure

timeflow uses a simple folder structure to organize its files:

```
Your Vault/
└── timeflow/                     # TimeFlow plugin folder
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
- **Theme** - Choose between Light, Dark, or System theme
- **Hour Unit** - Display hours as "h" or "t" (timer)

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
- **Work Percentage** - Employment level (1.0 = 100%, 0.8 = 80%, etc.)
- **Base Workday Hours** - Standard daily hours (e.g., 7.5, 8, 6)
- **Base Workweek Hours** - Standard weekly hours (e.g., 37.5, 40, 30)
- **Lunch Break Duration** - Daily lunch break in minutes (automatically deducted)
- **Weekend Work** - Toggle Saturday/Sunday as regular workdays

### Leave Limits
- **Max Sick Leave Days** - Annual self-reported sick days (typically 8 in Norway)
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

### Advanced Settings
- **Update Interval** - How often to refresh the dashboard (default: 30 seconds)
- **Heatmap Columns** - Number of columns in history heatmap
- **Consecutive Flextime Warning** - Days before warning about streak

## Holiday File Format

Create a file (default: `timeflow/holidays.md`) with the following format:

```markdown
- 2025-12-25: helligdag: Jul
- 2025-07-01: ferie: Sommerferie
- 2025-06-23: ferie:half: Halv dag før sankthans
```

Format: `- YYYY-MM-DD: type[:half]: description`

Supported types:
- `helligdag` - Public holiday (counts as full workday)
- `ferie` - Vacation (withdraws from flextime)
- `avspasering` - Comp time (withdraws from flextime)
- `egenmelding` - Self-reported sick leave (counts as full workday)
- `sykemelding` - Doctor's note sick leave (counts as full workday)
- `velferdspermisjon` - Welfare leave (counts as full workday)
- `kurs` - Course/Training (regular workday applies)
- `studie` - Study leave (regular workday applies)
- `half` - Half day modifier (4 hours instead of full workday)

## Migrating from Timekeep

If you have existing Timekeep data, you can easily migrate:

1. **Use the Import button**: In the Settings → timeflow → Data Management section
2. **Paste your JSON**: Copy the JSON data from your Timekeep codeblocks
3. **Automatic duplicate detection**: The import process will skip duplicate entries
4. **Or manually create the file**: Create `timeflow/data.md` with the format shown above

The import feature automatically:
- Detects and skips duplicate entries (based on name, startTime, endTime)
- Shows detailed feedback about added vs. skipped entries
- Merges with existing data without data loss

## Configuration Examples for Different Work Scenarios

These examples show how to configure the plugin settings for common work situations. All values are set in Settings → timeflow.

### Standard Norwegian Worker
```
Base Workday: 7.5 hours
Base Workweek: 37.5 hours
Work Percentage: 100%
Lunch Break: 0 minutes (included in 7.5h)
Weekend: Saturday/Sunday not included
Max Egenmelding: 8 days
Max Ferie: 25 days
```

### 8-Hour Day with Lunch Break
```
Base Workday: 8 hours
Base Workweek: 40 hours
Lunch Break: 30 minutes
Result: 7.5 hours counted per day
```

### 4-Day Workweek
```
Base Workday: 7.5 hours
Base Workweek: 30 hours
```

### Weekend Shift Worker
```
Base Workday: 7.5 hours
Base Workweek: 37.5 hours
Saturday: ✅ Included in work week
Sunday: ✅ Included in work week
Result: Weekend hours count toward weekly goals
```

### Part-Time Worker
```
Work Percentage: 0.5 (50%)
Base Workday: 7.5 hours
Base Workweek: 18.75 hours (37.5 * 0.5)
```

## Development

### Project Structure

```
timeflow-plugin/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── view.ts              # Main dashboard view
│   ├── settings.ts          # Plugin settings with sync support
│   ├── timerManager.ts      # Timer management (Timekeep-compatible)
│   ├── dataManager.ts       # Data processing and calculations
│   ├── messageGenerator.ts  # Contextual message generation
│   ├── uiBuilder.ts         # UI component builder with responsive layout
│   ├── utils.ts             # Utility functions
│   └── importModal.ts       # Data import with duplicate detection
├── styles.css               # Plugin styles (injected in uiBuilder)
├── manifest.json            # Plugin manifest
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript configuration
└── esbuild.config.mjs       # Build configuration
```

### Building

- **Development mode (watch)**: `npm run dev`
- **Production build**: `npm run build`

### Scripts

- `npm run dev` - Start development with watch mode
- `npm run build` - Build production version
- `npm run version` - Bump version and update manifest

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

## Color Coding

### Timesaldo Badge
- 🟢 **Green**: 0-80 hours (healthy flextime balance)
- 🟡 **Yellow**: -15 to 0 or 80-95 hours (approaching limits)
- 🔴 **Red**: < -15 or > 95 hours (outside recommended range)

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

Original dataview script by Gaute
Converted to Obsidian plugin with full TypeScript implementation with AI

## License

MIT License

## Support

For issues and feature requests, please create an issue on GitHub.

## Version History

### 1.0.0
- Initial release
- Full conversion from dataview script to native plugin
- **Built-in Timer System** - No dependency on external plugins
  - Start/stop timers directly from dashboard
  - Live timer display with running duration
  - Automatic saving to data file
  - Multiple concurrent timer support
- **Customization Features**
  - Configurable special day types (names and colors)
  - Customizable note types with templates
  - Flexible work schedules (workday/workweek hours)
  - Lunch break deduction
  - Weekend work configuration
  - Leave limits tracking
- **Cross-Device Sync**
  - Settings automatically sync via data file
  - Works with Obsidian Sync and other sync solutions
- **Enhanced Calendar**
  - Right-click context menu with quick actions
  - Edit work time and running timers
  - Register special days
  - Create custom note types
  - Info panel with day summary
- **Import/Export**
  - Import Timekeep data with duplicate detection
  - Export to CSV for analysis
- **Responsive Layout**
  - Grid-based layout that adapts to screen size
  - Day and Week cards stay side-by-side
  - Calendar moves up on wide screens
- **Theme Support**
  - Light, Dark, and System themes
  - Configurable hour units (h or t)
- Improved performance with caching
- Better error handling and validation
- Comprehensive settings panel
- Self-contained solution with integrated time tracking
