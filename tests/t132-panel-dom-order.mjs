// t132 — wrapper mong: ten tep nay la ten trong contract cua card t132, con phep do that nam o
// tests/t132-panel-runtime.mjs (ten do captain dat trong mail m01773). Wrapper nay chi chuyen tiep argv
// va giu nguyen ma thoat, de lenh verify cua card chay duoc ma khong phai chep doi logic do.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(HERE, "t132-panel-runtime.mjs");
const args = process.argv.slice(2);

console.log("# t132-panel-dom-order: chuyen tiep sang tests/t132-panel-runtime.mjs " + args.join(" "));
const run = spawnSync(process.execPath, [TARGET].concat(args), { stdio: "inherit", cwd: path.dirname(HERE) });
if (run.error !== undefined) {
    console.error("t132-panel-dom-order: khong chay duoc " + TARGET + ": " + String(run.error));
    process.exit(2);
}
if (run.signal !== null && run.signal !== undefined) {
    console.error("t132-panel-dom-order: tien trinh con bi dung boi signal " + run.signal);
    process.exit(2);
}
process.exit(run.status === null ? 2 : run.status);
