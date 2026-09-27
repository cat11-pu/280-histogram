// histrun.js：按入库预算入桶并留账，收尾把账补齐
import { bucketOf } from "./buckets.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function validWidth(width) {
  return Number.isInteger(width) && width > 0;
}

function freshState(state) {
  const source = state || {};
  return {
    counts: Object.assign({}, source.counts || {}),
    total: source.total || 0,
    ledger: (source.ledger || []).slice(),
    applied: (source.applied || []).slice()
  };
}

export function step(spec) {
  if (!validWidth(spec.bucket_width)) {
    fail("E_BAD_WIDTH", "bucket_width must be a positive integer");
  }
  const state = freshState(spec.state);
  const events = spec.events || [];
  const applied = new Set(state.applied);
  let remaining = Number.isFinite(spec.budget) ? spec.budget : 0;
  let observed = 0;
  let judged = 0;

  for (const event of events) {
    if (!event || typeof event !== "object" || event.kind !== "observe"
        || typeof event.value !== "number" || !Number.isFinite(event.value)) {
      fail("E_BAD_EVENT", "event must be an observe with a numeric value");
    }
    if (applied.has(event.id)) continue;
    judged += 1;
    if (event.value < 0) {
      fail("E_BAD_VALUE", "observation value must be non-negative");
    }
    if (remaining > 0) {
      const bucket = bucketOf(event.value, spec.bucket_width);
      state.counts[bucket] = (state.counts[bucket] || 0) + 1;
      state.total += 1;
      observed += 1;
      remaining -= 1;
    } else {
      state.ledger.push(event.value);
    }
    applied.add(event.id);
  }

  state.applied = Array.from(applied);
  return {
    state: state,
    observed: observed,
    ledger_before: state.ledger.length,
    ledger: state.ledger.slice(),
    judged: judged,
    judged_bound: events.length
  };
}

export function close(spec) {
  if (!validWidth(spec.bucket_width)) {
    fail("E_BAD_WIDTH", "bucket_width must be a positive integer");
  }
  const state = freshState(spec.state);
  let catchup = 0;

  for (const value of state.ledger) {
    const bucket = bucketOf(value, spec.bucket_width);
    state.counts[bucket] = (state.counts[bucket] || 0) + 1;
    state.total += 1;
    catchup += 1;
  }
  state.ledger = [];

  return { state: state, catchup: catchup };
}
