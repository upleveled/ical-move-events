# ical-to-csv-move-events

Move all events in an iCalendar file (`.ics` file) to start at a new starting date and generate a CSV file in the Outlook format.

## Usage

The following command will read the file `calendar.ics` in the `data` directory and create a file called `calendar.csv` in the same directory with the moved events.

```sh
yarn start data/calendar.ics 2020-05-21
```

If you need to add or subtract a number of hours from all events, you can add an optional `offset` parameter. For example, the following command will shift all events one hour earlier:

```sh
yarn start data/calendar.ics 2020-05-21 -1
```

## Develop Mode

```sh
yarn dev data/calendar.ics 2020-05-21
```

## Why convert to CSV?

Originally, this script just generated a second iCalendar file using `ical-generator` (see [this old commit](https://github.com/upleveled/ical-to-csv-move-events/commit/60a116a9c4bcafdd48a70301c3eef267c306a2e6)), but upon importing in Google Calendar, emoji were being incorrectly interpreted:

<img src=".readme/google-calendar-broken-emoji.png" alt="Screenshot of Google Calendar entries showing broken emoji">

To compare, here is the original emoji:

<img src=".readme/google-calendar-working-emoji.png" alt="Screenshot of Google Calendar entries showing working emoji">

When using the Outlook CSV format to import the calendar entries, this problem did not occur.

## Why does this depend on the GitHub version of `ts-node`?

The version of `ts-node` on GitHub has [ESM support with `--transpile-only`](https://github.com/TypeStrong/ts-node/pull/1102).
