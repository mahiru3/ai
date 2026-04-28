/* =========================================
   03-js/21-chat-03-ia-001-lap.js
   21-chat/03-ia/001-lap.html 専用：横一列表形式・sticky見出し版
   - status / params をそれぞれ別アコーディオンの大きな表で管理
   - 表の見出し行はsticky（キャラ名・URL・個人チャパレ・コピーボタン）
   - ラベルのドラッグ複数選択 → 選択行を一括削除
   - チェックボックスは「削除するもの」（ON＝そのキャラから除外）
========================================= */

/* =========================================
   状態管理
========================================= */
const state = {
  charNames: [],       // ['水','金',...]
  commonStatus: [],    // [{ label, applyAll }, ...] (HP/MP/SAN以外の追加もアリ)
  commonParams: [],    // [{ label, applyAll }, ...]
  values: {},          // { '水': {'HP':12,'STR':12,...}, ... }
  perChar: [],         // [{ name, url, chatpal, excludedStatus:Set, excludedParams:Set }, ...]
  parsed: false
};

/* HP/MP/SAN を共通statusの規定 */
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

  const headerCols = lines[0].split('\t');
  const charNames = [];
  let nameStartCol = 0;
  if (headerCols[0].trim() === '') nameStartCol = 1;
  for (let i = nameStartCol; i < headerCols.length; i++) {
    const n = headerCols[i].trim();
    if (n !== '') charNames.push(n);
  }
  if (charNames.length === 0) {
    throw new Error('1行目からキャラ名が読み取れません。');
  }

  const statusLabels = [];
  const paramLabels = [];
  const values = {};
  charNames.forEach(n => values[n] = {});

  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split('\t');
    const label = (cols[0] || '').trim();
    if (!label) continue;
    if (SKIP_LABELS.includes(label.toUpperCase())) continue;

    const isStatus = STATUS_LABELS.includes(label.toUpperCase());
    if (isStatus) {
      if (!statusLabels.includes(label.toUpperCase())) statusLabels.push(label.toUpperCase());
    } else {
      if (!paramLabels.includes(label)) paramLabels.push(label);
    }

    charNames.forEach((n, ci) => {
      const v = cols[nameStartCol + ci];
      if (!isEmptyValue(v)) {
        const num = parseInt(String(v).trim(), 10);
        values[n][label] = isNaN(num) ? String(v).trim() : num;
      } else {
        // 空セル：そのキャラから除外する印として、解析後にexcludeに追加する
        values[n]['__excluded__'] = values[n]['__excluded__'] || new Set();
        values[n]['__excluded__'].add(label);
      }
    });
  }

  const orderedStatus = STATUS_LABELS.filter(l => statusLabels.includes(l));

  return {
    charNames,
    commonStatus: orderedStatus.map(l => ({ label: l, applyAll: true })),
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

    // perCharを構築（excludedStatus/excludedParamsを初期化）
    state.perChar = result.charNames.map(name => {
      const excludedAll = state.values[name]['__excluded__'] || new Set();
      const excludedStatus = new Set();
      const excludedParams = new Set();
      excludedAll.forEach(label => {
        if (state.commonStatus.find(s => s.label === label)) excludedStatus.add(label);
        else if (state.commonParams.find(p => p.label === label)) excludedParams.add(label);
      });
      return {
        name,
        url: '',
        chatpal: '',
        excludedStatus,
        excludedParams
      };
    });
    // クリーンアップ
    Object.values(state.values).forEach(v => delete v['__excluded__']);
    state.parsed = true;

    // UI描画
    renderTable('status');
    renderTable('params');

    document.getElementById('statusBox').style.display = '';
    document.getElementById('paramsBox').style.display = '';
    document.getElementById('chatpalCommonBox').style.display = '';
    document.getElementById('statusBox').open = true;
    document.getElementById('paramsBox').open = true;
    document.getElementById('chatpalCommonBox').open = true;

    if (!msgEl.textContent) {
      msgEl.textContent = `✓ 解析完了：${result.charNames.length}人 / status ${result.commonStatus.length}件 / params ${result.commonParams.length}件`;
      msgEl.className = 'small ok';
    }

    // sticky見出し1行目の高さをCSS変数に反映（解析直後）
    setTimeout(updateTheadHeights, 100);
  } catch (e) {
    msgEl.textContent = '解析エラー：' + (e && e.message ? e.message : String(e));
    msgEl.className = 'small err';
  }
}

/* =========================================
   表の描画（statusとparams共通）
   kind = 'status' | 'params'
========================================= */
function renderTable(kind) {
  const wrap = document.getElementById(kind === 'status' ? 'statusTableWrap' : 'paramsTableWrap');
  const list = kind === 'status' ? state.commonStatus : state.commonParams;
  const excludedKey = kind === 'status' ? 'excludedStatus' : 'excludedParams';

  // テーブル組み立て
  const table = document.createElement('table');
  table.className = 'lap-grand-table';

  // colgroup（列幅指定）
  const colgroup = document.createElement('colgroup');
  colgroup.innerHTML = `
    <col class="lap-col-label">
    <col class="lap-col-shared">
  `;
  state.charNames.forEach(() => {
    colgroup.innerHTML += `
      <col class="lap-col-val lap-charblock-start">
      <col class="lap-col-del">
    `;
  });
  table.appendChild(colgroup);

  // thead 1行目（ラベル / 共有 / 各キャラ名・URL・チャパレ・コピー）
  const thead = document.createElement('thead');
  const tr1 = document.createElement('tr');
  tr1.className = 'lap-thead-1';
  tr1.innerHTML = `
    <th rowspan="2">ラベル</th>
    <th rowspan="2">共有<br>✓</th>
  `;
  state.charNames.forEach((origName, ci) => {
    const pc = state.perChar[ci];
    const th = document.createElement('th');
    th.colSpan = 2;
    th.className = 'lap-charblock-start';
    th.innerHTML = `
      <div class="lap-charhead">
        <div class="lap-charhead-name">
          <span class="lap-charhead-idx">${ci + 1}</span>
          <input type="text" class="lap-charhead-nameinput" value="${escapeAttr(pc.name)}" data-role="name">
        </div>
        <input type="text" class="lap-charhead-url" placeholder="URL" value="${escapeAttr(pc.url)}" data-role="url">
        <textarea class="lap-charhead-chatpal" placeholder="個人チャパレ" data-role="chatpal">${escapeHtml(pc.chatpal)}</textarea>
        <button class="lap-charhead-copybtn" data-role="copy">📋 このキャラをコピー</button>
      </div>
    `;
    th.querySelector('[data-role="name"]').oninput = e => {
      pc.name = e.target.value;
      // 他テーブルの同期
      syncCharHeadAcrossTables(ci, 'name', e.target.value);
    };
    th.querySelector('[data-role="url"]').oninput = e => {
      pc.url = e.target.value;
      syncCharHeadAcrossTables(ci, 'url', e.target.value);
    };
    if (kind === 'status') {
      th.querySelector('[data-role="chatpal"]').oninput = e => {
        pc.chatpal = e.target.value;
      };
      th.querySelector('[data-role="copy"]').onclick = (e) => {
        doCopyChar(ci, e.target);
      };
    }
    tr1.appendChild(th);
  });
  thead.appendChild(tr1);

  // thead 2行目（値 / 削除 のサブヘッダ）
  const tr2 = document.createElement('tr');
  tr2.className = 'lap-thead-2';
  state.charNames.forEach(() => {
    tr2.innerHTML += `<th class="lap-charblock-start">値</th><th>削除</th>`;
  });
  thead.appendChild(tr2);
  table.appendChild(thead);

  // tbody（ラベル行）
  const tbody = document.createElement('tbody');
  list.forEach((item, idx) => {
    const tr = document.createElement('tr');
    tr.dataset.label = item.label;
    if (!item.applyAll) tr.classList.add('lap-row-disabled');

    // ラベルセル（ドラッグ選択対象）
    const tdLabel = document.createElement('td');
    tdLabel.className = 'lap-cell-label';
    tdLabel.textContent = item.label;
    tdLabel.dataset.kind = kind;
    tdLabel.dataset.label = item.label;
    bindLabelDrag(tdLabel, kind);
    tr.appendChild(tdLabel);

    // 共有チェック
    const tdShared = document.createElement('td');
    tdShared.className = 'lap-cell-shared';
    tdShared.innerHTML = `<input type="checkbox" ${item.applyAll ? 'checked' : ''}>`;
    tdShared.querySelector('input').onchange = e => {
      const target = (kind === 'status' ? state.commonStatus : state.commonParams).find(x => x.label === item.label);
      if (target) target.applyAll = e.target.checked;
      renderTable(kind);  // 再描画（行のdisable切替）
      setTimeout(updateTheadHeights, 50);
    };
    tr.appendChild(tdShared);

    // 各キャラの「値」「削除」セル
    state.charNames.forEach((origName, ci) => {
      const pc = state.perChar[ci];
      const isExcluded = pc[excludedKey].has(item.label);
      const isApplied = item.applyAll && !isExcluded;

      const tdVal = document.createElement('td');
      tdVal.className = 'lap-cell-val lap-charblock-start';
      const v = state.values[origName][item.label];
      const valDisplay = (v != null) ? v : '';
      tdVal.innerHTML = `<input type="number" value="${valDisplay}" ${!item.applyAll ? 'disabled' : ''}>`;
      tdVal.querySelector('input').oninput = e => {
        const n = parseInt(e.target.value, 10);
        state.values[origName][item.label] = isNaN(n) ? 0 : n;
      };
      tr.appendChild(tdVal);

      const tdDel = document.createElement('td');
      tdDel.className = 'lap-cell-del';
      // 「削除するもの」にチェック → ON＝除外
      tdDel.innerHTML = `<input type="checkbox" ${isExcluded ? 'checked' : ''} ${!item.applyAll ? 'disabled' : ''}>`;
      tdDel.querySelector('input').onchange = e => {
        if (e.target.checked) pc[excludedKey].add(item.label);
        else pc[excludedKey].delete(item.label);
      };
      tr.appendChild(tdDel);
    });

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.innerHTML = '';
  wrap.appendChild(table);
}

/* キャラ名・URLを両テーブルで同期 */
function syncCharHeadAcrossTables(ci, role, value) {
  document.querySelectorAll('.lap-grand-table').forEach(tbl => {
    const ths = tbl.querySelectorAll('thead .lap-thead-1 th');
    // 最初の2つはrowspanの「ラベル」「共有」、その後がキャラ列
    const charTh = ths[2 + ci];
    if (!charTh) return;
    const inp = charTh.querySelector(`[data-role="${role}"]`);
    if (inp && inp.value !== value) inp.value = value;
  });
}

/* =========================================
   sticky見出しの高さをCSS変数に反映
   （見出し1行目の高さを取得して、見出し2行目のtopに使う）
========================================= */
function updateTheadHeights() {
  document.querySelectorAll('.lap-grand-table').forEach(tbl => {
    const tr1 = tbl.querySelector('thead .lap-thead-1');
    if (!tr1) return;
    const h = tr1.getBoundingClientRect().height;
    tbl.style.setProperty('--lap-thead-1-h', h + 'px');
  });
}
window.addEventListener('resize', updateTheadHeights);

/* =========================================
   ラベルセルのドラッグ複数選択（Excel風）+ ドラッグ移動
   - mode: 'idle' | 'selecting' | 'moving'
   - 既に選択された行のラベルセルでmousedown開始 → 移動モード
   - そうでないラベルセルでmousedown開始 → 選択モード
========================================= */
const dragState = {
  mode: 'idle',
  kind: null,            // 'status' | 'params'
  startLabel: null,
  selectedLabels: new Set(),
  // 移動モード用
  moveDropTargetLabel: null,
  moveDropPosition: null  // 'before' | 'after'
};

function bindLabelDrag(td, kind) {
  td.addEventListener('mousedown', e => {
    e.preventDefault();
    dragState.kind = kind;
    const label = td.dataset.label;

    // 既に選択された行で開始？ → 移動モード
    if (dragState.selectedLabels.has(label) && dragState.selectedLabels.size > 0) {
      dragState.mode = 'moving';
      dragState.startLabel = label;
      dragState.moveDropTargetLabel = null;
      dragState.moveDropPosition = null;
      // 視覚：選択行を半透明＋黄色
      const wrap = document.getElementById(kind === 'status' ? 'statusTableWrap' : 'paramsTableWrap');
      wrap.querySelectorAll('tbody tr').forEach(tr => {
        if (dragState.selectedLabels.has(tr.dataset.label)) tr.classList.add('lap-row-moving');
      });
      document.body.style.cursor = 'grabbing';
    } else {
      // 通常の範囲選択モード
      dragState.mode = 'selecting';
      dragState.startLabel = label;
      dragState.selectedLabels = new Set([label]);
      updateRowSelection();
    }
  });

  td.addEventListener('mouseenter', () => {
    if (dragState.kind !== kind) return;

    if (dragState.mode === 'selecting') {
      // 範囲選択：始点〜現在
      const list = (kind === 'status' ? state.commonStatus : state.commonParams).map(x => x.label);
      const startIdx = list.indexOf(dragState.startLabel);
      const curIdx = list.indexOf(td.dataset.label);
      if (startIdx < 0 || curIdx < 0) return;
      const [a, b] = startIdx <= curIdx ? [startIdx, curIdx] : [curIdx, startIdx];
      dragState.selectedLabels = new Set(list.slice(a, b + 1));
      updateRowSelection();
    } else if (dragState.mode === 'moving') {
      // 移動：ドロップ位置インジケーター
      const tr = td.closest('tr');
      if (!tr) return;
      const targetLabel = tr.dataset.label;
      // 自分自身（選択中の行）にはドロップしない
      if (dragState.selectedLabels.has(targetLabel)) {
        clearDropIndicators();
        dragState.moveDropTargetLabel = null;
        return;
      }
      // 行の上半分なら before、下半分なら after
      // mouseenterだけだとposition判定がしづらいので、mousemoveで決める
      dragState.moveDropTargetLabel = targetLabel;
      // デフォルト：before
      showDropIndicator(kind, targetLabel, 'before');
    }
  });

  // 移動時の上下判定はmousemoveで
  td.addEventListener('mousemove', e => {
    if (dragState.mode !== 'moving' || dragState.kind !== kind) return;
    const tr = td.closest('tr');
    if (!tr) return;
    const targetLabel = tr.dataset.label;
    if (dragState.selectedLabels.has(targetLabel)) {
      clearDropIndicators();
      dragState.moveDropTargetLabel = null;
      return;
    }
    const rect = tr.getBoundingClientRect();
    const isUpper = (e.clientY - rect.top) < rect.height / 2;
    const pos = isUpper ? 'before' : 'after';
    if (dragState.moveDropTargetLabel !== targetLabel || dragState.moveDropPosition !== pos) {
      dragState.moveDropTargetLabel = targetLabel;
      dragState.moveDropPosition = pos;
      showDropIndicator(kind, targetLabel, pos);
    }
  });
}

function showDropIndicator(kind, targetLabel, position) {
  clearDropIndicators();
  const wrap = document.getElementById(kind === 'status' ? 'statusTableWrap' : 'paramsTableWrap');
  if (!wrap) return;
  const tr = wrap.querySelector(`tbody tr[data-label="${cssEscape(targetLabel)}"]`);
  if (!tr) return;
  tr.classList.add(position === 'before' ? 'lap-row-drop-before' : 'lap-row-drop-after');
}
function clearDropIndicators() {
  document.querySelectorAll('.lap-row-drop-before, .lap-row-drop-after').forEach(tr => {
    tr.classList.remove('lap-row-drop-before', 'lap-row-drop-after');
  });
}

document.addEventListener('mouseup', () => {
  if (dragState.mode === 'moving') {
    // 移動を確定
    if (dragState.moveDropTargetLabel) {
      pushUndoSnapshot('move');
      executeMove(dragState.kind, dragState.moveDropTargetLabel, dragState.moveDropPosition);
    }
    // 視覚クリーンアップ
    document.querySelectorAll('.lap-row-moving').forEach(tr => tr.classList.remove('lap-row-moving'));
    clearDropIndicators();
    document.body.style.cursor = '';
  }
  dragState.mode = 'idle';
  dragState.moveDropTargetLabel = null;
  dragState.moveDropPosition = null;
});

/* CSS用文字列エスケープ */
function cssEscape(s) {
  if (window.CSS && CSS.escape) return CSS.escape(s);
  return String(s).replace(/[^\w\u00A0-\uFFFF-]/g, '\\$&');
}

/* 移動を反映 */
function executeMove(kind, targetLabel, position) {
  const listKey = kind === 'status' ? 'commonStatus' : 'commonParams';
  const list = state[listKey];
  const movingLabels = [...dragState.selectedLabels];
  // 移動対象を順番通りに取り出し
  const movingItems = list.filter(x => movingLabels.includes(x.label));
  const remaining = list.filter(x => !movingLabels.includes(x.label));
  // ターゲットの位置を決定
  let targetIdx = remaining.findIndex(x => x.label === targetLabel);
  if (targetIdx < 0) return;
  if (position === 'after') targetIdx++;
  // 挿入
  const newList = [...remaining.slice(0, targetIdx), ...movingItems, ...remaining.slice(targetIdx)];
  state[listKey] = newList;
  renderTable(kind);
  setTimeout(updateTheadHeights, 50);
}

function updateRowSelection() {
  const wrap = document.getElementById(dragState.kind === 'status' ? 'statusTableWrap' : 'paramsTableWrap');
  if (!wrap) return;
  wrap.querySelectorAll('tbody tr').forEach(tr => {
    if (dragState.selectedLabels.has(tr.dataset.label)) tr.classList.add('lap-row-selected');
    else tr.classList.remove('lap-row-selected');
  });
}

/* 範囲外をクリックしたら選択解除 */
document.addEventListener('click', e => {
  if (e.target.closest('.lap-cell-label')) return;
  if (e.target.closest('.lap-del-btn')) return;
  if (dragState.selectedLabels.size > 0 && !e.target.closest('.lap-grand-table')) {
    dragState.selectedLabels = new Set();
    document.querySelectorAll('.lap-row-selected').forEach(tr => tr.classList.remove('lap-row-selected'));
  }
});

/* =========================================
   Undo機能（削除のみ対象）
   - 削除前にスナップショットを保存
   - Ctrl+Z で1段戻す
   - 履歴は20件まで
========================================= */
const undoStack = [];
const UNDO_LIMIT = 20;

function pushUndoSnapshot(reason) {
  // 削除と移動だけスナップショットを保存（移動も戻せると親切）
  const snap = {
    reason,
    commonStatus: state.commonStatus.map(x => ({ ...x })),
    commonParams: state.commonParams.map(x => ({ ...x })),
    values: deepCloneValues(state.values),
    perChar: state.perChar.map(pc => ({
      name: pc.name,
      url: pc.url,
      chatpal: pc.chatpal,
      excludedStatus: new Set(pc.excludedStatus),
      excludedParams: new Set(pc.excludedParams)
    }))
  };
  undoStack.push(snap);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
}

function deepCloneValues(v) {
  const out = {};
  Object.keys(v).forEach(charName => {
    out[charName] = { ...v[charName] };
  });
  return out;
}

function doUndo() {
  if (undoStack.length === 0) {
    showToast('元に戻せる操作はありません');
    return;
  }
  const snap = undoStack.pop();
  state.commonStatus = snap.commonStatus;
  state.commonParams = snap.commonParams;
  state.values = snap.values;
  state.perChar = snap.perChar;
  renderTable('status');
  renderTable('params');
  setTimeout(updateTheadHeights, 50);
  showToast(`元に戻しました（${snap.reason === 'delete' ? '削除' : '移動'}）`);
}

/* Ctrl+Z でUndo */
document.addEventListener('keydown', e => {
  // テキスト入力中は通常のCtrl+Zを優先
  const target = e.target;
  if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    doUndo();
  }
});

/* トースト通知 */
let _toastEl = null;
function showToast(msg) {
  if (_toastEl) _toastEl.remove();
  _toastEl = document.createElement('div');
  _toastEl.className = 'lap-undo-toast';
  _toastEl.textContent = msg;
  document.body.appendChild(_toastEl);
  setTimeout(() => {
    if (_toastEl) {
      _toastEl.classList.add('lap-toast-fadeout');
      setTimeout(() => { if (_toastEl) { _toastEl.remove(); _toastEl = null; } }, 300);
    }
  }, 2500);
}

/* =========================================
   選択行の一括削除
========================================= */
function deleteSelectedRows(kind) {
  if (dragState.selectedLabels.size === 0) {
    alert('削除する行をドラッグで選択してください。');
    return;
  }
  const labels = [...dragState.selectedLabels];
  if (!confirm(`${kind === 'status' ? 'status' : 'params'} から以下のラベルを削除しますか？\n\n${labels.join('\n')}\n\n（Ctrl+Z で元に戻せます）`)) return;

  // Undo用スナップショット
  pushUndoSnapshot('delete');

  const listKey = kind === 'status' ? 'commonStatus' : 'commonParams';
  const excludedKey = kind === 'status' ? 'excludedStatus' : 'excludedParams';

  state[listKey] = state[listKey].filter(x => !labels.includes(x.label));
  Object.values(state.values).forEach(v => labels.forEach(l => delete v[l]));
  state.perChar.forEach(pc => labels.forEach(l => pc[excludedKey].delete(l)));

  dragState.selectedLabels = new Set();
  renderTable(kind);
  setTimeout(updateTheadHeights, 50);
  showToast(`${labels.length}件削除しました（Ctrl+Z で元に戻せます）`);
}

/* =========================================
   行の追加（status / params）
========================================= */
function addCommonRow(kind) {
  const inpId = kind === 'status' ? 'newStatusLabel' : 'newParamLabel';
  const inp = document.getElementById(inpId);
  const label = inp.value.trim();
  if (!label) return;

  const listKey = kind === 'status' ? 'commonStatus' : 'commonParams';
  const otherKey = kind === 'status' ? 'commonParams' : 'commonStatus';

  if (state[listKey].some(x => x.label === label)) {
    alert('同じラベルが既に存在します。');
    return;
  }
  if (state[otherKey].some(x => x.label === label)) {
    alert(`「${label}」は${kind === 'status' ? 'params' : 'status'}側に存在します。`);
    return;
  }
  if (SKIP_LABELS.includes(label.toUpperCase())) {
    alert(`「${label}」は予約ラベル（DBはチャパレ側で扱います）。`);
    return;
  }

  state[listKey].push({ label, applyAll: true });
  // 値は0で初期化
  state.charNames.forEach(n => {
    if (!(label in state.values[n])) state.values[n][label] = 0;
  });

  inp.value = '';
  renderTable(kind);
  setTimeout(updateTheadHeights, 50);
}

/* =========================================
   チャットパレット組み立て
========================================= */
const RE_FIXED_LINE = /^(CCB<=)\s*(\d+)\s*【([^】]+)】\s*$/;
const RE_FORM_LINE  = /^CCB<=\s*(\{[^}]+\}\s*\*\s*\d+)\s*【([^】]+)】\s*$/;

function rewriteCCBLine(line) {
  const mf = line.match(RE_FIXED_LINE);
  if (mf) return `CCB<=${mf[2].trim()}{BA} 　〈${mf[3].trim()}〉`;
  const mv = line.match(RE_FORM_LINE);
  if (mv) return `CCB<=${mv[1].trim()}{BA} 　〈${mv[2].trim().replace(/\s/g, '')}〉`;
  return line;
}

function buildCommands(perCharChatpal) {
  const commonRaw = document.getElementById('commonChatpal').value || '';
  const personalRaw = perCharChatpal || '';

  const commonLines = commonRaw.split(/\r?\n/);
  const personalLines = personalRaw.split(/\r?\n/);

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
  if (ccbLines.length > 0 || otherLines.length > 0) out.push('✨よく使う✨');
  ccbLines.forEach(l => out.push(l));
  otherLines.forEach(l => out.push(l));

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

  // status配列：commonStatusの並び順、共有OFF or 個別除外は出さない
  const status = [];
  state.commonStatus.forEach(item => {
    if (!item.applyAll) return;
    if (pc.excludedStatus.has(item.label)) return;
    const val = v[item.label] != null ? v[item.label] : 0;
    status.push({ label: item.label, value: val, max: val });
  });

  // params配列
  const params = [];
  state.commonParams.forEach(item => {
    if (!item.applyAll) return;
    if (pc.excludedParams.has(item.label)) return;
    const val = v[item.label] != null ? v[item.label] : 0;
    params.push({ label: item.label, value: String(val) });
  });

  const commands = buildCommands(pc.chatpal);

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
      btnEl.textContent = '✓ コピー！Ctrl+Vで貼付';
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
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]
  ));
}
function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
