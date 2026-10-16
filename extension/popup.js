// Bookmark Bar Centerer — popup logic (v1.2)
const SPACER_HASH = "#bbc-spacer";
const SPACER_URL = chrome.runtime.getURL("spacer.html") + SPACER_HASH;
const SPACER_TITLE = ""; // без названия: только прозрачный значок, ничего не обрезается

// Размеры кнопок панели закладок (DIP), сняты с реальной панели
const ICON_ONLY = 32;    // кнопка без названия: 8 + значок 16 + 8 (= ширина разделителя)
const ICON_GAP = 6;      // промежуток значок–текст у закладок с названием
const BTN_MAX = 150;     // Chrome обрезает кнопки с длинным названием
const BAR_EDGE = 4;      // отступ панели слева

const $ = (id) => document.getElementById(id);
const isSpacer = (b) => !!b.url && b.url.endsWith("/spacer.html" + SPACER_HASH);

async function getBar() {
  const tree = await chrome.bookmarks.getTree();
  const root = tree[0].children;
  return root.find((n) => n.id === "1") || root[0];
}

async function getState() {
  const bar = await getBar();
  const children = await chrome.bookmarks.getChildren(bar.id);
  return { bar, children, spacers: children.filter(isSpacer) };
}

// Последовательное применение — быстрые движения ползунка не конфликтуют
let wanted = null, busy = false;
async function applyCount(n) {
  wanted = n;
  if (busy) return;
  busy = true;
  try {
    while (wanted !== null) {
      const target = wanted; wanted = null;
      const { bar, spacers } = await getState();
      // старые разделители (с названием) приводим к пустому
      for (const s of spacers.slice(0, target)) {
        if (s.title !== SPACER_TITLE) await chrome.bookmarks.update(s.id, { title: SPACER_TITLE });
      }
      for (let i = spacers.length; i < target; i++) {
        await chrome.bookmarks.create({ parentId: bar.id, index: 0, title: SPACER_TITLE, url: SPACER_URL });
      }
      for (const s of spacers.slice(target)) await chrome.bookmarks.remove(s.id);
    }
  } catch (e) {
    $("status").textContent = "Ошибка: " + e.message;
  }
  busy = false;
}

// --- авто-центр ---
const ctx = document.createElement("canvas").getContext("2d");
ctx.font = '12px "Segoe UI", system-ui, Roboto, "Helvetica Neue", sans-serif';
function buttonWidth(title) {
  if (!title) return ICON_ONLY;
  return Math.min(ICON_ONLY + ICON_GAP + ctx.measureText(title).width, BTN_MAX);
}

async function autoCenterCount() {
  const { children } = await getState();
  const content = children.filter((b) => !isSpacer(b)).reduce((s, b) => s + buttonWidth(b.title), 0);
  const win = await chrome.windows.getCurrent();
  // у развёрнутого окна Windows добавляет невидимые рамки по 8 px — берём ширину экрана
  const width = (win.state === "maximized" || win.state === "fullscreen") ? screen.availWidth : win.width;
  const gap = (width - content) / 2 - BAR_EDGE;
  return Math.max(0, Math.round(gap / ICON_ONLY));
}

// --- UI ---
const slider = $("slider"), num = $("num");
let timer = null;
function setValue(v, { apply = true, from } = {}) {
  v = Math.max(0, Math.min(Number(slider.max), Math.round(Number(v) || 0)));
  if (from !== slider) slider.value = v;
  if (from !== num) num.value = v;
  if (!apply) return;
  clearTimeout(timer);
  timer = setTimeout(() => applyCount(v), 60);
}

slider.addEventListener("input", () => setValue(slider.value, { from: slider }));
num.addEventListener("input", () => { if (num.value !== "") setValue(num.value, { from: num }); });
num.addEventListener("change", () => setValue(num.value));
slider.addEventListener("wheel", (e) => {
  e.preventDefault();
  setValue(Number(slider.value) + (e.deltaY < 0 ? 1 : -1));
}, { passive: false });

$("auto").addEventListener("click", async () => {
  setValue(await autoCenterCount());
  $("status").textContent = "Выровнено по центру окна.";
});
$("reset").addEventListener("click", () => { setValue(0); $("status").textContent = "Разделители удалены."; });

(async () => {
  const win = await chrome.windows.getCurrent();
  slider.max = num.max = Math.floor(win.width / 2 / ICON_ONLY) + 5;
  const { spacers } = await getState();
  setValue(spacers.length, { apply: false });
  // если остались разделители старого формата — сразу приводим к новому
  if (spacers.some((s) => s.title !== SPACER_TITLE)) applyCount(spacers.length);
})();
