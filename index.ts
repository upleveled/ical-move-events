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
    holidaysIcalUrl = 'https://calendar.google.com/calendar/ical/en.austrian.official%23holiday%40group.v.calendar.google.com/public/basic.ics?max-results=100',
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
$ yarn start calendar.ics --start 2020-05-21 --end 2020-08-15`);
  process.exit(1);
}

const startOfDayStart = startOfDay(new Date(start));
const startOfDayEnd = startOfDay(new Date(end));

const holidayEvents = !holidaysIcalUrl
  ? []
  : (
      Object.values(await icalParser.fromURL(holidaysIcalUrl)).filter(
        (event) =>
          event.type === 'VEVENT' &&
          startOfDayStart.getTime() <= event.start.getTime() &&
          startOfDayEnd.getTime() >= event.start.getTime(),
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

function startOfDayFromString(dateString: string) {
  return startOfDay(new Date(`${dateString}T00:00:00.000Z`));
}

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

    const businessDaysDuration =
      Number(event.summary.match(/ \((\d+) days?\)/)?.[1]) || 1;

    const eventNewStart = addDays(event.start, daysDifferenceStart);

    let eventNewEnd: Date;
    if (businessDaysDuration === 1) {
      eventNewEnd = addDays(event.end, daysDifferenceStart);
    } else {
      // Calculate the earliest possible new start
      // date based on the new event start date
      //
      // This means that this only supports full-day
      // multi-day events (because the time from the
      // end date will be discarded)
      eventNewEnd = addDays(eventNewStart, businessDaysDuration);

      // Find the number of weekend and holiday days
      // during the range, so the end date can be
      // adjusted if necessary
      const fullyScheduledDaysDuringRange = availableDates.filter(
        ({ isFullyScheduled, date }) => {
          return (
            eventNewStart.getTime() <= date.getTime() &&
            eventNewEnd.getTime() >= date.getTime() &&
            isFullyScheduled
          );
        },
      ).length;

      // If there are a non-zero amount of weekend
      // or holiday days in the range, add the
      // amount to the duration of the event
      if (fullyScheduledDaysDuringRange !== 0) {
        eventNewEnd = addDays(eventNewEnd, fullyScheduledDaysDuringRange);
      }
    }

    calendar.createEvent({
      start: eventNewStart,
      ...(!event.rrule
        ? {}
        : {
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

holidayEvents.forEach((holiday) => {
  calendar.createEvent({
    start: new Date(`${format(holiday.start, 'yyyy-MM-dd')} 09:00`),
    end: new Date(`${format(holiday.start, 'yyyy-MM-dd')} 18:00`),
    summary: holidayTitle,
  });
});

calendar.saveSync(outputIcalFile);

console.log(`Calendar events updated and saved in ${outputIcalFile}`);
