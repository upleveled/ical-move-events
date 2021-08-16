# ical-move-events

Move all events in an iCalendar file (`.ics` file) to a new starting date.

## Install

```sh
yarn global add @upleveled/ical-move-events
```

## Usage

The following command will read the file `calendar.ics` in a directory named `data` and create a file called `calendar-moved.ics` in the same directory with the moved events.

```sh
icalmv data/calendar.ics --start 2020-05-21 --end 2020-08-15
```

This will account for timezone changes as a result of Daylight Savings Time, with a default timezone of `Europe/Vienna`. To specify a different timezone, pass in a `--timezone` option:

```sh
icalmv data/calendar.ics --start 2020-05-21 --end 2020-08-15 --timezone America/Vancouver
```

## Develop Mode

```sh
yarn dev data/calendar.ics --start 2020-05-21 --end 2020-08-15
```
