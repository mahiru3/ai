/* ==============================================
   03-js/21-chat-05-log.js
   ログ整形ツール ロジック
   ============================================== */

const KIND_LABEL = { chara:"キャラ", event:"テキスト", scene:"シーン", system:"非表示" };
const KIND_ORDER = { chara:0, event:1, scene:2, system:3 };
const TAB_PRESETS = ["[main]","[info]","[other]"];

let rawHtml   = "";
let fileName  = "";
let parsedDoc = null;
let speakerMap = {};  // key=origTab+"::"+name → { origTab, dispTab, name, kind, rename }
let tableOrder = [];
let sortCol = null;
let sortDir = "asc";

// =============================================
// ファイル読み込み
// =============================================
function initFileInput() {
  const dropZone   = document.getElementById("dropZone");
  const fileInput  = document.getElementById("fileInput");
  const fileNameEl = document.getElementById("fileName");
  const loadStatus = document.getElementById("loadStatus");
  const btnAnalyze = document.getElementById("btnAnalyze");

  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault(); dropZone.classList.remove("dragover");
    if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", () => { if (fileInput.files[0]) setFile(fileInput.files[0]); });

  function setFile(file) {
    if (!file.name.match(/\.html?$/i)) {
      showStatus(loadStatus, "HTMLファイルを選択してください", "err"); return;
    }
    fileName = file.name.replace(/\.html?$/i, "");
    const reader = new FileReader();
    reader.onload = ev => {
      rawHtml = ev.target.result;
      fileNameEl.textContent = "📄 " + file.name;
      fileNameEl.className = "file-name loaded";
      btnAnalyze.disabled = false;
      showStatus(loadStatus, "読み込み完了。「解析する」を押してください", "info");
      speakerMap = {}; tableOrder = []; parsedDoc = null;
      ["acc-2","acc-3","acc-4","acc-5"].forEach(id => {
        document.getElementById(id)?.removeAttribute("open");
      });
    };
    reader.readAsText(file, "UTF-8");
  }
}

// =============================================
// 解析
// =============================================
function analyze() {
  speakerMap = {};
  const parser = new DOMParser();
  parsedDoc = parser.parseFromString(rawHtml, "text/html");

  parsedDoc.querySelectorAll("p").forEach(p => {
    const spans = p.querySelectorAll("span");
    if (spans.length < 3) return;
    const origTab = spans[0].textContent.trim();
    const name    = spans[1].textContent.trim();
    const key     = origTab + "::" + name;
    if (!(key in speakerMap)) {
      speakerMap[key] = { origTab, dispTab: origTab, name, kind: "chara", rename: "" };
    }
  });

  const spCount = Object.keys(speakerMap).length;
  const analyzeStatus = document.getElementById("analyzeStatus");
  if (spCount === 0) {
    showStatus(analyzeStatus, "発言者が検出できませんでした", "err"); return;
  }

  tableOrder = Object.keys(speakerMap);
  sortCol = null;
  ["acc-2","acc-3","acc-4","acc-5"].forEach(id => {
    document.getElementById(id)?.setAttribute("open","");
  });

  renderTable();
  const pCount = parsedDoc.querySelectorAll("p").length;
  showStatus(analyzeStatus, `${pCount} ブロック ／ 発言者 ${spCount} 件を検出`, "ok");
}

// =============================================
// テーブル描画
// =============================================
function renderTable() {
  const tbody = document.getElementById("spTbody");
  if (!tbody) return;

  // ソート
  const sorted = [...tableOrder].sort((a, b) => {
    if (!sortCol) return 0;
    const sa = speakerMap[a], sb = speakerMap[b];
    let va, vb;
    if      (sortCol === "kind") { va = KIND_ORDER[sa.kind]; vb = KIND_ORDER[sb.kind]; }
    else if (sortCol === "tab")  { va = sa.dispTab; vb = sb.dispTab; }
    else                         { va = sa.name;    vb = sb.name; }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ?  1 : -1;
    return 0;
  });

  // データ行
  const dataRows = sorted.map(key => {
    const sp = speakerMap[key];
    const tabRaw   = sp.dispTab.replace(/[\[\] ]/g, "");
    const tabClass = tabRaw === "main" ? "tab-main" : tabRaw === "info" ? "tab-info" : "tab-other";
    const kindOpts = Object.entries(KIND_LABEL).map(([k,l]) =>
      `<option value="${k}" ${sp.kind===k?"selected":""}>${l}</option>`
    ).join("");
    return `<tr data-key="${escAttr(key)}">
      <td class="cb-cell"><input type="checkbox" class="row-cb cb-tab" data-key="${escAttr(key)}" /></td>
      <td><span class="tab-badge ${tabClass}">${esc(sp.dispTab)}</span></td>
      <td class="cb-cell"><input type="checkbox" class="row-cb cb-kind" data-key="${escAttr(key)}" /></td>
      <td><select class="kind-select k-${sp.kind}" data-key="${escAttr(key)}">${kindOpts}</select></td>
      <td class="cb-cell"><input type="checkbox" class="row-cb cb-name" data-key="${escAttr(key)}" /></td>
      <td>${esc(sp.name)}</td>
      <td><input type="text" class="sp-input${sp.rename?" changed":""}"
        placeholder="${escAttr(sp.name)}" value="${escAttr(sp.rename)}"
        data-key="${escAttr(key)}" /></td>
    </tr>`;
  }).join("");

  // 一括変更行（最下部固定）
  const tabPresetOpts = TAB_PRESETS.map(t =>
    `<option value="${escAttr(t)}">${esc(t)}</option>`
  ).join("");
  const bulkKindOpts = Object.entries(KIND_LABEL).map(([k,l]) =>
    `<option value="${k}">${l}</option>`
  ).join("");

  const bulkRow = `<tr class="bulk-row">
    <td class="cb-cell"></td>
    <td>
      <div class="bulk-tab-cell">
        <select class="bulk-tab-select">${tabPresetOpts}</select>
        <span class="bulk-or">or</span>
        <input type="text" class="bulk-tab-input" placeholder="新規タブ名" />
      </div>
    </td>
    <td class="cb-cell"></td>
    <td><select class="kind-select k-chara bulk-kind-select">${bulkKindOpts}</select></td>
    <td class="cb-cell"></td>
    <td colspan="2">
      <div class="bulk-action-row">
        <input type="text" class="sp-input bulk-rename-input" placeholder="変更後の名前" />
        <button class="menu-btn bulk-apply-btn" type="button">まとめて変更</button>
      </div>
    </td>
  </tr>`;

  // ラベル行（一括変更の見出し）
  const labelRow = `<tr class="bulk-label-row">
    <td colspan="7"><span class="bulk-label">▼ 一括変更</span></td>
  </tr>`;

  tbody.innerHTML = dataRows + labelRow + bulkRow;

  // --- イベント登録 ---

  // 種別セレクト（個別行）
  tbody.querySelectorAll("tr[data-key] .kind-select").forEach(sel => {
    sel.addEventListener("change", e => {
      const key = e.target.dataset.key;
      speakerMap[key].kind = e.target.value;
      e.target.className = "kind-select k-" + e.target.value;
    });
  });

  // 変更後テキスト（個別行）
  tbody.querySelectorAll(".sp-input:not(.bulk-rename-input)").forEach(inp => {
    inp.addEventListener("input", e => {
      const key = e.target.dataset.key;
      speakerMap[key].rename = e.target.value;
      e.target.classList.toggle("changed", e.target.value !== "");
    });
  });

  // 一括変更：bulkタブselectが変わったらbulkタブinputをクリア
  const bulkTabSel   = tbody.querySelector(".bulk-tab-select");
  const bulkTabInput = tbody.querySelector(".bulk-tab-input");
  bulkTabSel.addEventListener("change", () => { bulkTabInput.value = ""; });
  bulkTabInput.addEventListener("input", () => { bulkTabSel.value = TAB_PRESETS[0]; });

  // まとめて変更ボタン
  tbody.querySelector(".bulk-apply-btn").addEventListener("click", () => {
    applyBulk();
  });

  // ソートアイコン更新
  document.querySelectorAll("#spTable th[data-col]").forEach(th => {
    th.className = th.dataset.col === sortCol ? "sort-" + sortDir : "sort-none";
  });
}

// =============================================
// 一括変更適用
// =============================================
function applyBulk() {
  const tbody = document.getElementById("spTbody");

  // チェック状態を取得
  const tabChecked  = new Set([...tbody.querySelectorAll(".cb-tab:checked")].map(cb => cb.dataset.key));
  const kindChecked = new Set([...tbody.querySelectorAll(".cb-kind:checked")].map(cb => cb.dataset.key));
  const nameChecked = new Set([...tbody.querySelectorAll(".cb-name:checked")].map(cb => cb.dataset.key));

  // 一括変更の値
  const bulkTabInput = tbody.querySelector(".bulk-tab-input").value.trim();
  const bulkTabSel   = tbody.querySelector(".bulk-tab-select").value;
  const newTab       = bulkTabInput !== "" ? bulkTabInput : bulkTabSel;
  const newKind      = tbody.querySelector(".bulk-kind-select").value;
  const newName      = tbody.querySelector(".bulk-rename-input").value.trim();

  let changed = 0;
  Object.keys(speakerMap).forEach(key => {
    if (tabChecked.has(key)) {
      speakerMap[key].dispTab = newTab;
      changed++;
    }
    if (kindChecked.has(key)) {
      speakerMap[key].kind = newKind;
      changed++;
    }
    if (nameChecked.has(key) && newName !== "") {
      speakerMap[key].rename = newName;
      changed++;
    }
  });

  renderTable();
  if (changed > 0) {
    showStatus(document.getElementById("analyzeStatus"), `${changed} 件を変更しました`, "ok");
  }
}

// =============================================
// ④ プレビュー（元構造）
// =============================================
function updatePreview() {
  if (!parsedDoc) return;
  const optHideSys = document.getElementById("optHideSystem").checked;
  const wrap = document.getElementById("previewWrap");
  const lines = [];

  parsedDoc.querySelectorAll("p").forEach(p => {
    const spans = p.querySelectorAll("span");
    if (spans.length < 3) return;
    const origTab = spans[0].textContent.trim();
    const name    = spans[1].textContent.trim();
    const key     = origTab + "::" + name;
    const sp      = speakerMap[key] || { kind:"chara", rename:"", dispTab: origTab };
    if (optHideSys && sp.kind === "system") return;

    const dispName = sp.rename.trim() || name;
    const dispTab  = sp.dispTab || origTab;
    const bodyHtml = spans[2].innerHTML;
    const parts    = bodyHtml.split(/<br\s*\/?>/i).map(s => s.trim()).filter(s => s.length > 0);

    parts.forEach(part => {
      lines.push(
        `<p style="color:#888888;"><span> ${esc(dispTab)}</span> <span>${esc(dispName)}</span> : <span> ${part} </span></p>`
      );
    });
  });

  if (lines.length === 0) {
    wrap.innerHTML = `<div class="preview-empty">表示できる行がありません</div>`; return;
  }
  wrap.innerHTML = lines.join("\n");
}

// =============================================
// ④ 元構造ダウンロード
// =============================================
function downloadOriginal() {
  if (!parsedDoc) { showStatus(document.getElementById("processStatus"),"先に解析してください","err"); return; }
  const optHideSys = document.getElementById("optHideSystem").checked;
  const pBlocks = [];

  parsedDoc.querySelectorAll("p").forEach(p => {
    const spans = p.querySelectorAll("span");
    if (spans.length < 3) return;
    const origTab = spans[0].textContent.trim();
    const name    = spans[1].textContent.trim();
    const key     = origTab + "::" + name;
    const sp      = speakerMap[key] || { kind:"chara", rename:"", dispTab: origTab };
    if (optHideSys && sp.kind === "system") return;

    const dispName = sp.rename.trim() || name;
    const dispTab  = sp.dispTab || origTab;
    const bodyHtml = spans[2].innerHTML;
    const parts    = bodyHtml.split(/<br\s*\/?>/i).map(s => s.trim()).filter(s => s.length > 0);

    parts.forEach(part => {
      pBlocks.push(
`<p style="color:#888888;">
  <span> ${esc(dispTab)}</span>
  <span>${esc(dispName)}</span> :
  <span>
    ${part}
  </span>
</p>`
      );
    });
  });

  const headEl = parsedDoc.querySelector("head");
  let headHtml = headEl ? headEl.outerHTML : `<head><meta charset="UTF-8" /></head>`;
  headHtml = headHtml.replace(/<title>[^<]*<\/title>/, `<title>${esc(fileName)}</title>`);

  const html =
`<!DOCTYPE html>
<html lang="ja">
${headHtml}
  <body>
    

${pBlocks.join("\n\n")}

  </body>
</html>`;

  triggerDownload(html, fileName + "_整形済み.html");
  showStatus(document.getElementById("processStatus"), "ダウンロードしました！", "ok");
}

// =============================================
// ⑤ 整形ダウンロード
// =============================================
function downloadFormatted() {
  if (!parsedDoc) { showStatus(document.getElementById("formatStatus"),"先に解析してください","err"); return; }

  const optTab   = document.getElementById("optTab").checked;
  const optSkill = document.getElementById("optSkill").checked;
  const optHide  = document.getElementById("optHideSystem").checked;
  const optSpace = document.getElementById("optSpaceBetween").checked;
  const bodyLines = [];
  let prevKind = null;

  parsedDoc.querySelectorAll("p").forEach(p => {
    const spans = p.querySelectorAll("span");
    if (spans.length < 3) return;
    const origTab = spans[0].textContent.trim();
    const name    = spans[1].textContent.trim();
    const key     = origTab + "::" + name;
    const sp      = speakerMap[key] || { kind:"chara", rename:"", dispTab: origTab };
    const kind    = sp.kind;
    if (optHide && kind === "system") return;

    const dispName = sp.rename.trim() || name;
    const dispTab  = sp.dispTab || origTab;
    const bodyHtml = spans[2].innerHTML;
    const parts    = bodyHtml.split(/<br\s*\/?>/i).map(s => s.trim()).filter(s => s.length > 0);

    parts.forEach(part => {
      if (optSpace && prevKind !== null && prevKind !== kind) {
        bodyLines.push(`<p style="margin:0;line-height:1;">&nbsp;</p>`);
      }
      prevKind = kind;
      const tabRaw   = dispTab.replace(/[\[\] ]/g,"");
      const tabClass = tabRaw==="main"?"log-tab-main":tabRaw==="info"?"log-tab-info":"log-tab-other";
      const tabHtml  = optTab ? `<span class="log-tab ${tabClass}">${esc(dispTab)}</span>` : "";
      let text = part;
      if (optSkill) text = text.replace(/〈([^〉]+)〉/g, `<span class="skill-hl">〈$1〉</span>`);
      bodyLines.push(
        `<p style="color:#888888;">${tabHtml}<span>${esc(dispName)}</span> : <span> ${text} </span></p>`
      );
    });
  });

  const headEl = parsedDoc.querySelector("head");
  let headHtml = headEl ? headEl.outerHTML : `<head><meta charset="UTF-8" /></head>`;
  headHtml = headHtml.replace(/<title>[^<]*<\/title>/, `<title>${esc(fileName)}</title>`);
  headHtml = headHtml.replace("</head>",
    `  <style>
    .log-tab{font-size:10px;font-weight:700;margin-right:6px;padding:1px 6px;border-radius:3px;vertical-align:middle;display:inline-block}
    .log-tab-main{background:#fff3e0;color:#a85400}
    .log-tab-info{background:#e8f0fe;color:#1a56a0}
    .log-tab-other{background:#f0f0f0;color:#888}
    .skill-hl{background:#fff8e0;color:#7a5000;border-radius:3px;padding:0 2px;font-weight:600;font-size:.9em}
  </style>\n</head>`
  );

  const html =
`<!DOCTYPE html>
<html lang="ja">
${headHtml}
  <body>
    

${bodyLines.join("\n")}

  </body>
</html>`;

  triggerDownload(html, fileName + "_整形.html");
  showStatus(document.getElementById("formatStatus"), "ダウンロードしました！", "ok");
}

// =============================================
// リセット
// =============================================
function resetAll() {
  rawHtml = ""; fileName = ""; parsedDoc = null; speakerMap = {}; tableOrder = [];
  const fi = document.getElementById("fileInput");
  if (fi) fi.value = "";
  const fn = document.getElementById("fileName");
  if (fn) { fn.textContent = "ファイル未選択"; fn.className = "file-name"; }
  const ba = document.getElementById("btnAnalyze");
  if (ba) ba.disabled = true;
  ["acc-2","acc-3","acc-4","acc-5"].forEach(id => document.getElementById(id)?.removeAttribute("open"));
  ["loadStatus","analyzeStatus","processStatus","formatStatus"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = "status-msg";
  });
  const wrap = document.getElementById("previewWrap");
  if (wrap) wrap.innerHTML = `<div class="preview-empty">「プレビュー更新」をクリックしてください</div>`;
}

// =============================================
// naviからアコーディオンを開く
// =============================================
function openAccordion(id) {
  const el = document.getElementById(id);
  if (el) { el.setAttribute("open",""); el.scrollIntoView({ behavior:"smooth", block:"start" }); }
}

// =============================================
// ユーティリティ
// =============================================
function esc(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
function escAttr(s) {
  return String(s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;");
}
function triggerDownload(html, name) {
  const blob = new Blob([html], { type:"text/html;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
function showStatus(el, msg, type) {
  if (!el) return;
  el.textContent = msg; el.className = "status-msg show " + type;
}
