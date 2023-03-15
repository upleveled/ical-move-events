import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  addDays,
  differenceInDays,
  endOfDay,
  format,
  isWeekend,
  min,
  startOfDay,
} from 'date-fns';
import icalGenerator from 'ical-generator';
import icalParser from 'node-ical';
import { remark } from 'remark';
import extractFrontmatter from 'remark-extract-frontmatter';
import remarkFrontmatter from 'remark-frontmatter';
import rrule from 'rrule';
import yaml from 'yaml';

// eslint-disable-next-line @typescript-eslint/naming-convention -- rrule is still not pure ESM
const { RRule } = rrule;

const {
  values: {
    start,
    end,
    'holidays-ical':
      holidaysIcalUrl = 'https://www.officeholidays.com/ics-clean/austria',
    'holiday-title': holidayTitle = '🎉 Holiday',
  },
  positionals: [inputIcalFile],
} = parseArgs({
  options: {
    start: { type: 'string' },
    end: { type: 'string' },
    'holidays-ical': { type: 'string' },
    'holiday-title': { type: 'string' },
  },
  allowPositionals: true,
});

if (!inputIcalFile || !start || !end) {
  console.error(`Error: Please specify an input file, start date and end date. Eg:
$ icalmv calendar.ics --start 2020-05-21 --end 2020-08-15`);
  process.exit(1);
}

const startOfDayStart = startOfDay(new Date(start));
const startOfDayEnd = startOfDay(new Date(end));

const holidayEvents =
  holidaysIcalUrl === 'false'
    ? []
    : (
        Object.values(await icalParser.fromURL(holidaysIcalUrl)).filter(
          (event) =>
            event.type === 'VEVENT' &&
            !(event.summary as any)?.val.includes('Regional') &&
            // Only holiday events during the specified range
            startOfDayStart.getTime() <= event.start.getTime() &&
            startOfDayEnd.getTime() >= event.end.getTime(),
        ) as icalParser.VEvent[]
      ).sort((a, b) => {
        return a.start.getTime() - b.start.getTime();
      });

function isHoliday(date: Date) {
  return holidayEvents.some(
    (holiday) => holiday.start.getTime() === date.getTime(),
  );
}

const outputIcalFile = inputIcalFile.replace('.ics', '-moved.ics');

if (existsSync(outputIcalFile)) {
  console.error(`Error: Output file at ${outputIcalFile} already exists!`);
  process.exit(1);
}

const parsedCalendar = await icalParser.parseFile(inputIcalFile);
const timezone = (
  Object.values(parsedCalendar).filter(
    (calendarComponent) => calendarComponent.type === 'VTIMEZONE',
  )[0] as icalParser.VTimeZone
).tzid;

const sortedNonHolidayEvents = (
  Object.values(parsedCalendar).filter((event) => {
    return event.type === 'VEVENT' && event.summary !== holidayTitle;
  }) as icalParser.VEvent[]
).sort((a, b) => {
  return a.start.getTime() - b.start.getTime();
});

type EventsByStartDate = {
  [startDateIsoString: string]: {
    event: icalParser.VEvent;
    schedule: null | {
      startDate: {
        day: 'last';
        week: number;
      };
    };
  }[];
};

/**
 * An object with:
 * - keys: derived from the start of the day upon which the events take place
 * - values: an array of all events on that day
 *
 * Eg:
 *
 * ```js
 * {
 *   '2021-08-04T22:00:00.000Z': [
 *     {
 *       type: 'VEVENT',
 *       start: '2021-08-04T22:00:00.000Z',
 *       end: '2021-08-13T22:00:00.000Z',
 *       summary: '🏗 Project 2 (6 days)',
 *       // ...
 *     },
 *     {
 *       type: 'VEVENT',
 *       start: '2021-08-05T07:30:00.000Z',
 *       end: '2021-08-05T10:30:00.000Z',
 *       summary: '🧑‍🏫 Lecture 4',
 *       // ...
 *     },
 *     {
 *       type: 'VEVENT',
 *       start: '2021-08-05T10:30:00.000Z',
 *       end: '2021-08-05T16:00:00.000Z',
 *       summary: 'Project Time 4',
 *       // ...
 *     },
 *   ],
 *   // ...
 * }
 * ```
 */
const eventsByStartDates: EventsByStartDate = {};

for (const event of sortedNonHolidayEvents) {
  const eventStartOfDay = startOfDay(event.start).toISOString();
  eventsByStartDates[eventStartOfDay] ??= [];
  eventsByStartDates[eventStartOfDay]!.push({
    event: event,
    schedule:
      !event.description || !event.description.includes('---')
        ? null
        : ((
            await remark()
              .use(remarkFrontmatter)
              .use(extractFrontmatter, { yaml: yaml.parse })
              .process(event.description)
          ).data as EventsByStartDate[string][number]['schedule']),
  });
}

function startOfDayFromString(/** Eg. 2020-12-30 */ dateString: string) {
  return startOfDay(new Date(dateString));
}

// Generate array of all dates between the start and end, including metadata
// about whether the date falls on a weekend or holiday, in which case the
// date is also marked as being fully scheduled
const availableDates = [
  ...Array(
    differenceInDays(startOfDayFromString(end), startOfDayFromString(start)) +
      1,
  ).keys(),
].map((daysToAdd) => {
  const date = addDays(startOfDayFromString(start), daysToAdd);
  const dateIsWeekend = isWeekend(date);
  const dateIsHoliday = isHoliday(date);
  const isFullyScheduled = dateIsWeekend || dateIsHoliday;
  return {
    date: date,
    isFullyScheduled: isFullyScheduled,
    isWeekend: dateIsWeekend,
    isHoliday: dateIsHoliday,
  };
});

const calendar = icalGenerator();

for (const [startDate, events] of Object.entries(eventsByStartDates)) {
  const nextAvailableDate = availableDates.find(
    ({ isFullyScheduled }) => !isFullyScheduled,
  );

  if (!nextAvailableDate) {
    console.error(
      `Warning: Dropping events on start date ${startDate} (no available dates in time range):`,
      events.map(({ event }) => event.summary),
    );
    continue;
  }

  for (const { event } of events) {
    const daysDifferenceStart = differenceInDays(
      nextAvailableDate.date,
      new Date(startDate),
    );

    // The amount of days in parentheses in the event title, which
    // indicates the amount of non-weekend, non-holiday days
    // that this multi-day event requires
    const businessDaysDuration =
      Number(event.summary.match(/ \((\d+) days?\)/)?.[1]) ||
      // If there is no amount of days in the event
      // title, default to 1
      1;

    const eventNewStart = addDays(event.start, daysDifferenceStart);

    let eventNewEnd: Date;
    if (businessDaysDuration === 1) {
      eventNewEnd = addDays(event.end, daysDifferenceStart);
    } else {
      // Calculate the earliest possible new start date based on
      // the new event start date
      //
      // This means that this only supports full-day multi-day events
      // (because the time from the end date will be discarded)
      let fullyScheduledDaysDuringRange = 0;
      let eventDurationContainsCorrectBusinessDays;

      do {
        eventNewEnd = addDays(
          eventNewStart,
          businessDaysDuration + fullyScheduledDaysDuringRange,
        );

        // Find the number of weekend and holiday days during the range,
        // so the end date can be adjusted if necessary
        const recalculatedFullyScheduledDaysDuringRange = availableDates.filter(
          // This ESLint rule is disabled because it can result in
          // false positives
          // https://github.com/eslint/eslint/issues/5044
          // eslint-disable-next-line no-loop-func
          ({ isFullyScheduled, date }) => {
            return (
              eventNewStart.getTime() <= date.getTime() &&
              eventNewEnd.getTime() > date.getTime() &&
              isFullyScheduled
            );
          },
        ).length;

        // If there are more weekend or holiday days in the range than the last
        // time it was calculated, add the amount to the duration of the event
        if (
          recalculatedFullyScheduledDaysDuringRange >
          fullyScheduledDaysDuringRange
        ) {
          fullyScheduledDaysDuringRange =
            recalculatedFullyScheduledDaysDuringRange;
        } else {
          eventDurationContainsCorrectBusinessDays = true;
        }
      } while (!eventDurationContainsCorrectBusinessDays);
    }

    calendar.createEvent({
      ...(timezone ? { timezone: timezone } : {}),
      start: eventNewStart,
      ...(!event.rrule || !event.rrule.options.until
        ? {}
        : {
            // Intentionally do not respect the EXDATE entries, because
            // they often correspond to holidays, which will be different
            // based on the new date range
            //
            // If EXDATEs should be generated for the new holidays in the
            // range, these dates could be possibly generated from
            // the data in the `holidayEvents` array
            repeating: new RRule({
              ...event.rrule.options,
              dtstart: null,
              byhour: null,
              byminute: null,
              bysecond: null,
              until: min([
                addDays(event.rrule.options.until, daysDifferenceStart),
                // If the end date is earlier than the new calculated end
                // date of the recurring event, use the end date instead
                endOfDay(new Date(end)),
              ]),
            }).toString(),
          }),
      end: eventNewEnd,
      summary: event.summary,
      description: event.description,
      location: event.location,
      url: event.url,
    });
  }

  nextAvailableDate.isFullyScheduled = true;
}

// Add full-day events for holidays
for (const holiday of holidayEvents) {
  calendar.createEvent({
    start: new Date(`${format(holiday.start, 'yyyy-MM-dd')} 09:00`),
    end: new Date(`${format(holiday.start, 'yyyy-MM-dd')} 18:00`),
    summary: holidayTitle,
  });
}

calendar.saveSync(outputIcalFile);

console.log(`Calendar events updated and saved in ${outputIcalFile}`);
