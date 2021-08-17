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
const { startOfDay, differenceInDays, isWeekend, addDays, addMilliseconds } =
  dateFns;


const {
  _: [inputIcalFile],
  start: newStartDate,
  end: newEndDate,
} = mri(process.argv.slice(2)) as {
  _: string[];
  start?: string;
  end?: string;
};

if (!inputIcalFile || !newStartDate || !newEndDate) {
  console.error(`Error: Please specify an input file, start date and end date. Eg:
$ yarn start calendar.ics --start 2020-05-21 --end 2020-08-15`);
  process.exit(1);
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
    differenceInDays(
      startOfDayFromString(newEndDate),
      startOfDayFromString(newStartDate),
    ) + 1,
  ).keys(),
].map((daysToAdd) => {
  const date = addDays(startOfDayFromString(newStartDate), daysToAdd);
  const isFullyScheduled = isWeekend(date);
  return {
    date: date,
    isFullyScheduled: isFullyScheduled,
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
    const daysDifference = differenceInDays(
      nextAvailableDate.date,
      new Date(startDate),
    );

    const eventNewStart = addDays(event.start, daysDifference);
    const eventNewEnd = addDays(event.end, daysDifference);

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

calendar.saveSync(outputIcalFile);

console.log(`Calendar events updated and saved in ${outputIcalFile}`);
