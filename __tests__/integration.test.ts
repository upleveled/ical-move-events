import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execaCommandSync } from 'execa';
import { expect, test } from 'vitest';

const testsDir = relative(
  process.cwd(),
  dirname(fileURLToPath(import.meta.url)),
);
const inputIcsFilePath = `${testsDir}/ical-move-events-input-calendar.ics`;
const outputIcsFilePath = inputIcsFilePath.replace('.ics', '-moved.ics');
rmSync(outputIcsFilePath, { force: true });

function getNormalizedOutputFileContents() {
  return readFileSync(outputIcsFilePath, 'utf-8')
    .replaceAll(/\nUID:[a-z0-9-]+/g, '')
    .replaceAll(/(\nDTSTAMP:).+/g, '$1');
}

// Set timezone on GitHub Actions
if (process.platform === 'linux') {
  execaCommandSync('sudo timedatectl set-timezone Europe/Vienna');
}

test('moves calendar entries and saves file', () => {
  const { stdout } = execaCommandSync(
    `pnpm --silent dev ${inputIcsFilePath} --start 2021-08-23 --end 2021-09-03`,
  );
  expect(stdout).toMatchSnapshot();

  const outputFileContents = getNormalizedOutputFileContents();
  expect(outputFileContents).toMatchSnapshot();
  rmSync(outputIcsFilePath);
});

test('throws error if output file location already exists', () => {
  writeFileSync(outputIcsFilePath, '');
  const { stderr } = execaCommandSync(
    `pnpm --silent dev ${inputIcsFilePath} --start 2021-08-23 --end 2021-09-03`,
    { reject: false },
  );
  expect(stderr.replace(/node:\d+/, 'node:')).toMatchSnapshot();
  rmSync(outputIcsFilePath);
});

test('moves calendar entries and saves file, taking into account holiday and timezone change from Daylight Savings Time', () => {
  const { stdout } = execaCommandSync(
    `pnpm --silent dev ${inputIcsFilePath} --start 2021-11-01 --end 2021-11-12`,
  );
  expect(stdout).toMatchSnapshot();

  const outputFileContents = getNormalizedOutputFileContents();
  expect(outputFileContents).toMatchSnapshot();
  rmSync(outputIcsFilePath);
});
