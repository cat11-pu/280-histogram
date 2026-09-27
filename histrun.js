// histrun.js：按入库预算入桶并留账
import { bucketOf } from "./buckets.js";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function copyState(state) {
  const source = state || {};
  const counts = {};
  for (const key of Object.keys(source.counts || {})) counts[key] = source.counts[key];
  return {
    counts: counts,
    total: source.total || 0,
    ledger: (source.ledger || []).slice(),
    applied: (source.applied || []).slice()
  };
}

function insert(state, value, width) {
  const bucket = bucketOf(value, width);
  state.counts[bucket] = (state.counts[bucket] || 0) + 1;
  state.total += 1;
}

function checkWidth(spec) {
  const width = spec.bucket_width;
  if (!Number.isInteger(width) || width <= 0) {
    fail(spec.width_error_code || "E_BAD_WIDTH", "桶宽不是正整数");
  }
  return width;
}

export function step(spec) {
  const width = checkWidth(spec);
  const valueCode = spec.value_error_code || "E_BAD_VALUE";
  const eventCode = spec.event_error_code || "E_BAD_EVENT";
  const events = spec.events || [];
  const state = copyState(spec.state);
  let remaining = Number.isFinite(spec.budget) && spec.budget > 0 ? Math.floor(spec.budget) : 0;
  let observed = 0;
  while (state.ledger.length > 0 && remaining > 0) {
    insert(state, state.ledger.shift(), width);
    remaining -= 1;
    observed += 1;
  }
  let judged = 0;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event || event.kind !== "observe") fail(eventCode, "事件不合法");
    const id = event.id !== undefined ? event.id : index;
    if (state.applied.indexOf(id) !== -1) continue;
    const value = event.value;
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      fail(valueCode, "观测值为负或不是数");
    }
    judged += 1;
    state.applied.push(id);
    if (remaining > 0) {
      insert(state, value, width);
      remaining -= 1;
      observed += 1;
    } else {
      state.ledger.push(value);
    }
  }
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
  const width = checkWidth(spec);
  const state = copyState(spec.state);
  let catchup = 0;
  while (state.ledger.length > 0) {
    insert(state, state.ledger.shift(), width);
    catchup += 1;
  }
  return { state: state, catchup: catchup };
}
