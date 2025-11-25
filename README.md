# TimeFlow Plugin

TimeFlow is an Obsidian plugin that provides a comprehensive flextime tracking dashboard with **built-in timer functionality**, beautiful visualizations, and statistics.

## Features

### ⏱️ Built-in Timer System
- **Start/Stop Timers** - No external plugins needed! Start and stop work timers directly from the dashboard
- **Multiple Timer Support** - Run multiple timers simultaneously for different tasks
- **Live Timer Display** - See running timers with real-time duration updates
- **Automatic Logging** - Completed timers are automatically saved to your daily notes

### 📊 Tracking & Visualization
- **Real-time Flextime Balance Tracking** - See your current flextime balance with color-coded indicators
- **Daily, Weekly, and Monthly Views** - Track your work hours with intuitive cards and progress bars
- **Interactive Month Calendar** - Visual calendar with color-coded days for planned holidays and flextime
- **Comprehensive Statistics** - View statistics for total, yearly, and monthly periods
- **Contextual Messages** - Get motivational and informative messages based on your work patterns
- **Multiple History Views** - List, weekly, and heatmap visualizations of your work history

### 🎯 Planning & Organization
- **Holiday Planning** - Integrate planned holidays and special days from a markdown file
- **Note Creation** - Create daily notes, meeting notes, project notes, and more directly from the calendar
- **Data Validation** - Automatically detect issues like negative durations, long-running timers, and overlapping entries
- **CSV Export** - Export your time data to CSV for further analysis

## Requirements

- **Obsidian** v0.15.0 or higher
- **No external plugins required!** - TimeFlow has its own built-in timer system

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
5. Enable the TimeFlow plugin in Obsidian settings

### Manual Installation

1. Download the latest release from GitHub
2. Extract the files to `<vault>/.obsidian/plugins/timeflow/`
3. Reload Obsidian
4. Enable the TimeFlow plugin in Obsidian settings

## Usage

### Opening the Dashboard

- Click the calendar-clock icon in the ribbon
- Or use the command palette: "Open TimeFlow Dashboard"

### Using Timers

#### Starting a Timer

1. **From the Dashboard**: Click the **"▶️ Start Timer"** button in the top section
2. **From Command Palette**: Run "Start Timer" command
3. The timer will appear with a live duration display

#### Stopping a Timer

1. Click the **"⏹️ Stop"** button next to the running timer
2. Or use "Stop All Timers" from the command palette
3. The timer data will be automatically saved to your daily note

#### Timer Data Storage

- All timer data is stored in `timeflow/data.md` in your vault
- Uses **Timekeep-compatible format** (backwards compatible!)
- Data is stored in a `timekeep` codeblock as JSON
- Format: `{"entries":[{"name":"Jobb","startTime":"...","endTime":"...","subEntries":null}]}`
- You can import existing Timekeep data
- All timer data is integrated into your flextime calculations

#### Backwards Compatibility with Timekeep

TimeFlow uses the exact same data format as the Timekeep plugin:

```markdown
# timeflow data

\`\`\`timekeep
{
  "entries": [
    {
      "name": "Jobb",
      "startTime": "2025-11-25T06:44:34.414Z",
      "endTime": "2025-11-25T15:52:31.638Z",
      "subEntries": null
    }
  ]
}
\`\`\`
```

This means:
- ✅ You can import your existing Timekeep data
- ✅ Data can be read by Timekeep plugin if you switch back
- ✅ Support for collapsed entries and subEntries
- ✅ Seamless migration path

### File Structure

TimeFlow uses a simple folder structure to organize its files:

```
Your Vault/
└── timeflow/                     # timeflow plugin folder
    ├── data.md                   # Timer data (Timekeep-compatible format)
    ├── holidays.md               # Holiday and special days definitions
    └── templates/                # Note templates
        ├── daily-notes.md
        ├── meeting-note.md
        ├── project-note.md
        ├── weekly-review.md
        └── reflection-note.md
```

**Note**: These paths are configurable in settings. You can adjust them to match your vault structure.

### Configuration

Go to Settings → TimeFlow to configure:

- **Work Configuration**
  - Work Percentage (default: 100%)
  - Base Workday Hours (default: 7.5)

- **File Paths**
  - Holidays File Path
  - Daily Notes Folder
  - Daily Notes Template Path

- **Display Settings**
  - Consecutive Flextime Warning Days
  - Heatmap Columns
  - Update Interval

### Holiday File Format

Create a file (default: `timeflow/holidays.md`) with the following format:

```markdown
- 2025-12-25: helligdag: Jul
- 2025-07-01: ferie: Sommerferie
- 2025-06-23: ferie:half: Halv dag før sankthans
```

Format: `- YYYY-MM-DD: type[:half]: description`

Supported types:
- `helligdag` - Public holiday
- `ferie` - Vacation
- `avspasering` - Comp time
- `egenmelding` - Sick leave
- `velferdspermisjon` - Welfare leave
- `kurs` - Course
- `studie` - Study
- `half` - Half day (4 hours)

### Migrating from Timekeep

If you have existing Timekeep data, you can easily migrate:

1. **Use the Import button**: In the TimeFlow dashboard, click the "📥 Import" button in the Historikk section
2. **Paste your JSON**: Copy the JSON data from your Timekeep codeblocks and paste it into the import dialog
3. **Or manually create the file**: Create `timeflow/data.md` with this format:
   ```markdown
   # timeflow data

   \`\`\`timekeep
   {"entries":[...your entries here...]}
   \`\`\`
   ```
4. **Reload the plugin**: Your data will be automatically loaded!

Alternatively, TimeFlow can read from multiple sources:
- The main `TimeFlow Data.md` file (created automatically)
- Any daily notes in your Daily Notes folder with `timekeep` codeblocks
- You can keep using Timekeep alongside TimeFlow if needed

## Development

### Project Structure

```
timeflow-plugin/
├── src/
│   ├── main.ts              # Plugin entry point
│   ├── view.ts              # Main dashboard view
│   ├── settings.ts          # Plugin settings
│   ├── timerManager.ts      # Timer management (Timekeep-compatible)
│   ├── dataManager.ts       # Data processing and calculations
│   ├── messageGenerator.ts  # Contextual message generation
│   ├── uiBuilder.ts         # UI component builder
│   └── utils.ts             # Utility functions
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

1. **Data Source**: The plugin reads Timekeep codeblocks from the active file
2. **Processing**: Entries are processed into daily/weekly/monthly summaries
3. **Holiday Integration**: Planned days are loaded from the holidays file
4. **Balance Calculation**: Flextime balance is calculated by comparing worked hours to daily goals
5. **Real-time Updates**: Dashboard updates every 30 seconds with live clock updates every second
6. **Visualizations**: Multiple views provide insights into your work patterns

## Flextime Calculation

- **Workdays**: Hours beyond the daily goal contribute to flextime
- **Weekends**: All work hours count as flextime
- **Special Days**: Days marked as holidays, sick leave, etc. don't require work hours
- **Half Days**: Goal is 4 hours instead of 7.5
- **Avspasering (Comp Time)**: Withdraws from flextime balance

## Color Coding

### Timesaldo Badge
- 🟢 **Green**: 0-80 hours
- 🟡 **Yellow**: -15 to 0 or 80-95 hours
- 🔴 **Red**: < -15 or > 95 hours

### Calendar Days
- **Green gradient**: Positive flextime (overtid)
- **Red gradient**: Negative flextime (undertid)
- **Special colors**: Different colors for vacation, sick leave, courses, etc.
- **Border**: Today's date has a colored border

## Troubleshooting

### Dashboard not loading
- Ensure Timekeep plugin is installed and enabled
- Open a file that contains Timekeep codeblocks
- Check the status bar at the bottom of the dashboard for errors

### Data validation warnings
- Check for entries with negative durations
- Look for long-running timers that haven't been stopped
- Verify entries don't have overlapping time ranges

### Holiday file not found
- Check the file path in settings
- Ensure the file exists in your vault
- File path should be relative to vault root

## Credits

Original dataview script by Gaute
Converted to Obsidian plugin with full TypeScript implementation

## License

MIT License

## Support

For issues and feature requests, please create an issue on GitHub.

## Version History

### 1.0.0
- Initial release
- Full conversion from dataview script to native plugin
- **Built-in Timer System** - No dependency on Timekeep plugin!
  - Start/stop timers directly from dashboard
  - Live timer display with running duration
  - Automatic saving to daily notes
  - Multiple concurrent timer support
- All original features preserved
- Added settings panel for configuration
- Improved performance with caching
- Better error handling and validation
- Self-contained solution with integrated time tracking
