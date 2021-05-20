import { existsSync } from 'node:fs';
import dateFns from 'date-fns';
import icalGenerator from 'ical-generator';
import icalParser from 'node-ical';
import rrule from 'rrule';

// Not using named imports due to the Node.js 14 ESM import problem
// https://github.com/date-fns/date-fns/issues/1781
// eslint-disable-next-line @typescript-eslint/naming-convention
const { RRule } = rrule;

const {
  startOfDay,
  min,
  differenceInHours,
  // format,
  addHours,
} = dateFns;

const [, , inputIcalFile, newStartDate, newStartDateOffset = '0'] =
  process.argv as (string | undefined)[];

if (!inputIcalFile || !newStartDate) {
  console.error(`Error: Please specify an input file and start date. Eg:
$ yarn start calendar.ics 2020-05-21`);
  process.exit(1);
}

const outputIcalFile = inputIcalFile.replace('.ics', '-moved.ics');

if (existsSync(outputIcalFile)) {
  console.error(`Error: Output file at ${outputIcalFile} already exists!`);
  process.exit(1);
}

const events = Object.values(await icalParser.parseFile(inputIcalFile)).filter(
  (event) => event.type === 'VEVENT',
) as Array<icalParser.VEvent>;

const startOfDayOfFirstEvent = min(
  events.map((event) => startOfDay(event.start)),
);

const startOfDayNewStartDate = addHours(
  startOfDay(new Date(`${newStartDate}T00:00:00.000Z`)),
  Number(newStartDateOffset),
);

const dateDifference = differenceInHours(
  startOfDayNewStartDate,
  startOfDayOfFirstEvent,
);

const calendar = icalGenerator();

events.forEach((event) => {
  const eventNewStartDate = addHours(event.start, dateDifference);
  const eventNewEndDate = addHours(event.end, dateDifference);

  calendar.createEvent({
    start: eventNewStartDate,
    ...(!event.rrule
      ? {}
      : {
          // Feature created with patch-package until the following RRULE PR is merged:
          // https://github.com/sebbo2002/ical-generator/pull/190
          repeating: new RRule({
            ...event.rrule.options,
            dtstart: eventNewStartDate,
          }).toString(),
        }),
    end: eventNewEndDate,
    summary: event.summary,
    description: event.description,
    location: event.location,
    url: event.url,
  });
});

calendar.saveSync(outputIcalFile);
