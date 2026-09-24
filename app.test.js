import test from "node:test";
import assert from "node:assert/strict";
import { classify, fetchLatest, JMA_BASE_URL } from "./app.js";

test("classify applies exact rainfall thresholds", () => {
  assert.equal(classify(19.9).label, "平常");
  assert.equal(classify(20).label, "注意");
  assert.equal(classify(29.9).label, "注意");
  assert.equal(classify(30).label, "警戒");
});

test("fetchLatest returns station rainfall from JMA response", async () => {
  const fakeFetch = async (url, options) => {
    assert.equal(url, `${JMA_BASE_URL}/20260923155000.json`);
    assert.deepEqual(options, { cache: "no-store" });
    return { ok: true, json: async () => ({
    "46166": { precipitation1h: [12.5, 0] },
    "50066": { precipitation1h: [20, 0] },
    "50281": { precipitation1h: [null, 1] },
    }) };
  };
  const result = await fetchLatest(fakeFetch, new Date("2026-09-23T06:57:00Z"));
  assert.equal(result.timestamp, "20260923155000");
  assert.deepEqual(result.observations.map(({ rainfall }) => rainfall), [12.5, 20, null]);
});

test("fetchLatest falls back when a recent slot fails to load", async () => {
  const requested = [];
  const fakeFetch = async (url) => {
    requested.push(url);
    if (requested.length === 1) throw new TypeError("temporary network error");
    if (requested.length === 2) return { ok: false, status: 404 };
    return { ok: true, json: async () => ({ "46166": { precipitation1h: [30, 0] } }) };
  };

  const result = await fetchLatest(fakeFetch, new Date("2026-09-23T06:57:00Z"));
  assert.equal(result.timestamp, "20260923153000");
  assert.equal(result.observations[0].rainfall, 30);
  assert.equal(requested.length, 3);
});

test("fetchLatest reports failure after checking all six slots", async () => {
  let attempts = 0;
  const fakeFetch = async () => { attempts += 1; return { ok: false, status: 404 }; };
  await assert.rejects(() => fetchLatest(fakeFetch, new Date("2026-09-23T06:57:00Z")), /最新の観測データ/);
  assert.equal(attempts, 6);
});
