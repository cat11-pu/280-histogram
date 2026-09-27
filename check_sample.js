import fs from "node:fs";
import { bucketOf, quantileBucket } from "./buckets.js";
import { step, close } from "./histrun.js";

// 验收断言：上面每条值收进 emit，最后与期望值逐项比对，不符就非零退出。
const __lines = [];
function emit(label, value) { __lines.push([String(label).replace(/ =$/, ""), value]); }


const spec = JSON.parse(fs.readFileSync(process.argv[2] || "sample/values.json", "utf8"));
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
const quantiles = spec.quantiles || [];
const buckets = Object.keys(closed.state.counts).sort(function (a, b) { return a - b; });

emit("收尾后各桶计数 =", JSON.stringify(buckets.map(function (key) {
  return [Number(key), closed.state.counts[key]];
})));
emit("收尾后总观测数 =", closed.state.total);
emit("分位桶定位 =", JSON.stringify(quantiles.map(function (percent) {
  const bucket = quantileBucket(closed.state.counts, closed.state.total, percent);
  return [percent, bucket, bucket * spec.bucket_width];
})));
emit("首轮入库个数 =", first.observed);
emit("二档入库个数 =", wide.observed);
emit("两个预算档入库不同 =", first.observed !== wide.observed);
emit("收尾前待入库账 =", first.ledger_before);
emit("压在账上的观测 =", JSON.stringify(first.ledger));
emit("收尾补齐个数 =", closed.catchup);
emit("收尾后待入库账 =", closed.state.ledger.length);
emit("拆两轮中间态不同 =", fingerprint(r2.state) !== fingerprint(first.state));
emit("拆两轮收尾态一致 =", fingerprint(closedTwo.state) === fingerprint(closed.state));
emit("重放入库 =", replay.observed);
emit("工作计数未超上界 =", first.judged <= first.judged_bound);
emit("与全量对照差异 =", fingerprint(closed.state) === fingerprint(fullClosed.state) ? 0 : 1);


// ---- 异常路径探针：真调用实现，看它报出什么码（不是从样例里抄）----
const __probeCalls = { value: 0, width: 0, event: 0 };
try {
  __probeCalls.value += 1;
  step(Object.assign({}, { budget: 3, bucket_width: 5, quantiles: [],
    state: { counts: {}, total: 0, ledger: [], applied: [] },
    events: [{ id: 1, kind: "observe", value: -1 }] }));
  emit("负值报码", "没有报错");
} catch (error) {
  emit("负值报码", error && error.code ? error.code : String(error.message));
}
try {
  __probeCalls.width += 1;
  step(Object.assign({}, { budget: 3, bucket_width: 0, quantiles: [],
    state: { counts: {}, total: 0, ledger: [], applied: [] },
    events: [{ id: 1, kind: "observe", value: 7 }] }));
  emit("桶宽不合法报码", "没有报错");
} catch (error) {
  emit("桶宽不合法报码", error && error.code ? error.code : String(error.message));
}
try {
  __probeCalls.event += 1;
  step(Object.assign({}, { budget: 3, bucket_width: 5, quantiles: [],
    state: { counts: {}, total: 0, ledger: [], applied: [] },
    events: [{ id: 1, kind: "peek", value: 7 }] }));
  emit("事件不合法报码", "没有报错");
} catch (error) {
  emit("事件不合法报码", error && error.code ? error.code : String(error.message));
}


// ---- 期望值（参考模型算出，与题面给的验收数值一致）----
const EXPECTED = {
  "收尾后各桶计数": [
    [
      0,
      2
    ],
    [
      1,
      2
    ],
    [
      2,
      1
    ],
    [
      4,
      1
    ]
  ],
  "收尾后总观测数": 6,
  "分位桶定位": [
    [
      50,
      1,
      5
    ],
    [
      90,
      4,
      20
    ]
  ],
  "首轮入库个数": 3,
  "二档入库个数": 5,
  "两个预算档入库不同": true,
  "收尾前待入库账": 3,
  "压在账上的观测": [
    22,
    1,
    9
  ],
  "收尾补齐个数": 3,
  "收尾后待入库账": 0,
  "拆两轮中间态不同": true,
  "拆两轮收尾态一致": true,
  "重放入库": 0,
  "工作计数未超上界": true,
  "与全量对照差异": 0,
  "负值报码": "E_BAD_VALUE",
  "桶宽不合法报码": "E_BAD_WIDTH",
  "事件不合法报码": "E_BAD_EVENT"
};
// 有的值在收进来之前已经 stringify 过，比较前先试着解析回来，避免类型错配把正确实现判成不过。
function __same(got, want) {
  if (typeof got === "string") {
    try { const parsed = JSON.parse(got); if (JSON.stringify(parsed) === JSON.stringify(want)) return true; } catch (error) { /* 不是 JSON 就按原文比 */ }
  }
  return JSON.stringify(got) === JSON.stringify(want);
}
let __bad = 0;
for (const [label, want] of Object.entries(EXPECTED)) {
  const found = __lines.find((pair) => pair[0] === label);
  if (!found) { __bad += 1; console.log("缺失验收项 " + label); continue; }
  const got = found[1];
  if (__same(got, want)) { console.log("一致 " + label + " = " + JSON.stringify(got)); }
  else { __bad += 1; console.log("不一致 " + label + " 期望 " + JSON.stringify(want) + " 实际 " + JSON.stringify(got)); }
}
// ---- 七条机检断言：不抄期望值，全部由真跑出的量直接判定 ----
function machine(name, ok) {
  if (ok) { console.log("机检一致 " + name); }
  else { __bad += 1; console.log("机检不一致 " + name); }
}
machine("两档入库个数不同", first.observed !== wide.observed);
machine("收尾前账大于零而收尾后归零", first.ledger_before > 0 && closed.state.ledger.length === 0);
machine("拆两轮中间态不同而收尾态一致",
  fingerprint(r2.state) !== fingerprint(first.state)
  && fingerprint(closedTwo.state) === fingerprint(closed.state));
machine("重放不再入库", replay.observed === 0);
machine("工作计数不超事件条数", first.judged <= events.length);
machine("与全量对照为零", fingerprint(closed.state) === fingerprint(fullClosed.state));
machine("异常探针真调", __probeCalls.value === 1 && __probeCalls.width === 1 && __probeCalls.event === 1);
console.log("验收项 " + (Object.keys(EXPECTED).length - __bad) + "/" + Object.keys(EXPECTED).length + " 通过");
process.exit(__bad === 0 ? 0 : 1);
