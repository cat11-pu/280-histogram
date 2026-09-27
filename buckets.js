// buckets.js：落桶与分位定位
export function bucketOf(value, width) {
  return Math.floor(value / width);
}

export function quantileBucket(counts, total, percent) {
  const target = Math.ceil((total * percent) / 100);
  const keys = Object.keys(counts).map(Number).sort(function (a, b) { return a - b; });
  let acc = 0;
  for (const key of keys) {
    acc += counts[key];
    if (acc >= target) return key;
  }
  return keys.length ? keys[keys.length - 1] : 0;
}
