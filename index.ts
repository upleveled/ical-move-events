import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  addDays,
  addMinutes,
  differenceInDays,
  differenceInHours,
  differenceInMinutes,
  differenceInWeeks,
  format,
  isSameDay,
  isWeekend,
  startOfDay,
} from 'date-fns';
import icalGenerator from 'ical-generator';
import icalParser, { DateWithTimeZone } from 'node-ical';
import { remark } from 'remark';
import extractFrontmatter from 'remark-extract-frontmatter';
import remarkFrontmatter from 'remark-frontmatter';
import rrule from 'rrule';
import yaml from 'yaml';

// eslint-disable-next-line @typescript-eslint/naming-convention -- This fails with the Vitest tests rrule is still not pure ESM
const { rrulestr } = rrule;

const {
  values: {
    start,
    end,
    'filler-title': fillerTitle = 'Project Time',
    'holidays-ical':
      holidaysIcalUrl = 'https://www.officeholidays.com/ics-clean/austria',
    'holiday-title': holidayTitle = '🎉 Holiday',
  },
  positionals: [inputIcalFile],
} = parseArgs({
  options: {
    start: { type: 'string' },
    end: { type: 'string' },
    'filler-title': { type: 'string' },
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

const outputIcalFile = inputIcalFile.replace('.ics', '-moved.ics');

if (existsSync(outputIcalFile)) {
  console.error(`Error: Output file at ${outputIcalFile} already exists!`);
  process.exit(1);
}

const parsedCalendar = icalParser.parseFile(inputIcalFile);
const timezone = (
  Object.values(parsedCalendar).filter(
    (calendarComponent) => calendarComponent.type === 'VTIMEZONE',
  )[0] as icalParser.VTimeZone
).tzid;

const sortedNonHolidayEvents = (
  Object.values(parsedCalendar).filter((event) => {
    return (
      event.type === 'VEVENT' &&
      ![holidayTitle, fillerTitle].includes(event.summary)
    );
  }) as icalParser.VEvent[]
)
  .flatMap(
    // Convert recurring events to individual events
    //
    // Intentionally does not respect the EXDATE entries, because
    // they often correspond to holidays, which will be different
    // based on the new date range
    //
    // If EXDATEs should be generated for the new holidays in the
    // range, these dates could be possibly generated from
    // the data in the `holidayEvents` array
    (event) => {
      if (!event.rrule) return event;

      const rruleSet = rrulestr(event.rrule.toString(), {
        dtstart: event.start,
        tzid: timezone,
      });

      delete event.rrule;

      const allRecurringEvents = rruleSet.all();
      const startTimeZoneOffset = allRecurringEvents[0]!.getTimezoneOffset();

      return allRecurringEvents.map((date) => {
        // Fix time zone offset for recurring events in
        // a series that spans over the switch to daylight
        // savings time / summer time
        const startDate = new Date(
          date.getTime() -
            Math.abs(startTimeZoneOffset - date.getTimezoneOffset()) *
              60 *
              1000,
        ) as unknown as DateWithTimeZone;
        startDate.tz = timezone;

        const endDate = addMinutes(
          startDate,
          differenceInMinutes(event.end, event.start),
        ) as unknown as DateWithTimeZone;
        endDate.tz = timezone;

        return {
          ...event,
          start: startDate,
          end: endDate,
        };
      });
    },
  )
  .sort((a, b) => {
    const aIsMultiDay = differenceInDays(a.end, a.start) > 0;
    const bIsMultiDay = differenceInDays(b.end, b.start) > 0;

    // Sort multi-day events to be the last events before the next day
    if (aIsMultiDay && !bIsMultiDay) {
      return 1;
    } else if (!aIsMultiDay && bIsMultiDay) {
      return -1;
    }

    // Sort by start date
    return a.start.getTime() - b.start.getTime();
  });

type EventsByStartDate = {
  [startDateIsoString: string]: {
    event: icalParser.VEvent;
    constraints:
      | null
      | ({
          optional?: true;
        } & (
          | Record<string, never>
          | {
              relativeStartDate: {
                event: [string, 'start' | 'end'];
                offset?: number;
              };
            }
          | {
              startDate: {
                day: number;
                week: number;
              };
            }
        ));
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
    constraints:
      !event.description || !event.description.includes('---')
        ? null
        : ((
            await remark()
              .use(remarkFrontmatter)
              .use(extractFrontmatter, { yaml: yaml.parse })
              .process(event.description)
          ).data as EventsByStartDate[string][number]['constraints']),
  });
}

function startOfDayFromString(/** Eg. 2020-12-30 */ dateString: string) {
  return startOfDay(new Date(dateString));
}

const allScheduleSlots =
  '0900,0930,1000,1030,1100,1130,1200,1230,1300,1330,1400,1430,1500,1530,1600,1630,1700,1730';

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
  return {
    date: date,
    isWeekendOrHoliday:
      isWeekend(date) ||
      holidayEvents.some(
        (holiday) => holiday.start.getTime() === date.getTime(),
      ),
    scheduleSlots: allScheduleSlots,
    week: differenceInWeeks(date, startOfDayFromString(start)) + 1,
  };
});

/**
 * Get an array of keys in unscheduledScheduleSlots that
 * correspond to the required schedule slots for the event
 *
 * Eg.
 *
 * ```js
 * getScheduleSlots({
 *   start: new Date('2021-08-05T09:30:00.000Z'),
 *   end: new Date('2021-08-05T10:30:00.000Z'),
 * });
 * // => '0930,1000'
 * ```
 */
function getScheduleSlots(event: icalParser.VEvent) {
  return allScheduleSlots
    .split(',')
    .filter((slot) => {
      return (
        slot >= format(event.start, 'HHmm') &&
        slot <= format(addMinutes(event.end, -30), 'HHmm')
      );
    })
    .join(',');
}

const calendar = icalGenerator();

for (const [startDate, events] of Object.entries(eventsByStartDates)) {
  for (const { event, constraints: eventConstraints } of events) {
    const eventScheduleSlots = getScheduleSlots(event);

    /**
     * The amount of days in parentheses in the event title, which
     * indicates the amount of non-weekend, non-holiday days
     * that this multi-day event requires
     */
    const businessDaysDuration =
      Number(event.summary.match(/ \((\d+) days?\)/)?.[1]) ||
      // If there is no amount of days in the event
      // title, default to 1
      1;

    const eventConstraintStartDate =
      eventConstraints && 'relativeStartDate' in eventConstraints
        ? addDays(
            calendar
              .events()
              .find((icalEvent) => {
                return icalEvent
                  .summary()
                  .includes(`(${eventConstraints.relativeStartDate.event[0]})`);
              })!
              [eventConstraints.relativeStartDate.event[1]]() as Date,
            (eventConstraints.relativeStartDate.offset || 0) +
              // If the event start should be relative to the end
              // of another event, subtract 1 for full-day events
              // ending at midnight (which is the start of the next day)
              (eventConstraints.relativeStartDate.event[1] === 'end' ? -1 : 0),
          )
        : eventConstraints && 'startDate' in eventConstraints
        ? availableDates
            .filter(
              (date) =>
                !date.isWeekendOrHoliday &&
                date.week === eventConstraints.startDate.week,
            )
            .at(
              eventConstraints.startDate.day > 0
                ? // eventConstraints.startDate.day is 1-indexed for positive numbers
                  eventConstraints.startDate.day - 1
                : eventConstraints.startDate.day,
            )?.date
        : null;

    const firstAvailableDate = availableDates.find((date) => {
      const dateIncludesEventScheduleSlots =
        date.scheduleSlots.includes(eventScheduleSlots);

      if (eventConstraintStartDate) {
        return (
          (isSameDay(date.date, eventConstraintStartDate) ||
            date.date > eventConstraintStartDate) &&
          !date.isWeekendOrHoliday &&
          // All-day events are excluded from schedule slots checks
          (differenceInHours(event.end, event.start) >= 24 ||
            dateIncludesEventScheduleSlots)
        );
      }

      return !date.isWeekendOrHoliday && dateIncludesEventScheduleSlots;
    });

    if (!firstAvailableDate) {
      console.error(
        `Warning: Dropping event on original start date ${startDate} (no available dates in time range): ${event.summary}}`,
      );
      continue;
    }

    const daysDifferenceStart = differenceInDays(
      firstAvailableDate.date,
      new Date(startDate),
    );

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
      let weekendOrHolidaydDaysDuringRange = 0;
      let eventDurationSpansCorrectBusinessDays = false;

      do {
        eventNewEnd = addDays(
          eventNewStart,
          businessDaysDuration + weekendOrHolidaydDaysDuringRange,
        );

        // Find the number of weekend and holiday days during the range,
        // so the end date can be adjusted if necessary
        const recalculatedWeekendOrHolidayDaysDuringRange =
          availableDates.filter(
            // ESLint rule disabled because it is a false positive for this function
            // https://github.com/eslint/eslint/issues/5044
            // eslint-disable-next-line no-loop-func
            ({ isWeekendOrHoliday, date }) => {
              return (
                eventNewStart.getTime() <= date.getTime() &&
                eventNewEnd.getTime() > date.getTime() &&
                isWeekendOrHoliday
              );
            },
          ).length;

        // If there are more weekend or holiday days in the range than the last
        // time it was calculated, add the amount to the duration of the event
        if (
          recalculatedWeekendOrHolidayDaysDuringRange >
          weekendOrHolidaydDaysDuringRange
        ) {
          weekendOrHolidaydDaysDuringRange =
            recalculatedWeekendOrHolidayDaysDuringRange;
        } else {
          eventDurationSpansCorrectBusinessDays = true;
        }
      } while (!eventDurationSpansCorrectBusinessDays);
    }

    calendar.createEvent({
      ...(timezone ? { timezone: timezone } : {}),
      start: eventNewStart,
      end: eventNewEnd,
      summary: event.summary,
      description: event.description,
      location: event.location,
      url: event.url,
    });

    if (businessDaysDuration === 1 && !eventConstraints?.optional) {
      // This intentionally leaves double commas (the trailing comma
      // after the event schedule slots is not removed) in the string
      // to allow for easier splitting later for the filler events
      firstAvailableDate.scheduleSlots =
        firstAvailableDate.scheduleSlots.replace(eventScheduleSlots, '');
    }
  }
}

// Add full-day events for holidays
for (const holiday of holidayEvents) {
  calendar.createEvent({
    start: new Date(`${format(holiday.start, 'yyyy-MM-dd')} 09:00`),
    end: new Date(`${format(holiday.start, 'yyyy-MM-dd')} 18:00`),
    summary: holidayTitle,
  });
}

for (const availableDate of availableDates) {
  if (availableDate.isWeekendOrHoliday) continue;

  availableDate.scheduleSlots = availableDate.scheduleSlots
    // Ensure string has maximum 2 commas for string splitting
    .replace(/\b(,,),+/g, '$1')
    // Remove leading and trailing commas
    .replace(/^,*([^,].+[^,]),*$/, '$1');

  if (
    !availableDate.scheduleSlots ||
    /^,+$/.test(availableDate.scheduleSlots)
  ) {
    continue;
  }

  for (const slot of availableDate.scheduleSlots.split(',,')) {
    const [fillerStart, ...rest] = slot
      // Remove leading and trailing commas
      .replace(/^,*([^,].+[^,]),*$/, '$1')
      .split(',');

    const fillerEnd = rest.at(-1) || fillerStart;
    calendar.createEvent({
      start: new Date(
        `${format(availableDate.date, 'yyyy-MM-dd')} ${fillerStart!.replace(
          /^(\d{2})/,
          '$1:',
        )}`,
      ),
      end: addMinutes(
        new Date(
          `${format(availableDate.date, 'yyyy-MM-dd')} ${fillerEnd!.replace(
            /^(\d{2})/,
            '$1:',
          )}`,
        ),
        30,
      ),
      summary: fillerTitle,
    });
  }
}

calendar.saveSync(outputIcalFile);

console.log(`Calendar events updated and saved in ${outputIcalFile}`);
