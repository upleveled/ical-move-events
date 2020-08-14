import { existsSync, writeFileSync } from 'fs';
import icalParser from 'node-ical';
import fastCsvFormat from '@fast-csv/format';

// Because of the Node.js 14 ESM import problem
// https://github.com/date-fns/date-fns/issues/1781
import dateFns from 'date-fns';
const { startOfDay, min, differenceInDays, add, format } = dateFns;

function exitWithError(message: string) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const [, , inputIcalFile, newStartDate] = process.argv;

if (inputIcalFile === undefined || newStartDate === undefined) {
  exitWithError(`Please specify an input file and start date. Eg:
$ yarn start calendar.ics 2020-05-04`);
}

const outputCsvFile = inputIcalFile.replace('.ics', '.csv');

if (existsSync(outputCsvFile)) {
  exitWithError(`Output file at ${outputCsvFile} already exists!`);
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

const rows = [
  [
    'Subject',
    'Start Date',
    'Start Time',
    'End Date',
    'End Time',
    'All Day Event',
    'Description',
    'Location',
  ],
];

events.forEach((event) => {
  const newEventStart = add(event.start, { days: dateDifference });
  const newEventEnd = add(event.end, { days: dateDifference });
  rows.push([
    event.summary,
    format(newEventStart, 'dd/MM/yyyy'),
    format(newEventStart, 'p'),
    format(newEventEnd, 'dd/MM/yyyy'),
    format(newEventEnd, 'p'),
    event.datetype === 'date' ? 'TRUE' : 'FALSE',
    event.description,
    event.location,
  ]);
});

const csvContent = await fastCsvFormat.writeToString(rows);
writeFileSync(outputCsvFile, csvContent);
