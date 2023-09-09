# UNMAINTAINED

This project is no longer maintained as of September 2023

# @upleveled/ical-move-events

Move all events in an iCalendar file (`.ics` file) to a new starting date.

## Install

```sh
pnpm global add @upleveled/ical-move-events
```

## Usage

The following command will read the file `calendar.ics` in a directory named `data` and create a file called `calendar-moved.ics` in the same directory with the moved events.

```sh
icalmv data/calendar.ics --start 2020-05-21 --end 2020-08-15
```

`icalmv` moves events to avoid public holidays, defaulting to [officeholidays.com Austrian Calendar](https://www.officeholidays.com/ics-clean/austria), which returns events until the end of the year after next. To specify another calendar, pass in a URL to an iCalendar file using the `--holidays-ical` option (or specify `false` if you don't want any holidays):

```sh
icalmv data/calendar.ics --start 2020-05-21 --end 2020-08-15 --holidays-ical https://calendar.google.com/calendar/ical/en.canadian.official%23holiday%40group.v.calendar.google.com/public/basic.ics
```

`icalmv` manages holiday calendar entries too, removing any events with the title of `🎉 Holiday` and creating full-day events (9:00 to 18:00) with this same title. Configure the title with `--holiday-title`:

```sh
icalmv data/calendar.ics --start 2020-05-21 --end 2020-08-15 --holiday-title 'Public holiday'
```

`icalmv` assumes that everything is a single day event, unless the duration is specified in parentheses in the event title, like so: `Final Project (25 days)`

## Development

During development, run `icalmv` using `pnpm dev`, with all other arguments staying the same:

```sh
pnpm dev data/calendar.ics --start 2020-05-21 --end 2020-08-15
```
