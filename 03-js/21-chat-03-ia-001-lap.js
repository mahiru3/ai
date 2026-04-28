/* =========================================
   03-js/21-chat-03-ia-001-lap.js
   21-chat/03-ia/001-lap.html 専用：いあきゃら→ココフォリア一括変換ロジック
   - スプレッドシートTSV解析（1行目=キャラ名、2行目以降=ラベル+値）
   - HP/MP/SAN = 共通status / DB = チャパレ側で扱う / それ以外 = 共通params
   - 共通params：並び順変更・全員適用切替・追加
   - 各キャラ：name・URL・status値・params値・個別追加削除・個人チャパレ・個別コピー
   - 共通チャパレ：全員のcommands先頭に挿入
========================================= */

/* =========================================
   状態管理
========================================= */
const state = {
  charNames: [],       // ['水','金',...]
  commonStatus: [],    // ['HP','MP','SAN']（順番）
  commonParams: [],    // [{ label:'STR', applyAll:true }, ...]
  values: {},          // { '水': {'HP':12,'STR':12,...}, ... }
  perChar: [],         // [{ name, url, chatpal, excludedParams:Set, extraParams:[{label,value}] }, ...]
  parsed: false        // 解析済みかどうか
};

/* HP/MP/SAN を共通statusの規定順とする */
const STATUS_LABELS = ['HP', 'MP', 'SAN'];

/* DBはチャパレ側で扱うのでstatus/paramsには入れない */
const SKIP_LABELS = ['DB'];

/* 値が空・N/A・- などの場合は「適用しない」扱い */
function isEmptyValue(v) {
  if (v == null) return true;
  const s = String(v).trim();
  if (s === '' || s === '-' || s === '－' || /^n\/?a$/i.test(s)) return true;
  return false;
}

/* =========================================
   TSV解析
========================================= */
function parseTSV(tsv) {
  const lines = tsv.replace(/\r\n?/g, '\n').split('\n').filter(l => l.trim() !== '');
  if (lines.length < 2) {
    throw new Error('行数が足りません。1行目にキャラ名、2行目以降にラベル+値を貼り付けてください。');
  }

  // 1行目：キャラ名（先頭の空セルはスキップ）
  const headerCols = lines[0].split('\t');
  const charNames = [];
  let nameStartCol = 0;
  // 先頭が空ならラベル列として扱う
  if (headerCols[0].trim() === '') {
    nameStartCol = 1;
  }
  for (let i = nameStartCol; i < headerCols.length; i++) {
    const n = headerCols[i].trim();
    if (n !== '') charNames.push(n);
  }
  if (charNames.length === 0) {
    throw new Error('1行目からキャラ名が読み取れません。');
  }

  // 2行目以降：ラベル + N人分の値
  const statusLabels = [];
  const paramLabels = [];
  const values = {};
  charNames.forEach(n => values[n] = {});

  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split('\t');
    const label = (cols[0] || '').trim();
    if (!label) continue;
    if (SKIP_LABELS.includes(label.toUpperCase())) continue;  // DBはスキップ

    const isStatus = STATUS_LABELS.includes(label.toUpperCase());
    if (isStatus) {
      if (!statusLabels.includes(label.toUpperCase())) statusLabels.push(label.toUpperCase());
    } else {
      if (!paramLabels.includes(label)) paramLabels.push(label);
    }

    // 値をキャラごとに取り込む
    charNames.forEach((n, ci) => {
      const v = cols[nameStartCol + ci];
      if (!isEmptyValue(v)) {
        const num = parseInt(String(v).trim(), 10);
        values[n][label] = isNaN(num) ? String(v).trim() : num;
      }
    });
  }

  // STATUS_LABELSの順序通り並べ替え（HP→MP→SAN）
  const orderedStatus = STATUS_LABELS.filter(l => statusLabels.includes(l));

  return {
    charNames,
    commonStatus: orderedStatus,
    commonParams: paramLabels.map(l => ({ label: l, applyAll: true })),
    values
  };
}

/* =========================================
   解析ボタン処理
========================================= */
function doParseTSV() {
  const msgEl = document.getElementById('parseMsg');
  msgEl.textContent = '';
  msgEl.className = 'small';

  try {
    const tsv = document.getElementById('tsvInput').value;
    if (!tsv.trim()) throw new Error('TSVを貼り付けてから押してください。');

    const result = parseTSV(tsv);

    // 人数チェック（警告のみ・処理は続行）
    const expectedCount = parseInt(document.getElementById('charCount').value, 10);
    if (result.charNames.length !== expectedCount) {
      msgEl.textContent = `⚠ 人数選択(${expectedCount}人)とTSVのキャラ数(${result.charNames.length}人)が違います。TSV準拠で進めます。`;
      msgEl.className = 'small err';
    }

    // stateに保存
    state.charNames = result.charNames;
    state.commonStatus = result.commonStatus;
    state.commonParams = result.commonParams;
    state.values = result.values;
    state.perChar = result.charNames.map(name => ({
      name,
      url: '',
      chatpal: '',
      excludedParams: new Set(),
      extraParams: []
    }));
    state.parsed = true;

    // UI描画
    renderCommonStatus();
    renderCommonParams();
    renderCharCards();

    document.getElementById('commonBox').style.display = '';
    document.getElementById('chatpalCommonBox').style.display = '';
    document.getElementById('charsBox').style.display = '';

    // セクションを開く
    document.getElementById('commonBox').open = true;
    document.getElementById('chatpalCommonBox').open = true;
    document.getElementById('charsBox').open = true;

    if (!msgEl.textContent) {
      msgEl.textContent = `✓ 解析完了：${result.charNames.length}人 / status ${result.commonStatus.length}件 / params ${result.commonParams.length}件`;
      msgEl.className = 'small ok';
    }
  } catch (e) {
    msgEl.textContent = '解析エラー：' + (e && e.message ? e.message : String(e));
    msgEl.className = 'small err';
  }
}

/* =========================================
   共通status描画（並び替えのみ）
========================================= */
function renderCommonStatus() {
  const tbody = document.querySelector('#commonStatusTable tbody');
  tbody.innerHTML = '';
  state.commonStatus.forEach(label => {
    const tr = document.createElement('tr');
    tr.draggable = true;
    tr.dataset.label = label;
    tr.innerHTML = `
      <td class="drag" title="ドラッグで並び替え">↕</td>
      <td>${label}</td>
    `;
    bindRowDragForOrder(tr, tbody, () => {
      state.commonStatus = [...tbody.querySelectorAll('tr')].map(t => t.dataset.label);
      renderCharCards();
    });
    tbody.appendChild(tr);
  });
}

/* =========================================
   共通params描画（並び替え・全員適用・削除・追加）
========================================= */
function renderCommonParams() {
  const tbody = document.querySelector('#commonParamsTable tbody');
  tbody.innerHTML = '';
  state.commonParams.forEach((p, i) => {
    const tr = document.createElement('tr');
    tr.draggable = true;
    tr.dataset.label = p.label;
    tr.innerHTML = `
      <td class="drag" title="ドラッグで並び替え">↕</td>
      <td>${escapeHtml(p.label)}</td>
      <td class="apply-cell">
        <input type="checkbox" ${p.applyAll ? 'checked' : ''} data-role="applyAll">
      </td>
      <td class="apply-cell">
        <button class="lap-mini-btn" data-role="del">削除</button>
      </td>
    `;
    // 全員適用切替
    tr.querySelector('[data-role="applyAll"]').onchange = (e) => {
      const idx = state.commonParams.findIndex(x => x.label === p.label);
      if (idx >= 0) state.commonParams[idx].applyAll = e.target.checked;
      renderCharCards();
    };
    // 削除
    tr.querySelector('[data-role="del"]').onclick = () => {
      if (!confirm(`共通paramsから「${p.label}」を削除しますか？\n（各キャラの値も失われます）`)) return;
      state.commonParams = state.commonParams.filter(x => x.label !== p.label);
      Object.values(state.values).forEach(v => delete v[p.label]);
      renderCommonParams();
      renderCharCards();
    };
    bindRowDragForOrder(tr, tbody, () => {
      const newOrder = [...tbody.querySelectorAll('tr')].map(t => t.dataset.label);
      state.commonParams = newOrder.map(l => state.commonParams.find(x => x.label === l));
      renderCharCards();
    });
    tbody.appendChild(tr);
  });
}

/* 共通paramsに新規追加 */
function addCommonParam() {
  const inp = document.getElementById('newParamLabel');
  const label = inp.value.trim();
  if (!label) return;
  if (state.commonParams.some(p => p.label === label)) {
    alert('同じラベルが既に存在します。');
    return;
  }
  if (STATUS_LABELS.includes(label.toUpperCase()) || SKIP_LABELS.includes(label.toUpperCase())) {
    alert(`「${label}」は予約ラベルです（HP/MP/SAN/DB）。共通paramsには追加できません。`);
    return;
  }
  state.commonParams.push({ label, applyAll: true });
  // 値は未入力（各キャラのvalueは空のまま、カードで個別入力）
  state.charNames.forEach(n => {
    if (!(label in state.values[n])) state.values[n][label] = 0;
  });
  inp.value = '';
  renderCommonParams();
  renderCharCards();
}

/* =========================================
   キャラカード描画
========================================= */
function renderCharCards() {
  const wrap = document.getElementById('charCards');
  wrap.innerHTML = '';

  state.charNames.forEach((origName, ci) => {
    const pc = state.perChar[ci];
    const card = document.createElement('div');
    card.className = 'lap-card';

    // ヘッダ：番号 + 名前入力
    const header = document.createElement('div');
    header.className = 'lap-card-header';
    header.innerHTML = `
      <span class="lap-card-idx">${ci + 1}</span>
      <input type="text" class="lap-card-name" value="${escapeAttr(pc.name)}" data-role="name">
    `;
    header.querySelector('[data-role="name"]').oninput = e => {
      pc.name = e.target.value;
    };
    card.appendChild(header);

    // URL欄
    const urlRow = document.createElement('div');
    urlRow.className = 'lap-card-url-row';
    urlRow.innerHTML = `
      <input type="text" class="lap-card-url" placeholder="いあきゃらURL（例: https://iachara.com/view/XXXXXXXX）" value="${escapeAttr(pc.url)}" data-role="url">
    `;
    urlRow.querySelector('[data-role="url"]').oninput = e => {
      pc.url = e.target.value;
    };
    card.appendChild(urlRow);

    // status編集
    const statusBlock = document.createElement('div');
    statusBlock.className = 'lap-card-block';
    statusBlock.innerHTML = `<div class="lap-card-block-title">status（HP/MP/SAN）</div>`;
    const sTable = document.createElement('table');
    sTable.className = 'lap-card-table';
    sTable.innerHTML = `
      <thead>
        <tr><th>ラベル</th><th style="width:5rem">値</th><th style="width:5rem">最大</th></tr>
      </thead>
      <tbody></tbody>
    `;
    const sBody = sTable.querySelector('tbody');
    state.commonStatus.forEach(label => {
      const cur = state.values[origName][label];
      const initVal = (cur != null) ? cur : 0;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${label}</td>
        <td><input type="number" data-role="val" value="${initVal}"></td>
        <td><input type="number" data-role="max" value="${initVal}"></td>
      `;
      tr.querySelector('[data-role="val"]').oninput = e => {
        state.values[origName][label] = parseInt(e.target.value, 10) || 0;
      };
      // maxは別管理：state.values[origName]['__max__'+label] にしまう
      const maxKey = '__max__' + label;
      if (state.values[origName][maxKey] == null) state.values[origName][maxKey] = initVal;
      tr.querySelector('[data-role="max"]').value = state.values[origName][maxKey];
      tr.querySelector('[data-role="max"]').oninput = e => {
        state.values[origName][maxKey] = parseInt(e.target.value, 10) || 0;
      };
      sBody.appendChild(tr);
    });
    statusBlock.appendChild(sTable);
    card.appendChild(statusBlock);

    // params編集
    const paramsBlock = document.createElement('div');
    paramsBlock.className = 'lap-card-block';
    paramsBlock.innerHTML = `<div class="lap-card-block-title">params（能力値・技能）</div>`;
    const pTable = document.createElement('table');
    pTable.className = 'lap-card-table';
    pTable.innerHTML = `
      <thead>
        <tr>
          <th>ラベル</th>
          <th style="width:5rem">値</th>
          <th class="lap-toggle-cell">適用</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const pBody = pTable.querySelector('tbody');

    // 共通params
    state.commonParams.forEach(p => {
      const cur = state.values[origName][p.label];
      const tr = document.createElement('tr');
      const isExcluded = pc.excludedParams.has(p.label);
      const isApplied = p.applyAll && !isExcluded;
      if (!isApplied) tr.classList.add('lap-row-disabled');

      tr.innerHTML = `
        <td>${escapeHtml(p.label)}</td>
        <td><input type="number" data-role="val" value="${cur != null ? cur : ''}" ${!isApplied ? 'disabled' : ''}></td>
        <td class="lap-toggle-cell">
          <input type="checkbox" data-role="apply" ${isApplied ? 'checked' : ''} ${!p.applyAll ? 'disabled' : ''}>
        </td>
      `;
      tr.querySelector('[data-role="val"]').oninput = e => {
        const n = parseInt(e.target.value, 10);
        state.values[origName][p.label] = isNaN(n) ? 0 : n;
      };
      tr.querySelector('[data-role="apply"]').onchange = e => {
        if (e.target.checked) pc.excludedParams.delete(p.label);
        else pc.excludedParams.add(p.label);
        renderCharCards();
      };
      pBody.appendChild(tr);
    });

    // 個別追加されたparams
    pc.extraParams.forEach((ep, epi) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input type="text" data-role="exLabel" value="${escapeAttr(ep.label)}"></td>
        <td><input type="number" data-role="exVal" value="${ep.value}"></td>
        <td class="lap-del-cell">
          <button class="lap-mini-btn" data-role="exDel">×</button>
        </td>
      `;
      tr.querySelector('[data-role="exLabel"]').oninput = e => { ep.label = e.target.value; };
      tr.querySelector('[data-role="exVal"]').oninput = e => {
        const n = parseInt(e.target.value, 10);
        ep.value = isNaN(n) ? 0 : n;
      };
      tr.querySelector('[data-role="exDel"]').onclick = () => {
        pc.extraParams.splice(epi, 1);
        renderCharCards();
      };
      pBody.appendChild(tr);
    });
    paramsBlock.appendChild(pTable);

    // 個別追加UI
    const addRow = document.createElement('div');
    addRow.className = 'lap-card-add-row';
    addRow.innerHTML = `
      <input type="text" placeholder="追加ラベル" data-role="addLabel">
      <input type="number" placeholder="値" class="lap-add-val" data-role="addVal" value="0">
      <button class="lap-card-add-btn" data-role="addBtn">＋</button>
    `;
    addRow.querySelector('[data-role="addBtn"]').onclick = () => {
      const lbl = addRow.querySelector('[data-role="addLabel"]').value.trim();
      const val = parseInt(addRow.querySelector('[data-role="addVal"]').value, 10) || 0;
      if (!lbl) return;
      pc.extraParams.push({ label: lbl, value: val });
      renderCharCards();
    };
    paramsBlock.appendChild(addRow);
    card.appendChild(paramsBlock);

    // 個人チャパレ
    const chatBlock = document.createElement('div');
    chatBlock.className = 'lap-card-block';
    chatBlock.innerHTML = `<div class="lap-card-block-title">個人チャットパレット（このキャラ専用）</div>`;
    const chatTa = document.createElement('textarea');
    chatTa.className = 'lap-card-chatpal';
    chatTa.placeholder = '（任意）このキャラだけに追加するコマンド';
    chatTa.value = pc.chatpal;
    chatTa.oninput = e => { pc.chatpal = e.target.value; };
    chatBlock.appendChild(chatTa);
    card.appendChild(chatBlock);

    // コピーボタン
    const copyBtn = document.createElement('button');
    copyBtn.className = 'lap-card-copy';
    copyBtn.textContent = '📋 このキャラをコピー';
    copyBtn.onclick = () => doCopyChar(ci, copyBtn);
    card.appendChild(copyBtn);

    wrap.appendChild(card);
  });
}

/* =========================================
   ドラッグ並び替え汎用
========================================= */
function bindRowDragForOrder(tr, tbody, onReorder) {
  tr.addEventListener('dragstart', e => {
    tr.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  tr.addEventListener('dragend', () => {
    tr.classList.remove('dragging');
    if (onReorder) onReorder();
  });
  tbody.addEventListener('dragover', e => {
    e.preventDefault();
    const dragging = tbody.querySelector('tr.dragging');
    if (!dragging) return;
    const after = getDragAfterElement(tbody, e.clientY);
    if (after == null) tbody.appendChild(dragging);
    else tbody.insertBefore(dragging, after);
  });
}
function getDragAfterElement(container, y) {
  const els = [...container.querySelectorAll('tr:not(.dragging)')];
  return els.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    else return closest;
  }, { offset: Number.NEGATIVE_INFINITY }).element;
}

/* =========================================
   チャットパレット組み立て
========================================= */

/* CCB<= 系を {BA} 〈〉 形式に変換（既存ロジック流用） */
const RE_FIXED_LINE = /^(CCB<=)\s*(\d+)\s*【([^】]+)】\s*$/;
const RE_FORM_LINE  = /^CCB<=\s*(\{[^}]+\}\s*\*\s*\d+)\s*【([^】]+)】\s*$/;
function rewriteCCBLine(line) {
  const mf = line.match(RE_FIXED_LINE);
  if (mf) {
    const val   = mf[2].trim();
    const label = mf[3].trim();
    return `CCB<=${val}{BA} 　〈${label}〉`;
  }
  const mv = line.match(RE_FORM_LINE);
  if (mv) {
    const expr  = mv[1].trim();
    const label = mv[2].trim().replace(/\s/g, '');
    return `CCB<=${expr}{BA} 　〈${label}〉`;
  }
  return line;
}

/* 共通チャパレ + 個人チャパレ → 最終commands */
function buildCommands(perCharChatpal) {
  const commonRaw = document.getElementById('commonChatpal').value || '';
  const personalRaw = perCharChatpal || '';

  const commonLines = commonRaw.split(/\r?\n/);
  const personalLines = personalRaw.split(/\r?\n/);

  // 共通を1d100系とCCB系に分類
  const sanLines = [];
  const ccbLines = [];
  const otherLines = [];
  commonLines.forEach(l => {
    const t = l.trim();
    if (!t) return;
    if (/^1d100/i.test(t)) sanLines.push(l);
    else if (/^CCB<=/i.test(t)) ccbLines.push(rewriteCCBLine(l));
    else otherLines.push(l);
  });

  const out = [];
  out.push(':SAN-1');
  out.push(':SAN+1');
  sanLines.forEach(l => out.push(l));
  if (ccbLines.length > 0 || otherLines.length > 0) {
    out.push('✨よく使う✨');
  }
  ccbLines.forEach(l => out.push(l));
  otherLines.forEach(l => out.push(l));

  // 個人チャパレ（CCB系のみ変換、それ以外そのまま）
  if (personalRaw.trim()) {
    out.push('');
    personalLines.forEach(l => {
      const t = l.trim();
      if (!t) { out.push(''); return; }
      if (/^CCB<=/i.test(t)) out.push(rewriteCCBLine(l));
      else out.push(l);
    });
  }

  return out.join('\n');
}

/* =========================================
   キャラごとのClipboard JSON生成・コピー
========================================= */
function buildCharData(ci) {
  const origName = state.charNames[ci];
  const pc = state.perChar[ci];
  const v = state.values[origName];

  // status配列
  const status = state.commonStatus.map(label => {
    const val = v[label] != null ? v[label] : 0;
    const max = v['__max__' + label] != null ? v['__max__' + label] : val;
    return { label, value: val, max };
  });

  // params配列（共通の有効なもの + 個別追加）
  const params = [];
  state.commonParams.forEach(p => {
    if (!p.applyAll) return;
    if (pc.excludedParams.has(p.label)) return;
    const val = v[p.label] != null ? v[p.label] : 0;
    params.push({ label: p.label, value: String(val) });
  });
  pc.extraParams.forEach(ep => {
    if (ep.label.trim()) params.push({ label: ep.label, value: String(ep.value) });
  });

  // commands
  const commands = buildCommands(pc.chatpal);

  // ココフォリアClipboard形式
  const data = {
    name: pc.name,
    initiative: 0,
    status,
    params,
    commands
  };
  if (pc.url.trim()) data.externalUrl = pc.url.trim();

  return { kind: 'character', data };
}

async function doCopyChar(ci, btnEl) {
  try {
    const obj = buildCharData(ci);
    const text = JSON.stringify(obj);

    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch (_) {}
    if (!ok) {
      // フォールバック：一時textareaで execCommand
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
    }

    if (ok) {
      const orig = btnEl.textContent;
      btnEl.textContent = '✓ コピー完了！ココフォリアでCtrl+V';
      btnEl.classList.add('copied');
      setTimeout(() => {
        btnEl.textContent = orig;
        btnEl.classList.remove('copied');
      }, 2000);
    } else {
      alert('自動コピー失敗。コンソールから手動でJSONを取得してください。');
      console.log(text);
    }
  } catch (e) {
    alert('コピーエラー: ' + (e && e.message ? e.message : String(e)));
  }
}

/* =========================================
   ユーティリティ
========================================= */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}
function escapeAttr(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
