import { existsSync } from 'node:fs';
import dateFns from 'date-fns';
import icalGenerator from 'ical-generator';
import mri from 'mri';
import icalParser from 'node-ical';
import rrule from 'rrule';

// eslint-disable-next-line @typescript-eslint/naming-convention
const { RRule } = rrule;

// Not using named imports due to the Node.js ESM import problem
// https://github.com/date-fns/date-fns/issues/1781
const { addDays, differenceInDays, format, isWeekend, startOfDay } = dateFns;

const {
  _: [inputIcalFile],
  start,
  end,
  'holidays-ical':
    holidaysIcalUrl = 'https://www.officeholidays.com/ics-clean/austria',
  'holiday-title': holidayTitle = '🎉 Holiday',
} = mri(process.argv.slice(2)) as {
  _: string[];
  start?: string;
  end?: string;
  'holidays-ical'?: string;
  'holiday-title'?: string;
};

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
const eventsByStartDates = (
  Object.values(await icalParser.parseFile(inputIcalFile)).filter(
    (event) => event.type === 'VEVENT',
  ) as icalParser.VEvent[]
)
  .filter((event) => {
    return event.summary !== holidayTitle;
  })
  .sort((a, b) => {
    return a.start.getTime() - b.start.getTime();
  })
  .reduce((eventsByDay, event) => {
    const eventStartOfDay = startOfDay(event.start);
    eventsByDay[eventStartOfDay.toISOString()] ??= [];
    eventsByDay[eventStartOfDay.toISOString()].push(event);
    return eventsByDay;
  }, {} as Record<string, icalParser.VEvent[]>);

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

Object.entries(eventsByStartDates).forEach(([startDate, events]) => {
  const nextAvailableDate = availableDates.find(
    ({ isFullyScheduled }) => !isFullyScheduled,
  );

  if (!nextAvailableDate) {
    throw new Error('No next available date!');
  }

  events.forEach((event) => {
    const daysDifferenceStart = differenceInDays(
      nextAvailableDate.date,
      new Date(startDate),
    );

    // The amount of days in parentheses in the event title, which
    // indicates the amount of non-weekend, non-holiday days
    // that this multi-day event requires
    const businessDaysDuration =
      Number(event.summary.match(/ \((\d+) days?\)/)?.[1]) || 1;

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
      eventNewEnd = addDays(eventNewStart, businessDaysDuration);

      // Find the number of weekend and holiday days during the range,
      // so the end date can be adjusted if necessary
      const fullyScheduledDaysDuringRange = availableDates.filter(
        ({ isFullyScheduled, date }) => {
          return (
            eventNewStart.getTime() <= date.getTime() &&
            eventNewEnd.getTime() > date.getTime() &&
            isFullyScheduled
          );
        },
      ).length;

      // If there are a non-zero amount of weekend or holiday days in the
      // range, add the amount to the duration of the event
      if (fullyScheduledDaysDuringRange !== 0) {
        eventNewEnd = addDays(eventNewEnd, fullyScheduledDaysDuringRange);
      }
    }

    calendar.createEvent({
      start: eventNewStart,
      ...(!event.rrule
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
              dtstart: eventNewStart,
            }).toString(),
          }),
      end: eventNewEnd,
      summary: event.summary,
      description: event.description,
      location: event.location,
      url: event.url,
    });
  });

  nextAvailableDate.isFullyScheduled = true;
});

// Add full-day events for holidays
holidayEvents.forEach((holiday) => {
  calendar.createEvent({
    start: new Date(`${format(holiday.start, 'yyyy-MM-dd')} 09:00`),
    end: new Date(`${format(holiday.start, 'yyyy-MM-dd')} 18:00`),
    summary: holidayTitle,
  });
});

calendar.saveSync(outputIcalFile);

console.log(`Calendar events updated and saved in ${outputIcalFile}`);
