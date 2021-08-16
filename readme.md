# ical-move-events

Move all events in an iCalendar file (`.ics` file) to a new starting date.

## Install

```sh
yarn global add @upleveled/ical-move-events
```

## Usage

The following command will read the file `calendar.ics` in a directory named `data` and create a file called `calendar-moved.ics` in the same directory with the moved events.

```sh
icalmv data/calendar.ics --start 2020-05-21
```

If you need to add or subtract a number of hours from all events, you can add an optional `offset` parameter. For example, the following command will shift all events one hour earlier:

```sh
icalmv data/calendar.ics --start 2020-05-21 --offset -1
```

## Develop Mode

```sh
yarn dev data/calendar.ics --start 2020-05-21
```
