import fastCsvFormat from '@fast-csv/format';
import dateFns from 'date-fns';
import { existsSync, writeFileSync } from 'fs';
import icalParser from 'node-ical';

// Not using named imports due to the Node.js 14 ESM import problem
// https://github.com/date-fns/date-fns/issues/1781
const { startOfDay, min, differenceInHours, format, addHours } = dateFns;

function exitWithError(message: string) {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const [
  ,
  ,
  inputIcalFile,
  newStartDate,
  newStartDateOffset = '0',
] = process.argv;

if (inputIcalFile === undefined || newStartDate === undefined) {
  exitWithError(`Please specify an input file and start date. Eg:
$ yarn start calendar.ics 2020-05-21`);
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

const startOfDayNewStartDate = addHours(
  startOfDay(new Date(`${newStartDate}T00:00:00.000Z`)),
  Number(newStartDateOffset),
);

const dateDifference = differenceInHours(
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
  const newEventStart = addHours(event.start, dateDifference);
  const newEventEnd = addHours(event.end, dateDifference);
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
