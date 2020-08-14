import { existsSync } from 'fs';
import icalParser from 'node-ical';
import icalGenerator from 'ical-generator';

// Because of the Node.js 14 ESM import problem
// https://github.com/date-fns/date-fns/issues/1781
import dateFns from 'date-fns';
const { startOfDay, min, differenceInDays, add } = dateFns;

const calendar = icalGenerator();

function exitWithError(message: string) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const [, , inputIcalFile, newStartDate] = process.argv;

if (inputIcalFile === undefined || newStartDate === undefined) {
  exitWithError(`Please specify an input file and start date. Eg:
$ yarn start calendar.ics 2020-05-04`);
}

const outputIcalFile = inputIcalFile.replace('.ics', '-moved.ics');

if (existsSync(outputIcalFile)) {
  exitWithError(`Output file at ${outputIcalFile} already exists!`);
}

const events = Object.values(await icalParser.parseFile(inputIcalFile)).filter(
  (event) => event.type === 'VEVENT',
) as Array<icalParser.VEvent>;

const startOfDayOfFirstEvent = min(
  events.map((event) => startOfDay(event.start)),
);

const startOfDayNewStartDate = startOfDay(
  new Date(`${newStartDate}T00:00:00.000Z`),
);

const dateDifference = differenceInDays(
  startOfDayNewStartDate,
  startOfDayOfFirstEvent,
);

events.forEach((event) => {
  calendar.createEvent({
    start: add(event.start, { days: dateDifference }),
    end: add(event.end, { days: dateDifference }),
    summary: event.summary,
    description: event.description,
    location: event.location,
    url: event.url,
  });
});

calendar.saveSync(outputIcalFile);
