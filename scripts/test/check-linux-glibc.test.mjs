import assert from 'node:assert/strict';
import { test } from 'node:test';
import { versionViolations } from '../check-linux-glibc.mjs';

const readelfNeeds = (names) =>
  [
    "Version needs section '.gnu.version_r' contains 2 entries:",
    ' Addr: 0x0000000000001234  Offset: 0x001234  Link: 7 (.dynstr)',
    '  000000: Version: 1  File: libc.so.6  Cnt: 3',
    ...names.map((name, i) => `  0x00${i}0:   Name: ${name}  Flags: none  Version: ${i + 2}`),
  ].join('\n');

test('accepts symbols available on glibc 2.28 with the GCC 8 libstdc++', () => {
  const text = readelfNeeds([
    'GLIBC_2.2.5',
    'GLIBC_2.28',
    'GLIBCXX_3.4.25',
    'CXXABI_1.3.11',
    'GCC_3.0',
  ]);
  assert.deepEqual(versionViolations(text), []);
});

test('reports symbols newer than Anolis/RHEL 8 provides', () => {
  const text = readelfNeeds([
    'GLIBC_2.2.5',
    'GLIBC_2.34',
    'GLIBC_2.42',
    'GLIBCXX_3.4.29',
    'CXXABI_1.3.13',
  ]);
  assert.deepEqual(versionViolations(text), [
    'GLIBC_2.34',
    'GLIBC_2.42',
    'GLIBCXX_3.4.29',
    'CXXABI_1.3.13',
  ]);
});

test('compares versions numerically, not as strings', () => {
  assert.deepEqual(versionViolations(readelfNeeds(['GLIBC_2.3', 'GLIBC_2.9', 'GLIBC_2.100'])), [
    'GLIBC_2.100',
  ]);
});

test('ignores version definitions a library exports itself', () => {
  const text = [
    "Version definition section '.gnu.version_d' contains 2 entries:",
    '  000000: Rev: 1  Flags: BASE  Index: 1  Cnt: 1  Name: libfoo.so',
    '  0x001c: Rev: 1  Flags: none  Index: 2  Cnt: 1  Name: GLIBCXX_3.4.30',
  ].join('\n');
  assert.deepEqual(versionViolations(text), []);
});
