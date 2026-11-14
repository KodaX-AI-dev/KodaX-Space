// Test-only isolation for data-root-change.spec.ts, loaded into Main with `-r`. The data
// location can only be changed outside test mode, so that spec launches without
// KODAX_TEST_ONBOARDING; this preload keeps such a launch away from the developer's profile.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

// The Settings pointer lives in <appData>/KodaX Space; keep it and Chromium userData in the test.
const appData = process.env.SPACE_TEST_APP_DATA;
app.setPath('appData', appData);
app.setPath('userData', path.join(appData, 'KodaX Space'));

// The OS keyring is global, not scoped by data root: refuse to load it and record the attempt.
const dlopen = process.dlopen;
process.dlopen = function guardedDlopen(module, filename, ...rest) {
  if (/keyring/i.test(path.basename(String(filename)))) {
    fs.appendFileSync(process.env.SPACE_TEST_KEYRING_ATTEMPTS, `${process.pid} ${filename}\n`);
    throw new Error('The OS keyring is blocked in this test.');
  }
  return dlopen.call(this, module, filename, ...rest);
};
