/* =========================================
   03-js/21-chat-03-ia-001-lap.js
   21-chat/03-ia/001-lap.html 専用：いあきゃら→ココフォリア変換ロジック
   - JSON解析・status編集・commands書き換え・params自動生成・クリップボードコピー
   - 既存31-csv/01-chara/index.htmlのscript部分を外部化したもの
   - parent.frames経由ではなく、ボタンonclickから直接呼ぶ単独動作版
========================================= */

let _obj = null;

/* =========================================
   JSON文字列内の生改行を \n エスケープに変換
   （いあきゃらのcommands文字列に生改行が入っているケースに対応）
========================================= */
function fixJSONNewlines(s) {
  let out = "", inStr = false, esc = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (!inStr) {
      if (ch === '"') { inStr = true; out += ch; esc = false; }
      else out += ch;
    } else {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === "\\") { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === "\n") { out += "\\n"; continue; }
      if (ch === "\r") { if (i + 1 < s.length && s[i + 1] === "\n") { i++; } out += "\\n"; continue; }
      out += ch;
    }
  }
  return out;
}

/* JSONパース：通常→失敗時は改行修復してリトライ */
function safeParse(jsonText) {
  try { return JSON.parse(jsonText); }
  catch (e) { return JSON.parse(fixJSONNewlines(jsonText)); }
}

/* =========================================
   params/status をマップ化（commands書き換え時の参照用）
========================================= */
function buildParamMap(data) {
  const m = {};
  (data.params || []).forEach(p => {
    if (p && p.label != null && p.value != null) {
      m[String(p.label).trim().toUpperCase()] = String(p.value).trim();
    }
  });
  return m;
}
function buildStatusMap(data) {
  const m = {};
  (data.status || []).forEach(s => {
    if (s && s.label != null && s.value != null) {
      m[String(s.label).trim().toUpperCase()] = s.value;
    }
  });
  return m;
}

/* =========================================
   commands文字列からCCB判定行を抽出
   - 固定値型：CCB<=70【アイデア】
   - 変数型：CCB<={STR}*5【STR×5】
========================================= */
const RE_FIXED_ANYWHERE = /CCB<=\s*(\d+)\s*【([^】]+)】/g;
const RE_FORM_ANYWHERE  = /CCB<=\s*\{\s*([A-Za-z]+)\s*\}\s*\*\s*(\d+)\s*【([^】]+)】/g;
function extractPairsAll(commands) {
  const pairs = []; let m;
  while ((m = RE_FIXED_ANYWHERE.exec(commands))) {
    pairs.push({ label: m[2].trim(), token: m[1] });
  }
  while ((m = RE_FORM_ANYWHERE.exec(commands))) {
    pairs.push({ label: m[3].trim(), token: `{${m[1].trim().toUpperCase()}}*${m[2].trim()}` });
  }
  return pairs;
}

/* {STR}*5 のようなトークンを評価して数値化 */
function evaluateToken(tok, params, status) {
  tok = String(tok).trim();
  if (/^\d+$/.test(tok)) return tok;
  const m = tok.match(/^\{\s*([A-Za-z]+)\s*\}\s*\*\s*(\d+)$/);
  if (m) {
    const varName = m[1].toUpperCase();
    const k = parseInt(m[2], 10);
    let base = null;
    if (params[varName] && /^\-?\d+$/.test(params[varName])) base = parseInt(params[varName], 10);
    else if (status[varName] != null && !isNaN(Number(status[varName]))) base = parseInt(status[varName], 10);
    if (base != null) return String(base * k);
    return tok;
  }
  return tok;
}

/* =========================================
   commands書き換え
   - CCB<=70【アイデア】     → CCB<=70{BA} 　〈アイデア〉
   - CCB<={STR}*5【STR × 5】 → CCB<={STR}*5{BA} 　〈STR×5〉
========================================= */
const RE_FIXED_LINE = /^(CCB<=)\s*(\d+)\s*【([^】]+)】\s*$/;
const RE_FORM_LINE  = /^CCB<=\s*(\{[^}]+\}\s*\*\s*\d+)\s*【([^】]+)】\s*$/;
function rewriteCommands(commands) {
  const lines = commands.split(/\r?\n/);
  return lines.map(line => {
    const mf = line.match(RE_FIXED_LINE);
    if (mf) {
      const val   = mf[2].trim();
      const label = mf[3].trim();
      return `CCB<=${val}{BA} 　〈${label}〉`;
    }
    const mv = line.match(RE_FORM_LINE);
    if (mv) {
      const expr  = mv[1].trim();
      const label = mv[2].trim().replace(/\s/g, "");
      return `CCB<=${expr}{BA} 　〈${label}〉`;
    }
    return line;
  }).join("\n");
}

/* =========================================
   いあきゃらJSON → ココフォリアClipboard形式に変換
========================================= */
function convertToClipboard(obj) {
  const data = obj.data ? obj.data : obj;
  let commands = data.commands || "";
  if (commands.includes("\\n") && !commands.includes("\n")) {
    commands = commands.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
  }
  const params = buildParamMap(data);
  const status = buildStatusMap(data);
  const pairs = extractPairsAll(commands);

  commands = rewriteCommands(commands);

  // commandsに登場した技能をparamsに自動追加（既存ラベルは重複追加しない）
  const existing = new Set((data.params || []).map(p => String(p.label || "").trim()));
  const add = [];
  pairs.forEach(({ label, token }) => {
    const val = evaluateToken(token, params, status);
    if (label && !existing.has(label)) {
      add.push({ label, value: val });
      existing.add(label);
    }
  });
  data.params = (data.params || []).concat(add);
  data.commands = commands;

  return { kind: "character", data };
}

/* =========================================
   statusテーブルの描画・読み取り・並び替え
========================================= */
function renderStatusTable(list) {
  const tbody = document.querySelector("#statusTable tbody");
  tbody.innerHTML = "";
  list.forEach(st => tbody.appendChild(buildRow(st)));
  tbody.addEventListener("dragover", e => {
    e.preventDefault();
    const dragging = tbody.querySelector("tr.dragging");
    const after = getDragAfterElement(tbody, e.clientY);
    if (!dragging) return;
    if (after == null) tbody.appendChild(dragging);
    else tbody.insertBefore(dragging, after);
  });
}

function buildRow(st) {
  const tr = document.createElement("tr");
  tr.draggable = true;
  tr.innerHTML = `
    <td class="drag" title="ドラッグで並び替え">↕</td>
    <td><input value="${st.label ?? ""}" data-role="label" style="width:100%"></td>
    <td><input value="${st.value ?? 0}" data-role="value" style="width:100%"></td>
    <td><input value="${st.max ?? 0}" data-role="max" style="width:100%"></td>
    <td><button data-role="del" style="padding:4px 8px">削除</button></td>
  `;
  tr.addEventListener("dragstart", e => {
    tr.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
  });
  tr.addEventListener("dragend", () => tr.classList.remove("dragging"));
  tr.querySelector('[data-role="del"]').onclick = () => tr.remove();
  return tr;
}

function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll("tr:not(.dragging)")];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    else return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

function readStatusTable() {
  const rows = [...document.querySelectorAll("#statusTable tbody tr")];
  return rows.map(tr => {
    const label = tr.querySelector('input[data-role="label"]').value.trim();
    const value = parseInt(tr.querySelector('input[data-role="value"]').value, 10) || 0;
    const max   = parseInt(tr.querySelector('input[data-role="max"]').value, 10) || 0;
    return { label, value, max };
  });
}

/* =========================================
   DOM要素の取得・メッセージ表示
========================================= */
const inputEl   = document.getElementById("input");
const outputEl  = document.getElementById("output");
const msgEl     = document.getElementById("msg");
const statusBox = document.getElementById("statusBox");
const metaBox   = document.getElementById("metaBox");
const nameInput = document.getElementById("nameInput");
const addRowBtn = document.getElementById("addRowBtn");

function showMsg(text, isErr) {
  msgEl.textContent = text;
  msgEl.className = isErr ? "err small" : "ok small";
}

/* =========================================
   ボタンonclickから直接呼ぶ3関数
   （元実装は parent.frames['center'].doParse() 経由だったが、
    単独動作版なので直接呼び出し）
========================================= */

/* 解析：JSONを読み込んでテーブルに展開 */
function doParse() {
  showMsg("", false);
  outputEl.value = "";
  try {
    const raw = inputEl.value.trim();
    if (!raw) { showMsg("JSONを貼り付けてから押してください。", true); return; }
    let obj = safeParse(raw);
    if (!("kind" in obj)) obj = { kind: "character", data: obj };
    if (obj.kind !== "character") obj = { kind: "character", data: obj.data || obj };
    _obj = obj;

    const data = _obj.data;
    nameInput.value = data.name ?? "";
    metaBox.style.display = "block";

    if (data.commands && data.commands.includes("\\n") && !data.commands.includes("\n")) {
      data.commands = data.commands.replace(/\\r\\n/g, "\n").replace(/\\n/g, "\n");
    }

    // 「STR × 5」のような派生statusを除外して元値（STR/CON等）だけ残す
    const filteredStatus = (Array.isArray(data.status) ? data.status : [])
      .filter(s => !/[×x]\s*\d/i.test(String(s.label || "")));
    renderStatusTable(filteredStatus);
    statusBox.style.display = "block";
  } catch (e) {
    showMsg("解析エラー:\n" + (e && e.message ? e.message : String(e)), true);
  }
}

/* 実行：編集内容を反映してClipboard形式に変換 */
function doRun() {
  if (!_obj) { showMsg("先に『解析』で読み込んでください。", true); return; }
  try {
    _obj.data.name   = nameInput.value;
    _obj.data.status = readStatusTable();
    const out = convertToClipboard(_obj);
    outputEl.value = JSON.stringify(out);
    showMsg("変換完了。コピーボタンでクリップボードへ。", false);
  } catch (e) {
    showMsg("変換エラー:\n" + (e && e.message ? e.message : String(e)), true);
  }
}

/* コピー：clipboard API → 失敗時execCommandフォールバック */
async function doCopy() {
  const text = outputEl.value.trim();
  if (!text) { showMsg("出力が空です。先に実行を押してください。", true); return; }
  let ok = false;
  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (_) {}
  if (!ok) {
    try {
      outputEl.focus();
      outputEl.select();
      ok = document.execCommand("copy");
    } catch (_) {}
  }
  if (ok) {
    showMsg("コピーしました。ココフォリア上で Ctrl+V してください。", false);
  } else {
    outputEl.focus();
    outputEl.select();
    showMsg("自動コピー失敗。出力欄を選択しました → Ctrl+C でコピーしてください。", true);
  }
}

/* 行追加ボタン */
addRowBtn.onclick = () => {
  const tbody = document.querySelector("#statusTable tbody");
  tbody.appendChild(buildRow({ label: "", value: 0, max: 0 }));
};
