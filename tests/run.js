import assert from "node:assert";
import { bucketOf, quantileBucket } from "../buckets.js";
import { step, close } from "../histrun.js";
import { render } from "../app.js";

const base = {
  budget: 3, bucket_width: 5, quantiles: [50],
  state: { counts: {}, total: 0, ledger: [], applied: [] },
  events: [],
  value_error_code: "E_BAD_VALUE", event_error_code: "E_BAD_EVENT"
};

let failed = 0;
function check(name, fn) {
  try { fn(); console.log("ok " + name); } catch (e) { failed += 1; console.log("FAIL " + name + " :: " + e.message); }
}

check("bucketOf returns a number", () => {
  assert.strictEqual(typeof bucketOf(7, 5), "number");
});

check("quantileBucket returns a number", () => {
  assert.strictEqual(typeof quantileBucket({ 0: 1 }, 1, 50), "number");
});

check("step returns a state", () => {
  assert.strictEqual(typeof step(base).state, "object");
});

check("close returns a state", () => {
  assert.strictEqual(typeof close(base).state, "object");
});

check("render counts events", () => {
  assert.strictEqual(typeof render(base).count, "number");
});

console.log("5 cases, " + failed + " failed");
process.exit(failed === 0 ? 0 : 1);
