export const STATIONS = [
  { id: "46166", name: "箱根", area: "芦ノ湖南東・箱根町" },
  { id: "50066", name: "御殿場", area: "芦ノ湖西・裾野市北部" },
  { id: "50281", name: "三島", area: "三島市・函南町西部" },
];

export const JMA_BASE_URL = "https://www.jma.go.jp/bosai/amedas/data/map";
export const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function classify(rainfall) {
  if (rainfall >= 30) return { key: "warning", label: "警戒", description: "道路冠水や小河川の増水が始まる段階", icon: "!!" };
  if (rainfall >= 20) return { key: "caution", label: "注意", description: "側溝や小規模な水路があふれ始める段階", icon: "!" };
  return { key: "normal", label: "平常", description: "現時点で基準値未満です", icon: "✓" };
}

function mapTimestamp(date) {
  const japan = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  japan.setUTCMinutes(Math.floor(japan.getUTCMinutes() / 10) * 10, 0, 0);
  const parts = [japan.getUTCFullYear(), japan.getUTCMonth() + 1, japan.getUTCDate(), japan.getUTCHours(), japan.getUTCMinutes(), 0];
  return parts.map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0")).join("");
}

export async function fetchLatest(fetcher = fetch, now = new Date()) {
  // Publication can lag behind observation time. Try the latest six 10-minute slots.
  let lastError;
  for (let offset = 0; offset <= 50; offset += 10) {
    const timestamp = mapTimestamp(new Date(now.getTime() - offset * 60 * 1000));
    try {
      const response = await fetcher(`${JMA_BASE_URL}/${timestamp}.json`, { cache: "no-store" });
      if (!response.ok) {
        lastError = new Error(`気象庁から応答がありません（HTTP ${response.status}）`);
        continue;
      }
      const data = await response.json();
      const observations = STATIONS.map((station) => {
        const raw = data[station.id];
        const value = raw?.precipitation1h?.[0];
        return { ...station, rainfall: Number.isFinite(value) ? value : null };
      });
      if (observations.some((item) => item.rainfall !== null)) return { timestamp, observations };
      lastError = new Error("対象地点の観測値がすべて欠測です");
    } catch (error) {
      // A single publication slot can briefly be unavailable; continue to older data.
      lastError = error;
    }
  }
  throw new Error("最新の観測データを取得できませんでした", { cause: lastError });
}

function formatTime(timestamp) {
  return `${Number(timestamp.slice(4, 6))}月${Number(timestamp.slice(6, 8))}日 ${timestamp.slice(8, 10)}:${timestamp.slice(10, 12)} 現在`;
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
