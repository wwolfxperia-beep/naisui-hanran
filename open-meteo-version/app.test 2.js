import test from "node:test";
import assert from "node:assert/strict";
import { classify, fetchLatest, OPEN_METEO_BASE_URL, STATIONS } from "./app.js";

test("classify applies exact rainfall thresholds", () => {
  assert.equal(classify(19.9).label, "平常");
  assert.equal(classify(20).label, "注意");
  assert.equal(classify(29.9).label, "注意");
  assert.equal(classify(30).label, "警戒");
});

test("fetchLatest returns station rainfall from Open-Meteo response", async () => {
  const fakeFetch = async (url, options) => {
    assert.ok(url.startsWith(OPEN_METEO_BASE_URL));
    const params = new URL(url).searchParams;
    assert.equal(params.get("latitude"), STATIONS.map((s) => s.lat).join(","));
    assert.equal(params.get("longitude"), STATIONS.map((s) => s.lon).join(","));
    assert.equal(params.get("current"), "precipitation");
    assert.deepEqual(options, { cache: "no-store" });
    return {
      ok: true,
      json: async () => [
        { current: { time: "2026-09-26T13:45", precipitation: 12.5 } },
        { current: { time: "2026-09-26T13:45", precipitation: 20 } },
        { current: { time: "2026-09-26T13:45", precipitation: null } },
      ],
    };
  };
  const result = await fetchLatest(fakeFetch);
  assert.equal(result.timestamp, "2026-09-26T13:45");
  assert.deepEqual(result.observations.map(({ rainfall }) => rainfall), [12.5, 20, null]);
});

test("fetchLatest throws when the HTTP response is not ok", async () => {
  const fakeFetch = async () => ({ ok: false, status: 503 });
  await assert.rejects(() => fetchLatest(fakeFetch), /応答がありません/);
});

test("fetchLatest throws when Open-Meteo reports an error", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => ({ error: true, reason: "Invalid latitude" }),
  });
  await assert.rejects(() => fetchLatest(fakeFetch), /Invalid latitude/);
});

test("fetchLatest throws when every station is missing a value", async () => {
  const fakeFetch = async () => ({
    ok: true,
    json: async () => [
      { current: { time: "2026-09-26T13:45", precipitation: null } },
      { current: { time: "2026-09-26T13:45", precipitation: null } },
      { current: { time: "2026-09-26T13:45", precipitation: null } },
    ],
  });
  await assert.rejects(() => fetchLatest(fakeFetch), /欠測/);
});
