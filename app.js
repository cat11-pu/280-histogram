// app.js：渲染结果
import { bucketOf, quantileBucket } from "./buckets.js";
import { step, close } from "./histrun.js";

export function render(spec) {
  const events = spec.events || [];
  const half = Math.ceil(events.length / 2);
  const first = step(spec);
  const closed = close(Object.assign({}, spec, { state: first.state }));
  const r1 = step(Object.assign({}, spec, { events: events.slice(0, half) }));
  const r2 = step(Object.assign({}, spec, { state: r1.state, events: events.slice(half) }));
  const closedTwo = close(Object.assign({}, spec, { state: r2.state }));
  const replay = step(Object.assign({}, spec, { state: closed.state }));
  const wide = step(Object.assign({}, spec, { budget: spec.budget + 2 }));
  const full = step(Object.assign({}, spec, { events: events, budget: events.length + 2 }));
  const fullClosed = close(Object.assign({}, spec, { state: full.state }));
  const fingerprint = function (state) {
    return JSON.stringify({
      counts: state.counts, total: state.total, ledger: state.ledger,
      applied: state.applied.length
    });
  };
  const width = spec.bucket_width;
  const quantiles = spec.quantiles || [];
  const buckets = Object.keys(closed.state.counts).sort(function (a, b) { return a - b; });
  return { buckets: buckets.map(function (key) {
             return [Number(key), Number(key) * width, closed.state.counts[key]];
           }),
           total: closed.state.total,
           quantiles: quantiles.map(function (percent) {
             const bucket = quantileBucket(closed.state.counts, closed.state.total, percent);
             return [percent, bucket, bucket * width];
           }),
           observed_first: first.observed, observed_wide: wide.observed,
           pair_differs: first.observed !== wide.observed,
           ledger_before: first.ledger_before, ledger: first.ledger,
           catchup: closed.catchup, ledger_after: closed.state.ledger.length,
           mid_differs: fingerprint(r2.state) !== fingerprint(first.state),
           closed_equal: fingerprint(closedTwo.state) === fingerprint(closed.state),
           replay_new: replay.observed, judged: first.judged, judged_bound: first.judged_bound,
           full_diff: fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1,
           count: events.length,
           tail: bucketOf(7, 5) + quantileBucket({ 0: 1 }, 1, 50) };
}
