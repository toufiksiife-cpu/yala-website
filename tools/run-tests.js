// Run every test: node tools/run-tests.js
// No dependencies. Each file posts its own pass/fail lines and exit code.
const { spawnSync } = require("child_process");
const path = require("path");

const files = [2, 5, 6, 7, 8, 9, 10].map(n => path.join(__dirname, "tests", "test_phase" + n + ".js"));
let failed = 0;
for (const file of files) {
  const r = spawnSync(process.execPath, [file], { stdio: "inherit" });
  if (r.status !== 0) failed++;
}
if (failed) {
  console.log(failed + " test file(s) failed");
  process.exit(1);
}
console.log("All test files passed.");
