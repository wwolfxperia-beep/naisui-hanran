export const STATIONS = [
  { id: "hakone", name: "箱根", area: "芦ノ湖南東・箱根町", lat: 35.2333, lon: 139.0167 },
  { id: "gotemba", name: "御殿場", area: "芦ノ湖西・裾野市北部", lat: 35.3086, lon: 138.935 },
  { id: "mishima", name: "三島", area: "三島市・函南町西部", lat: 35.1167, lon: 138.9167 },
];

export const OPEN_METEO_BASE_URL = "https://api.open-meteo.com/v1/forecast";
export const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

function buildOpenMeteoUrl() {
  const latitude = STATIONS.map((station) => station.lat).join(",");
  const longitude = STATIONS.map((station) => station.lon).join(",");
  const params = new URLSearchParams({
    latitude,
    longitude,
    current: "precipitation",
    timezone: "Asia/Tokyo",
  });
  return `${OPEN_METEO_BASE_URL}?${params.toString()}`;
}

export function classify(rainfall) {
  if (rainfall >= 30) return { key: "warning", label: "警戒", description: "道路冠水や小河川の増水が始まる段階", icon: "!!" };
  if (rainfall >= 20) return { key: "caution", label: "注意", description: "側溝や小規模な水路があふれ始める段階", icon: "!" };
  return { key: "normal", label: "平常", description: "現時点で基準値未満です", icon: "✓" };
}

export async function fetchLatest(fetcher = fetch, now = new Date()) {
  const url = buildOpenMeteoUrl();
  let response;
  try {
    response = await fetcher(url, { cache: "no-store" });
  } catch (error) {
    throw new Error("最新の観測データを取得できませんでした", { cause: error });
  }
  if (!response.ok) {
    throw new Error(`気象データの取得元から応答がありません（HTTP ${response.status}）`, { cause: new Error(String(response.status)) });
  }
  const data = await response.json();
  const results = Array.isArray(data) ? data : [data];
  if (results.some((item) => item?.error)) {
    throw new Error(`気象データの取得元がエラーを返しました（${results.find((item) => item?.error)?.reason ?? "不明なエラー"}）`);
  }

  const observations = STATIONS.map((station, index) => {
    const value = results[index]?.current?.precipitation;
    return { ...station, rainfall: Number.isFinite(value) ? value : null };
  });
  if (observations.every((item) => item.rainfall === null)) {
    throw new Error("対象地点の観測値がすべて欠測です");
  }
  const timestamp = results.find((item) => item?.current?.time)?.current.time ?? now.toISOString();
  return { timestamp, observations };
}

function formatTime(timestamp) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(timestamp);
  if (!match) return timestamp;
  const [, , month, day, hour, minute] = match;
  return `${Number(month)}月${Number(day)}日 ${hour}:${minute} 現在`;
}

function render({ timestamp, observations }) {
  const valid = observations.filter(({ rainfall }) => rainfall !== null);
  const max = valid.length ? Math.max(...valid.map(({ rainfall }) => rainfall)) : 0;
  const level = classify(max);
  const card = document.querySelector("#status-card");
  card.className = `status-card ${level.key}`;
  document.querySelector("#status-text").textContent = level.label;
  document.querySelector(".status-icon").textContent = level.icon;
  document.querySelector("#status-description").textContent = level.description;
  document.querySelector("#rainfall").textContent = max.toFixed(1);
  document.querySelector("#observation-time").textContent = formatTime(timestamp);
  document.querySelector("#meter-fill").style.width = `${Math.min(100, max / 40 * 100)}%`;
  document.querySelector("#stations").innerHTML = observations.map((station) => {
    const stationLevel = station.rainfall === null ? { key: "missing", label: "欠測" } : classify(station.rainfall);
    const value = station.rainfall === null ? "--" : station.rainfall.toFixed(1);
    return `<article class="station"><div class="station-title"><span class="pin" aria-hidden="true">⌖</span><div><h3>${station.name}</h3><p>${station.area}</p></div><span class="badge ${stationLevel.key}">${stationLevel.label}</span></div><div class="station-value"><strong>${value}</strong><span>mm/h</span></div><p class="station-note">直近1時間降水量</p></article>`;
  }).join("");
}

function showError(error) {
  document.querySelector("#status-text").textContent = "取得エラー";
  document.querySelector("#status-description").textContent = error.message;
  document.querySelector("#observation-time").textContent = "更新ボタンで再試行できます";
  document.querySelector("#status-card").className = "status-card error";
  document.querySelector("#stations").innerHTML = `<p class="station-error">通信状況を確認して、更新ボタンを押してください。</p>`;
}

async function update() {
  const button = document.querySelector("#refresh");
  button.disabled = true;
  button.classList.add("loading");
  try { render(await fetchLatest()); } catch (error) { showError(error); }
  finally { button.disabled = false; button.classList.remove("loading"); }
}

if (typeof document !== "undefined") {
  document.querySelector("#refresh").addEventListener("click", update);
  update();
  setInterval(update, REFRESH_INTERVAL_MS);
}
