# Future Days

This document contains an overview of future days that will affect the dashboard. This includes both public holidays and planned time off.

## How to add your own planned days

You can add your own planned days by following the same format as the holidays:

```
- YYYY-MM-DD: type: Description
```

**Available types:**
- `helligdag`: Public holidays (days off)
- `ferie`: Planned vacation
- `avspasering`: Planned time off (using accumulated flextime)
- `velferdspermisjon`: Planned welfare leave
- `egenmelding`: Self-certified sick leave
- `studie`: Planned study day
- `kurs`: Planned course/training day
- `half`: Half workday (reduces daily goal by half, e.g., 3.75 hours)

**Half workdays:** You can use `half:` as a type for half workdays, or add `:half` after another type (e.g., `ferie:half:`).

**Example:**

```
- 2025-07-01: ferie: Summer vacation week 1
- 2025-07-02: ferie: Summer vacation week 1
- 2025-08-15: avspasering: Extra day off
- 2025-09-10: kurs: AWS certification
- 2025-12-23: half: Christmas Eve eve (half workday)
- 2025-12-27: ferie:half: Half vacation day (alternative syntax)
```

---
## Public Holidays (Example: US Federal Holidays)

### 2025
- 2025-01-01: helligdag: New Year's Day
- 2025-01-20: helligdag: Martin Luther King Jr. Day
- 2025-02-17: helligdag: Presidents' Day
- 2025-05-26: helligdag: Memorial Day
- 2025-06-19: helligdag: Juneteenth
- 2025-07-04: helligdag: Independence Day
- 2025-09-01: helligdag: Labor Day
- 2025-10-13: helligdag: Columbus Day
- 2025-11-11: helligdag: Veterans Day
- 2025-11-27: helligdag: Thanksgiving Day
- 2025-12-25: helligdag: Christmas Day

### 2026
- 2026-01-01: helligdag: New Year's Day
- 2026-01-19: helligdag: Martin Luther King Jr. Day
- 2026-02-16: helligdag: Presidents' Day
- 2026-05-25: helligdag: Memorial Day
- 2026-06-19: helligdag: Juneteenth
- 2026-07-03: helligdag: Independence Day (observed)
- 2026-09-07: helligdag: Labor Day
- 2026-10-12: helligdag: Columbus Day
- 2026-11-11: helligdag: Veterans Day
- 2026-11-26: helligdag: Thanksgiving Day
- 2026-12-25: helligdag: Christmas Day

### 2027
- 2027-01-01: helligdag: New Year's Day
- 2027-01-18: helligdag: Martin Luther King Jr. Day
- 2027-02-15: helligdag: Presidents' Day
- 2027-05-31: helligdag: Memorial Day
- 2027-06-18: helligdag: Juneteenth (observed)
- 2027-07-05: helligdag: Independence Day (observed)
- 2027-09-06: helligdag: Labor Day
- 2027-10-11: helligdag: Columbus Day
- 2027-11-11: helligdag: Veterans Day
- 2027-11-25: helligdag: Thanksgiving Day
- 2027-12-24: helligdag: Christmas Day (observed)

---
## Your Planned Days Off

Add your own planned days off here. Follow the format above.

```

```

---
## Notes

**About this file:**
- This file is read by the Timeflow plugin to determine which days are holidays or planned time off
- The type must match one of the configured absence types in the plugin settings
- You can customize the absence types and their behavior in the plugin settings

**Holiday types explained:**
- `helligdag` (public holiday): No work expected, doesn't affect your flextime balance
- `ferie` (vacation): Uses your vacation days, no work expected
- `avspasering` (time off): Uses accumulated flextime as time off
- `egenmelding` (self-certified sick leave): Reduces daily goal, tracks sick days
- `studie`/`kurs` (study/course): Can be configured to accumulate or count as work

**Tips:**
- Update this document annually with new holiday dates
- You can find public holidays for your country on various calendar websites
- The plugin will warn you if you have work entries on days marked as holidays
