/* ==============================================
   03-js/21-chat-05-log.js
   ログ整形ツール ロジック（外部JS）
   ============================================== */

// =============================================
// 定数
// =============================================
const KIND_LABEL = { chara:"キャラ", event:"テキスト", scene:"シーン", system:"非表示" };
const KIND_ORDER = { chara:0, event:1, scene:2, system:3 };
const TAB_LIST   = ["main","info","other"];

// =============================================
// 状態
// =============================================
let rawHtml    = "";
let fileName   = "";
let parsedDoc  = null;
let speakerMap = {};   // key = origTab+"::"+name → { origTab, dispTab, name, kind, rename }
let tableOrder = [];
let sortCol    = null;
let sortDir    = "asc";

// =============================================
// ファイル読み込み
// =============================================
function initFileInput() {
  const dropZone  = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const fileNameEl= document.getElementById("fileName");
  const loadStatus= document.getElementById("loadStatus");
  const btnAnalyze= document.getElementById("btnAnalyze");

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
    reader.onload = e => {
      rawHtml = e.target.result;
      fileNameEl.textContent = "📄 " + file.name;
      fileNameEl.className = "file-name loaded";
      btnAnalyze.disabled = false;
      showStatus(loadStatus, "読み込み完了。「解析する」を押してください", "info");
      // 再読込時リセット
      speakerMap = {}; tableOrder = []; parsedDoc = null;
      ["acc-2","acc-3","acc-4","acc-5"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.removeAttribute("open");
      });
      ["speakerSection","optionSection","previewSection","formatSection"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
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

  // アコーディオンを開く
  ["acc-2","acc-3","acc-4","acc-5"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute("open","");
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

  const sorted = [...tableOrder].sort((a, b) => {
    if (!sortCol) return 0;
    const sa = speakerMap[a], sb = speakerMap[b];
    let va, vb;
    if (sortCol === "kind")   { va = KIND_ORDER[sa.kind]; vb = KIND_ORDER[sb.kind]; }
    else if (sortCol === "tab")  { va = sa.dispTab; vb = sb.dispTab; }
    else                         { va = sa.name;    vb = sb.name; }
    if (va < vb) return sortDir === "asc" ? -1 : 1;
    if (va > vb) return sortDir === "asc" ?  1 : -1;
    return 0;
  });

  const tabOpts = TAB_LIST.map(t =>
    `<option value="[${t}]">[${t}]</option>`
  ).join("");

  tbody.innerHTML = sorted.map(key => {
    const sp = speakerMap[key];
    const tabRaw = sp.dispTab.replace(/[\[\] ]/g,"");
    const tabClass = tabRaw==="main"?"tab-main":tabRaw==="info"?"tab-info":"tab-other";
    const kindOpts = Object.entries(KIND_LABEL).map(([k,l]) =>
      `<option value="${k}" ${sp.kind===k?"selected":""}>${l}</option>`
    ).join("");
    const tabOptsSel = TAB_LIST.map(t =>
      `<option value="[${t}]" ${sp.dispTab==="["+t+"]"?"selected":""}>[${t}]</option>`
    ).join("");
    return `<tr data-key="${escAttr(key)}">
      <td>
        <span class="tab-badge ${tabClass} tab-display">${esc(sp.dispTab)}</span>
        <select class="tab-select" data-key="${escAttr(key)}" style="display:none;">${tabOptsSel}</select>
      </td>
      <td>${esc(sp.name)}</td>
      <td><select class="kind-select k-${sp.kind}" data-key="${escAttr(key)}">${kindOpts}</select></td>
      <td><input type="text" class="sp-input${sp.rename?" changed":""}"
        placeholder="${escAttr(sp.name)}" value="${escAttr(sp.rename)}"
        data-key="${escAttr(key)}" /></td>
    </tr>`;
  }).join("");

  // タブバッジクリックでselectに切り替え
  tbody.querySelectorAll(".tab-display").forEach(badge => {
    badge.addEventListener("click", e => {
      const row = e.target.closest("tr");
      badge.style.display = "none";
      row.querySelector(".tab-select").style.display = "";
      row.querySelector(".tab-select").focus();
    });
  });
  tbody.querySelectorAll(".tab-select").forEach(sel => {
    sel.addEventListener("change", e => {
      const key = e.target.dataset.key;
      speakerMap[key].dispTab = e.target.value;
      renderTable();
    });
    sel.addEventListener("blur", e => {
      const row = e.target.closest("tr");
      e.target.style.display = "none";
      row.querySelector(".tab-display").style.display = "";
    });
  });

  // 種別変更
  tbody.querySelectorAll(".kind-select").forEach(sel => {
    sel.addEventListener("change", e => {
      const key = e.target.dataset.key;
      speakerMap[key].kind = e.target.value;
      e.target.className = "kind-select k-" + e.target.value;
    });
  });

  // 名前変更
  tbody.querySelectorAll(".sp-input").forEach(inp => {
    inp.addEventListener("input", e => {
      const key = e.target.dataset.key;
      speakerMap[key].rename = e.target.value;
      e.target.classList.toggle("changed", e.target.value !== "");
    });
  });

  // ソートアイコン更新
  document.querySelectorAll("#spTable th[data-col]").forEach(th => {
    th.className = th.dataset.col === sortCol ? "sort-" + sortDir : "sort-none";
  });
}

// =============================================
// 一括タブ変更
// =============================================
function initBulkTab() {
  const btnBulk   = document.getElementById("btnBulkTab");
  const selectBulk= document.getElementById("bulkTabSelect");
  if (!btnBulk || !selectBulk) return;

  btnBulk.addEventListener("click", () => {
    const newTab = selectBulkTab();
    const checks = document.querySelectorAll(".tab-check:checked");
    checks.forEach(cb => {
      const tabKey = cb.dataset.tabkey; // "[main]" など
      Object.keys(speakerMap).forEach(key => {
        if (speakerMap[key].dispTab === tabKey) {
          speakerMap[key].dispTab = newTab;
        }
      });
    });
    renderTable();
  });
}

function selectBulkTab() {
  return document.getElementById("bulkTabValue")?.value || "[main]";
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

    // <br>で分割して複数<p>に
    const bodyHtml = spans[2].innerHTML;
    const parts = bodyHtml.split(/<br\s*\/?>/i)
      .map(s => s.trim()).filter(s => s.length > 0);

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

    // <br>で分割 → 空でない部分を別<p>に
    const parts = bodyHtml.split(/<br\s*\/?>/i)
      .map(s => s.trim()).filter(s => s.length > 0);

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

  // 元の<head>を取得してtitleだけ変更
  const headSrc = parsedDoc.querySelector("head");
  let headHtml = headSrc ? headSrc.outerHTML : "<head><meta charset=\"UTF-8\" /></head>";
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
    const parts    = bodyHtml.split(/<br\s*\/?>/i)
      .map(s => s.trim()).filter(s => s.length > 0);

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

  const headSrc = parsedDoc.querySelector("head");
  let headHtml = headSrc ? headSrc.outerHTML : "<head><meta charset=\"UTF-8\" /></head>";
  headHtml = headHtml.replace(/<title>[^<]*<\/title>/, `<title>${esc(fileName)}</title>`);
  // styleを追加
  headHtml = headHtml.replace("</head>", `  <style>
    .log-tab{font-size:10px;font-weight:700;margin-right:6px;padding:1px 6px;border-radius:3px;vertical-align:middle;display:inline-block}
    .log-tab-main{background:#fff3e0;color:#a85400}
    .log-tab-info{background:#e8f0fe;color:#1a56a0}
    .log-tab-other{background:#f0f0f0;color:#888}
    .skill-hl{background:#fff8e0;color:#7a5000;border-radius:3px;padding:0 2px;font-weight:600;font-size:.9em}
  </style>
</head>`);

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
  const fileInput = document.getElementById("fileInput");
  if (fileInput) fileInput.value = "";
  const fileNameEl = document.getElementById("fileName");
  if (fileNameEl) { fileNameEl.textContent = "ファイル未選択"; fileNameEl.className = "file-name"; }
  const btnAnalyze = document.getElementById("btnAnalyze");
  if (btnAnalyze) btnAnalyze.disabled = true;
  ["acc-2","acc-3","acc-4","acc-5"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.removeAttribute("open");
  });
  ["loadStatus","analyzeStatus","processStatus","formatStatus"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.className = "status-msg";
  });
  const wrap = document.getElementById("previewWrap");
  if (wrap) wrap.innerHTML = `<div class="preview-empty">「プレビュー更新」をクリックしてください</div>`;
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

// =============================================
// naviからアコーディオンを開く
// =============================================
function openAccordion(id) {
  const el = document.getElementById(id);
  if (el) el.setAttribute("open","");
  el?.scrollIntoView({ behavior:"smooth", block:"start" });
}
