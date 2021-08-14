import execa from 'execa';
// Can't use node: prefix yet
// PR: https://github.com/facebook/jest/pull/11331
// Issue: https://github.com/facebook/jest/issues/11339
// eslint-disable-next-line unicorn/prefer-node-protocol
import { readFileSync, rmSync } from 'fs';
// eslint-disable-next-line unicorn/prefer-node-protocol
import { dirname, relative } from 'path';
// eslint-disable-next-line unicorn/prefer-node-protocol
import { fileURLToPath } from 'url';

const testsDir = relative(
  process.cwd(),
  dirname(fileURLToPath(import.meta.url)),
);
const inputIcsFilePath = `${testsDir}/ical-move-events-input-calendar.ics`;
const outputIcsFilePath = inputIcsFilePath.replace('.ics', '-moved.ics');

test('moves calendar entries and saves file', () => {
  const { stdout } = execa.commandSync(
    `yarn start ${inputIcsFilePath} 2021-08-23`,
  );
  expect(stdout).toMatchSnapshot();

  const outputFileContents = readFileSync(outputIcsFilePath, 'utf-8')
    .replaceAll(/\nUID:[a-z0-9-]+/g, '')
    .replaceAll(/(\nDTSTAMP:\d+T17)\d{4}Z/g, '$1');
  expect(outputFileContents).toMatchSnapshot();
});

test('throws error if output file location already exists', () => {
  const { stderr } = execa.commandSync(
    `yarn start ${inputIcsFilePath} 2021-08-23`,
    { reject: false },
  );
  expect(stderr.replace(/node:\d+/, 'node:')).toMatchSnapshot();
  rmSync(outputIcsFilePath);
});
