/* =========================================
   03-js/21-chat-03-ia-002-many.js
   21-chat/03-ia/002-many.html 専用：複数キャラ対応・拡張版
   - 入力：TSV貼り付け / いあきゃらJSONを1人ずつ追加
   - status / params の横一列表（キャラ名見出しsticky、ラベル・移動・共有列が左固定）
   - ラベルのドラッグ選択／ドラッグ移動／↑↓矢印で1行移動
   - 「共有」は全員の「削除」一括切替マスタースイッチ
   - 共通paramsの上限機能（超過値→「N-X」表記）
   - チャパレ編集：1)共通 / 2)個別 / 3)params転記レイアウト / 4)統合プレビュー
   - 5)テキスト作成（ロールテーブル）
   - LocalStorage保存・JSONエクスポート/インポート
========================================= */

/* =========================================
   状態管理
========================================= */
const state = {
  charNames: [],       // ['水','金',...]
  commonStatus: [],    // [{ label }, ...] (HP/MP/SAN以外の追加もアリ)
  commonParams: [],    // [{ label }, ...]
  values: {},          // { '水': {'HP':12,'STR':12,...}, ... }
  perChar: [],         // [{ name, url, chatpal2, chatpal3, excludedStatus:Set, excludedParams:Set }, ...]
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
        const value = isNaN(num) ? String(v).trim() : num;
        values[n][label] = value;
        // params側は「素の数値」もbase領域に保存（上限機能で参照）
        if (!isStatus && typeof value === 'number') {
          values[n]['__base__' + label] = value;
        }
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
    commonStatus: orderedStatus.map(l => ({ label: l })),
    commonParams: paramLabels.map(l => ({ label: l })),
    values
  };
}

/* =========================================
   いあきゃらモード：JSON蓄積リスト
========================================= */
let _iacharaList = [];  // [{ name, externalUrl, iconUrl, initiative, status:[], params:[], commands }, ...]

/* 入力モード取得 */
function getInputMode() {
  const r = document.querySelector('input[name="inputMode"]:checked');
  return r ? r.value : 'tsv';
}

function onInputModeChange() {
  const mode = getInputMode();
  document.getElementById('modeTsvArea').style.display = (mode === 'tsv') ? '' : 'none';
  document.getElementById('modeIacharaArea').style.display = (mode === 'iachara') ? '' : 'none';
}

/* 「➕ 追加」：textarea中のJSONをパースしてリストに追加 */
function addIacharaJson() {
  const msgEl = document.getElementById('iacharaMsg');
  msgEl.textContent = '';
  msgEl.className = 'small';

  try {
    const ta = document.getElementById('iacharaInput');
    const raw = ta.value.trim();
    if (!raw) throw new Error('JSONを貼り付けてください。');

    let obj = JSON.parse(raw);
    // {kind:"character",data:{...}} or 直接data
    if (obj && obj.kind === 'character' && obj.data) obj = obj.data;
    if (!obj || typeof obj !== 'object') throw new Error('不正なJSONです。');

    const entry = {
      name: obj.name || '(名前なし)',
      externalUrl: obj.externalUrl || '',
      iconUrl: obj.iconUrl || '',
      initiative: obj.initiative || 0,
      status: Array.isArray(obj.status) ? obj.status : [],
      params: Array.isArray(obj.params) ? obj.params : [],
      commands: typeof obj.commands === 'string' ? obj.commands : ''
    };
    _iacharaList.push(entry);
    ta.value = '';
    renderIacharaList();
    msgEl.textContent = `✓ 追加: ${entry.name}（合計 ${_iacharaList.length} 人）`;
    msgEl.className = 'small ok';
  } catch (e) {
    msgEl.textContent = '追加エラー：' + (e && e.message ? e.message : String(e));
    msgEl.className = 'small err';
  }
}

/* リスト描画 */
function renderIacharaList() {
  const wrap = document.getElementById('iacharaList');
  const cnt = document.getElementById('iacharaCount');
  if (!wrap) return;
  wrap.innerHTML = '';
  if (cnt) cnt.textContent = _iacharaList.length;
  _iacharaList.forEach((entry, idx) => {
    const row = document.createElement('div');
    row.className = 'lap-iachara-row';
    const meta = [];
    if (entry.status.length) meta.push(`status ${entry.status.length}`);
    if (entry.params.length) meta.push(`params ${entry.params.length}`);
    if (entry.externalUrl) meta.push('URL✓');
    row.innerHTML = `
      <span class="lap-iachara-idx">${idx + 1}.</span>
      <span class="lap-iachara-name">${escapeHtml(entry.name)}</span>
      <span class="lap-iachara-meta">${meta.join(' / ')}</span>
      <button type="button" class="lap-iachara-del">×</button>
    `;
    row.querySelector('.lap-iachara-del').onclick = () => {
      _iacharaList.splice(idx, 1);
      renderIacharaList();
    };
    wrap.appendChild(row);
  });
}

/* commandsからCCB<=N 【ラベル】 固定値型を抽出 */
const RE_CCB_FIXED_FROM_COMMANDS = /^CCB<=\s*(\d+)\s*【([^】]+)】\s*$/;
function extractSkillsFromCommands(commands) {
  const skills = [];  // [{ label, value:Number }]
  if (!commands) return skills;
  const lines = commands.replace(/\\n/g, '\n').replace(/\\r/g, '').split(/\r?\n/);
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(RE_CCB_FIXED_FROM_COMMANDS);
    if (m) {
      const value = parseInt(m[1], 10);
      const label = m[2].trim();
      if (!isNaN(value) && label) skills.push({ label, value });
    }
  }
  return skills;
}

/* いあきゃらリスト → 統合解析結果 */
function parseIacharaList(list) {
  const charNames = list.map(e => e.name);
  const values = {};
  const charMeta = [];

  // status/paramsラベルを和集合で構築（順序保持）
  const statusLabelsOrdered = [];  // STATUS_LABELS の順序を尊重
  const paramLabelsOrdered = [];

  // 各キャラを処理：内部値マップ作成 + ラベル和集合
  list.forEach((entry, ci) => {
    const name = entry.name;
    // 同名キャラ対応：内部キーをユニークにするため `name#ci` で持つが、
    // charNames配列はそのままnameを使い、valuesのキーも実は ciベースのほうが安全
    // → 簡単のため state.charNames を使う他コードと整合させるため、
    //   重複時はname末尾にカウントアップ（表示も含めて）
  });
  // 重複検知して内部キーを作成
  const nameCount = {};
  const internalNames = list.map(entry => {
    nameCount[entry.name] = (nameCount[entry.name] || 0) + 1;
    return nameCount[entry.name] > 1 ? `${entry.name} (${nameCount[entry.name]})` : entry.name;
  });
  // charNamesを内部名に置き換え
  for (let i = 0; i < charNames.length; i++) charNames[i] = internalNames[i];

  list.forEach((entry, ci) => {
    const internalName = internalNames[ci];
    values[internalName] = {};
    const excluded = new Set();

    // status: HP/MP/SAN以外も来うるが、STATUS_LABELS固定で扱う
    entry.status.forEach(s => {
      const lbl = String(s.label || '').toUpperCase();
      if (STATUS_LABELS.includes(lbl)) {
        if (!statusLabelsOrdered.includes(lbl)) statusLabelsOrdered.push(lbl);
        const valueNum = parseInt(s.value, 10);
        if (!isNaN(valueNum)) values[internalName][lbl] = valueNum;
        // maxも保存
        if (s.max != null) {
          const maxNum = parseInt(s.max, 10);
          if (!isNaN(maxNum)) values[internalName]['__max__' + lbl] = maxNum;
        }
      }
      // DBなどHP/MP/SAN以外はスキップ
    });

    // params: 能力値（STR/CON/POW...）
    entry.params.forEach(p => {
      const lbl = String(p.label || '').trim();
      if (!lbl) return;
      // 「STR × 5」のような派生は除外
      if (/[×x]\s*\d/i.test(lbl)) return;
      if (!paramLabelsOrdered.includes(lbl)) paramLabelsOrdered.push(lbl);
      const valueNum = parseInt(p.value, 10);
      if (!isNaN(valueNum)) {
        values[internalName][lbl] = valueNum;
        values[internalName]['__base__' + lbl] = valueNum;
      } else {
        // 数値でなければ文字列で保存
        values[internalName][lbl] = String(p.value);
      }
    });

    // commandsから技能ラベル抽出
    const skills = extractSkillsFromCommands(entry.commands);
    skills.forEach(({ label, value }) => {
      if (!paramLabelsOrdered.includes(label)) paramLabelsOrdered.push(label);
      values[internalName][label] = value;
      values[internalName]['__base__' + label] = value;
    });

    charMeta.push({
      url: entry.externalUrl || '',
      iconUrl: entry.iconUrl || '',
      initiative: entry.initiative || 0
    });
  });

  // 持っていないラベルは __excluded__ に追加（削除✓ON）
  const allParamLabels = new Set(paramLabelsOrdered);
  const allStatusLabels = new Set(statusLabelsOrdered);
  internalNames.forEach(name => {
    const ex = new Set();
    allStatusLabels.forEach(l => {
      if (values[name][l] == null) ex.add(l);
    });
    allParamLabels.forEach(l => {
      if (values[name][l] == null) ex.add(l);
    });
    if (ex.size > 0) values[name]['__excluded__'] = ex;
  });

  // STATUS_LABELS の規定順に並び替え
  const orderedStatus = STATUS_LABELS.filter(l => statusLabelsOrdered.includes(l));

  return {
    charNames,
    commonStatus: orderedStatus.map(l => ({ label: l })),
    commonParams: paramLabelsOrdered.map(l => ({ label: l })),
    values,
    charMeta
  };
}

/* =========================================
   解析ボタン処理（両モード対応）
   - TSVモード: tsvInput を解析
   - いあきゃらモード: _iacharaList を統合解析
========================================= */
function doParse() {
  const msgEl = document.getElementById('parseMsg');
  msgEl.textContent = '';
  msgEl.className = 'small';

  try {
    const mode = getInputMode();
    let result;
    if (mode === 'iachara') {
      if (_iacharaList.length === 0) throw new Error('「➕ 追加」でいあきゃらJSONを1人以上追加してください。');
      result = parseIacharaList(_iacharaList);
    } else {
      const tsv = document.getElementById('tsvInput').value;
      if (!tsv.trim()) throw new Error('TSVを貼り付けてから押してください。');
      result = parseTSV(tsv);
    }

    // stateに保存
    state.charNames = result.charNames;
    state.commonStatus = result.commonStatus;
    state.commonParams = result.commonParams;
    state.values = result.values;

    // perCharを構築（excludedStatus/excludedParamsを初期化）
    state.perChar = result.charNames.map((name, ci) => {
      const excludedAll = state.values[name]['__excluded__'] || new Set();
      const excludedStatus = new Set();
      const excludedParams = new Set();
      excludedAll.forEach(label => {
        if (state.commonStatus.find(s => s.label === label)) excludedStatus.add(label);
        else if (state.commonParams.find(p => p.label === label)) excludedParams.add(label);
      });
      // いあきゃらモードならURL/iconを取り込む
      const meta = (result.charMeta && result.charMeta[ci]) || {};
      return {
        name,
        url: meta.url || '',
        iconUrl: meta.iconUrl || '',
        initiative: meta.initiative || 0,
        chatpal2: '',
        chatpal3: '',
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
    initChatpalSection();

    document.getElementById('statusBox').style.display = '';
    document.getElementById('paramsBox').style.display = '';
    document.getElementById('chatpalEditBox').style.display = '';
    document.getElementById('statusBox').open = true;
    document.getElementById('paramsBox').open = true;
    document.getElementById('chatpalEditBox').open = true;

    msgEl.textContent = `✓ 解析完了：${result.charNames.length}人 / status ${result.commonStatus.length}件 / params ${result.commonParams.length}件`;
    msgEl.className = 'small ok';

    // sticky見出し1行目の高さをCSS変数に反映（解析直後）
    scheduleTheadHeightUpdate();
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
    <col class="lap-col-arrows">
    <col class="lap-col-shared">
  `;
  state.charNames.forEach(() => {
    colgroup.innerHTML += `
      <col class="lap-col-val lap-charblock-start">
      <col class="lap-col-del">
    `;
  });
  table.appendChild(colgroup);

  // thead 1行目（ラベル / ↑↓ / 共有 / 各キャラ名・URL・コピー）
  const thead = document.createElement('thead');
  const tr1 = document.createElement('tr');
  tr1.className = 'lap-thead-1';
  tr1.innerHTML = `
    <th rowspan="2" class="lap-th-label-fixed">ラベル</th>
    <th rowspan="2" class="lap-th-arrows-fixed">移動</th>
    <th rowspan="2" class="lap-th-shared-fixed">共有<br>✓</th>
  `;
  state.charNames.forEach((origName, ci) => {
    const pc = state.perChar[ci];
    const th = document.createElement('th');
    th.colSpan = 2;
    th.className = 'lap-charblock-start';
    if (kind === 'status') {
      // ②共通status：キャラ名 + URL + コピーボタン
      th.innerHTML = `
        <div class="lap-charhead">
          <div class="lap-charhead-name">
            <span class="lap-charhead-idx">${ci + 1}</span>
            <input type="text" class="lap-charhead-nameinput" value="${escapeAttr(pc.name)}" data-role="name">
          </div>
          <input type="text" class="lap-charhead-url" placeholder="URL" value="${escapeAttr(pc.url)}" data-role="url">
          <button class="lap-charhead-copybtn" data-role="copy">📋 このキャラをコピー</button>
        </div>
      `;
      th.querySelector('[data-role="url"]').oninput = e => {
        pc.url = e.target.value;
        syncCharHeadAcrossTables(ci, 'url', e.target.value);
      };
      th.querySelector('[data-role="copy"]').onclick = (e) => {
        doCopyChar(ci, e.target);
      };
    } else {
      // ③共通params：キャラ名のみ（コンパクト）
      th.innerHTML = `
        <div class="lap-charhead lap-charhead-compact">
          <div class="lap-charhead-name">
            <span class="lap-charhead-idx">${ci + 1}</span>
            <input type="text" class="lap-charhead-nameinput" value="${escapeAttr(pc.name)}" data-role="name">
          </div>
        </div>
      `;
    }
    th.querySelector('[data-role="name"]').oninput = e => {
      pc.name = e.target.value;
      // 他テーブルの同期
      syncCharHeadAcrossTables(ci, 'name', e.target.value);
      // チャパレ側のセレクトの選択肢ラベルも更新
      refreshCharSelectLabels();
    };
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
    // 区切り行（params側のみ）
    if (item.isDivider) {
      const tr = document.createElement('tr');
      tr.dataset.label = item.label;
      tr.dataset.divider = '1';
      tr.className = 'lap-row-divider';

      // ラベルセル（編集可能なテキスト、ドラッグ選択対応）
      const tdLabel = document.createElement('td');
      tdLabel.className = 'lap-cell-label lap-cell-divider-label';
      tdLabel.dataset.kind = kind;
      tdLabel.dataset.label = item.label;
      // ハンドル + テキスト編集入力欄
      tdLabel.innerHTML = `
        <span class="lap-cell-label-handle" title="ここを掴んで移動">↕</span><input type="text" class="lap-divider-input" value="${escapeAttr(item.label)}" placeholder="区切り行のテキスト">
      `;
      const dividerInp = tdLabel.querySelector('input');
      dividerInp.oninput = e => {
        // ラベル更新（ID代わりに使っているのでcommonParams側も更新）
        const newLabel = e.target.value;
        item.label = newLabel;
        tr.dataset.label = newLabel;
        tdLabel.dataset.label = newLabel;
      };
      // ドラッグ選択は input ではなく td 全体でも反応させたい：
      // input に focus している間は preventDefault しないので mousedown を td でハンドル
      bindLabelDrag(tdLabel, kind);
      bindMoveHandle(tdLabel.querySelector('.lap-cell-label-handle'), kind, item.label);
      tr.appendChild(tdLabel);

      // ↑↓矢印セル
      const tdArrows = document.createElement('td');
      tdArrows.className = 'lap-cell-arrows';
      const isFirst = idx === 0;
      const isLast = idx === list.length - 1;
      tdArrows.innerHTML = `
        <button type="button" class="lap-arrow-btn lap-arrow-up" data-role="up" ${isFirst ? 'disabled' : ''} title="上へ">▲</button>
        <button type="button" class="lap-arrow-btn lap-arrow-down" data-role="down" ${isLast ? 'disabled' : ''} title="下へ">▼</button>
      `;
      tdArrows.querySelector('[data-role="up"]').onclick = (e) => {
        e.stopPropagation();
        moveRowByOne(kind, item.label, -1);
      };
      tdArrows.querySelector('[data-role="down"]').onclick = (e) => {
        e.stopPropagation();
        moveRowByOne(kind, item.label, +1);
      };
      tr.appendChild(tdArrows);

      // 残りはひとつの大きなセルでスパン（共有列＋全キャラ列）
      const spanColCount = 1 + state.charNames.length * 2;  // 共有1 + (値1+削除1)*N
      const tdSpan = document.createElement('td');
      tdSpan.className = 'lap-cell-divider-span';
      tdSpan.colSpan = spanColCount;
      tdSpan.textContent = '— 区切り行（チャパレ転記時にこの位置にテキストが入ります）—';
      tr.appendChild(tdSpan);

      tbody.appendChild(tr);
      return;
    }

    const tr = document.createElement('tr');
    tr.dataset.label = item.label;

    // ラベルセル（ドラッグ選択対象）
    const tdLabel = document.createElement('td');
    tdLabel.className = 'lap-cell-label';
    tdLabel.dataset.kind = kind;
    tdLabel.dataset.label = item.label;
    // ハンドル + ラベルテキスト
    tdLabel.innerHTML = `
      <span class="lap-cell-label-handle" title="ここを掴んで移動">↕</span><span class="lap-cell-label-text">${escapeHtml(item.label)}</span>
    `;
    bindLabelDrag(tdLabel, kind);
    bindMoveHandle(tdLabel.querySelector('.lap-cell-label-handle'), kind, item.label);
    tr.appendChild(tdLabel);

    // ↑↓矢印セル（1行ずつの移動）
    const tdArrows = document.createElement('td');
    tdArrows.className = 'lap-cell-arrows';
    const isFirst = idx === 0;
    const isLast = idx === list.length - 1;
    tdArrows.innerHTML = `
      <button type="button" class="lap-arrow-btn lap-arrow-up" data-role="up" ${isFirst ? 'disabled' : ''} title="上へ">▲</button>
      <button type="button" class="lap-arrow-btn lap-arrow-down" data-role="down" ${isLast ? 'disabled' : ''} title="下へ">▼</button>
    `;
    tdArrows.querySelector('[data-role="up"]').onclick = (e) => {
      e.stopPropagation();
      moveRowByOne(kind, item.label, -1);
    };
    tdArrows.querySelector('[data-role="down"]').onclick = (e) => {
      e.stopPropagation();
      moveRowByOne(kind, item.label, +1);
    };
    tr.appendChild(tdArrows);
    // 共有チェック：「全員のexcluded状態」を見て表示
    // 全員excluded → checked（全員から削除済み）
    // 全員not excluded → unchecked（誰からも削除されていない）
    // 混在 → indeterminate
    const allExcluded = state.charNames.every((_, ci) => state.perChar[ci][excludedKey].has(item.label));
    const noneExcluded = state.charNames.every((_, ci) => !state.perChar[ci][excludedKey].has(item.label));
    const tdShared = document.createElement('td');
    tdShared.className = 'lap-cell-shared';
    tdShared.innerHTML = `<input type="checkbox" ${allExcluded ? 'checked' : ''}>`;
    const sharedCb = tdShared.querySelector('input');
    if (!allExcluded && !noneExcluded) sharedCb.indeterminate = true;
    sharedCb.onchange = e => {
      // クリックされた瞬間：全員のexcludedをON or OFFに統一
      if (e.target.checked) {
        state.charNames.forEach((_, ci) => state.perChar[ci][excludedKey].add(item.label));
      } else {
        state.charNames.forEach((_, ci) => state.perChar[ci][excludedKey].delete(item.label));
      }
      renderTable(kind);  // 個別チェックも更新するため再描画
    };
    tr.appendChild(tdShared);

    // 各キャラの「値」「削除」セル
    state.charNames.forEach((origName, ci) => {
      const pc = state.perChar[ci];
      const isExcluded = pc[excludedKey].has(item.label);

      const tdVal = document.createElement('td');
      tdVal.className = 'lap-cell-val lap-charblock-start';
      const v = state.values[origName][item.label];
      const valDisplay = (v != null) ? v : '';
      // params側はtype=textにして「105-15」のような上限処理結果も表示できるように
      const inputType = (kind === 'params') ? 'text' : 'number';
      tdVal.innerHTML = `<input type="${inputType}" value="${escapeAttr(valDisplay)}">`;
      const valInput = tdVal.querySelector('input');
      // 上限超過なら強調表示
      if (kind === 'params' && typeof valDisplay === 'string' && /^(\d+)-(\d+)$/.test(valDisplay)) {
        valInput.classList.add('lap-val-over');
      }
      valInput.oninput = e => {
        if (kind === 'params') {
          setParamValue(origName, item.label, e.target.value);
          // 上限処理結果を反映するため、フォーカスを保ちつつ値の表示は変えない
          // （ユーザーが再入力するため、即時の書き戻しはしない）
        } else {
          const n = parseInt(e.target.value, 10);
          state.values[origName][item.label] = isNaN(n) ? 0 : n;
        }
      };
      // フォーカスを失ったら、上限処理結果で表示を更新（params側のみ）
      if (kind === 'params') {
        valInput.onblur = () => {
          const cur = state.values[origName][item.label];
          if (cur != null) {
            valInput.value = cur;
            if (typeof cur === 'string' && /^(\d+)-(\d+)$/.test(cur)) {
              valInput.classList.add('lap-val-over');
            } else {
              valInput.classList.remove('lap-val-over');
            }
          }
        };
      }
      tr.appendChild(tdVal);

      const tdDel = document.createElement('td');
      tdDel.className = 'lap-cell-del';
      // 「削除するもの」にチェック → ON＝除外
      tdDel.innerHTML = `<input type="checkbox" ${isExcluded ? 'checked' : ''}>`;
      tdDel.querySelector('input').onchange = e => {
        if (e.target.checked) pc[excludedKey].add(item.label);
        else pc[excludedKey].delete(item.label);
        // 共有チェックの状態も更新する必要がある（全員/混在/誰も）
        updateSharedCheckbox(tr, kind, item.label);
      };
      tr.appendChild(tdDel);
    });

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  wrap.innerHTML = '';
  wrap.appendChild(table);
  scheduleTheadHeightUpdate();
}

/* 個別「削除」チェック変更時に、その行の共有チェックの状態を更新 */
function updateSharedCheckbox(tr, kind, label) {
  const excludedKey = kind === 'status' ? 'excludedStatus' : 'excludedParams';
  const allExcluded = state.charNames.every((_, ci) => state.perChar[ci][excludedKey].has(label));
  const noneExcluded = state.charNames.every((_, ci) => !state.perChar[ci][excludedKey].has(label));
  const sharedCb = tr.querySelector('.lap-cell-shared input[type="checkbox"]');
  if (!sharedCb) return;
  if (allExcluded) {
    sharedCb.checked = true;
    sharedCb.indeterminate = false;
  } else if (noneExcluded) {
    sharedCb.checked = false;
    sharedCb.indeterminate = false;
  } else {
    sharedCb.checked = false;
    sharedCb.indeterminate = true;
  }
}

/* キャラ名・URLを両テーブルで同期 */
function syncCharHeadAcrossTables(ci, role, value) {
  document.querySelectorAll('.lap-grand-table').forEach(tbl => {
    const ths = tbl.querySelectorAll('thead .lap-thead-1 th');
    // 最初の3つはrowspanの「ラベル」「移動」「共有」、その後がキャラ列
    const charTh = ths[3 + ci];
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
    if (h > 0) {
      tbl.style.setProperty('--lap-thead-1-h', h + 'px');
    }
    // ラベル列・矢印列の実幅をCSS変数に反映（共有・矢印の sticky left 計算用）
    const labelTh = tr1.querySelector('th.lap-th-label-fixed');
    const arrowsTh = tr1.querySelector('th.lap-th-arrows-fixed');
    if (labelTh) {
      const w = labelTh.getBoundingClientRect().width;
      if (w > 0) tbl.style.setProperty('--lap-col-label-w', w + 'px');
    }
    if (arrowsTh) {
      const w = arrowsTh.getBoundingClientRect().width;
      if (w > 0) tbl.style.setProperty('--lap-col-arrows-w', w + 'px');
    }
  });
}
window.addEventListener('resize', updateTheadHeights);
window.addEventListener('scroll', updateTheadHeights, true);

/* renderTable直後にレイアウト確定後の高さで再計測する */
function scheduleTheadHeightUpdate() {
  // レイアウト確定 → 描画後に計測
  requestAnimationFrame(() => {
    updateTheadHeights();
    // フォントロード等で更にずれる場合に備えて2フレーム後にも
    requestAnimationFrame(updateTheadHeights);
  });
}

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

/* ハンドル「↕」専用：mousedownで即座に移動モード開始
   - 選択行が無ければ、その行だけ単独選択した上で移動モード開始
   - 選択行に含まれていれば、選択行全体を移動
*/
function bindMoveHandle(handle, kind, label) {
  if (!handle) return;
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    e.stopPropagation();  // bindLabelDragへの伝播を止める
    dragState.kind = kind;

    // 既に複数選択中で、その中にこの行が含まれている → 選択全体を移動
    if (dragState.selectedLabels.has(label) && dragState.selectedLabels.size > 0) {
      // そのまま既存選択を移動対象とする
    } else {
      // この行だけを単独選択して移動対象とする
      dragState.selectedLabels = new Set([label]);
      updateRowSelection();
    }

    // 即座に移動モード開始
    dragState.mode = 'moving';
    dragState.startLabel = label;
    dragState.moveDropTargetLabel = null;
    dragState.moveDropPosition = null;
    const wrap = document.getElementById(kind === 'status' ? 'statusTableWrap' : 'paramsTableWrap');
    wrap.querySelectorAll('tbody tr').forEach(tr => {
      if (dragState.selectedLabels.has(tr.dataset.label)) tr.classList.add('lap-row-moving');
    });
    document.body.style.cursor = 'grabbing';
  });
}

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
  scheduleTheadHeightUpdate();
}

/* 矢印ボタンによる1行ずつの移動 */
function moveRowByOne(kind, label, delta) {
  const listKey = kind === 'status' ? 'commonStatus' : 'commonParams';
  const list = state[listKey];
  const idx = list.findIndex(x => x.label === label);
  if (idx < 0) return;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= list.length) return;

  pushUndoSnapshot('move');

  // 入れ替え
  const item = list[idx];
  list.splice(idx, 1);
  list.splice(newIdx, 0, item);
  renderTable(kind);
  scheduleTheadHeightUpdate();
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
      chatpal2: pc.chatpal2,
      chatpal3: pc.chatpal3,
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
  scheduleTheadHeightUpdate();
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
  scheduleTheadHeightUpdate();
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

  state[listKey].push({ label });
  // 値は0で初期化
  state.charNames.forEach(n => {
    if (!(label in state.values[n])) state.values[n][label] = 0;
  });

  inp.value = '';
  renderTable(kind);
  scheduleTheadHeightUpdate();
}

/* 区切り行をparams側に追加 */
function addDividerRow() {
  if (!state.parsed) {
    alert('先に「📋 表を解析」を実行してください。');
    return;
  }
  const text = prompt('区切り行のテキストを入力してください', '⋆͛💛⋆͛••┈┈ 学術系 ┈┈••⋆͛💛');
  if (text == null) return;
  state.commonParams.push({ label: text, isDivider: true });
  renderTable('params');
  scheduleTheadHeightUpdate();
}

/* =========================================
   チャットパレット組み立て
========================================= */

/* CCB行の書き換え：「【】を〈〉に変換」のみ。{BA}は付けない（個別2では既に整形済み） */
const RE_CCB_BRACKETS = /^(CCB<=\s*[^【]+)【([^】]+)】(\s*)$/;
function convertCCBBrackets(line) {
  const m = line.match(RE_CCB_BRACKETS);
  if (m) {
    return `${m[1].replace(/\s+$/, '')} 〈${m[2].trim()}〉${m[3]}`;
  }
  return line;
}

/* 1)+2)+3) を結合して最終チャパレを生成
   - 1) 共通：そのまま使う（ユーザーが直接編集している前提）
   - 2) 個別1（フリースペース）：そのまま追記
   - 3) 個別2（params転記レイアウト）：そのまま追記（既に整形済み）
*/
function buildCommandsForChar(ci) {
  const pc = state.perChar[ci];
  const out = [];

  const part1 = (document.getElementById('chatpal1Common').value || '').trimEnd();
  const part2 = (pc.chatpal2 || '').trimEnd();
  const part3 = (pc.chatpal3 || '').trimEnd();

  if (part1) out.push(part1);
  if (part2) {
    if (out.length > 0) out.push('');
    out.push(part2);
  }
  if (part3) {
    if (out.length > 0) out.push('');
    out.push(part3);
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

  // status配列：commonStatusの並び順、個別excluded以外は出力
  const status = [];
  state.commonStatus.forEach(item => {
    if (pc.excludedStatus.has(item.label)) return;
    const val = v[item.label] != null ? v[item.label] : 0;
    const maxKey = '__max__' + item.label;
    const max = v[maxKey] != null ? v[maxKey] : val;
    status.push({ label: item.label, value: val, max });
  });

  // params配列：同上（区切り行はスキップ）
  const params = [];
  state.commonParams.forEach(item => {
    if (item.isDivider) return;
    if (pc.excludedParams.has(item.label)) return;
    const val = v[item.label] != null ? v[item.label] : 0;
    params.push({ label: item.label, value: String(val) });
  });

  const commands = buildCommandsForChar(ci);

  const data = {
    name: pc.name,
    initiative: pc.initiative || 0,
    status,
    params,
    commands
  };
  if (pc.url && pc.url.trim()) data.externalUrl = pc.url.trim();
  if (pc.iconUrl && pc.iconUrl.trim()) data.iconUrl = pc.iconUrl.trim();

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
   ④ チャパレ編集セクション
   - 1) 共通：全員共通のチャパレ（textareaを直接編集）
   - 2) 個別1：キャラごとフリースペース
   - 3) 個別2：キャラごとのparams転記レイアウト
   - 4) 統合：1)+2)+3)の最終結合プレビュー
========================================= */

/* 1) 共通のデフォルト値 */
const DEFAULT_CHATPAL_1 = `1d100<={SAN}　🕯️正気度ロール🕯️
:SAN-
:HP-`;

/* チャパレ編集セクションの初期化（解析時に呼ばれる） */
function initChatpalSection() {
  // 1) 共通のデフォルト値（未入力なら）
  const ta1 = document.getElementById('chatpal1Common');
  if (!ta1.value.trim()) ta1.value = DEFAULT_CHATPAL_1;

  // セレクト初期化
  refreshCharSelectLabels();

  // 2)3)4)のセレクト変更時にtextareaを切り替え
  const sel2 = document.getElementById('chatpal2CharSel');
  const sel3 = document.getElementById('chatpal3CharSel');
  const sel4 = document.getElementById('chatpal4CharSel');
  sel2.onchange = () => loadChatpal2(parseInt(sel2.value, 10));
  sel3.onchange = () => loadChatpal3(parseInt(sel3.value, 10));
  sel4.onchange = () => doBuildIntegrated();

  // 2)3)textareaの編集を保存
  document.getElementById('chatpal2Personal').oninput = e => {
    const ci = parseInt(sel2.value, 10);
    if (!isNaN(ci) && state.perChar[ci]) state.perChar[ci].chatpal2 = e.target.value;
  };
  document.getElementById('chatpal3Layout').oninput = e => {
    const ci = parseInt(sel3.value, 10);
    if (!isNaN(ci) && state.perChar[ci]) state.perChar[ci].chatpal3 = e.target.value;
  };

  // 初回ロード（1人目）
  loadChatpal2(0);
  loadChatpal3(0);
}

/* セレクトのoptionラベルを更新（キャラ名変更時に呼ばれる） */
function refreshCharSelectLabels() {
  ['chatpal2CharSel', 'chatpal3CharSel', 'chatpal4CharSel'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prevValue = sel.value;
    sel.innerHTML = '';
    state.charNames.forEach((origName, ci) => {
      const op = document.createElement('option');
      op.value = ci;
      op.textContent = `${ci + 1}. ${state.perChar[ci].name}`;
      sel.appendChild(op);
    });
    if (prevValue !== '' && state.charNames[parseInt(prevValue, 10)]) {
      sel.value = prevValue;
    }
  });
}

/* 2)個別1のロード */
function loadChatpal2(ci) {
  if (isNaN(ci) || !state.perChar[ci]) return;
  document.getElementById('chatpal2Personal').value = state.perChar[ci].chatpal2 || '';
}

/* 3)個別2のロード */
function loadChatpal3(ci) {
  if (isNaN(ci) || !state.perChar[ci]) return;
  document.getElementById('chatpal3Layout').value = state.perChar[ci].chatpal3 || '';
}

/* =========================================
   3) 「📋 転記」ボタン
   - 選択キャラのstatus.HP/MP値とparamsから3)テキストを生成
   - :HP=N　HP全快 / :MP=N　MP全快 / CCB<=N 〈ラベル〉…
========================================= */
function doTranscribeParams() {
  const sel = document.getElementById('chatpal3CharSel');
  const ci = parseInt(sel.value, 10);
  if (isNaN(ci) || !state.perChar[ci]) {
    alert('キャラを選択してください。');
    return;
  }
  const text = generateLayoutForChar(ci);
  state.perChar[ci].chatpal3 = text;
  document.getElementById('chatpal3Layout').value = text;
  showToast(`${state.perChar[ci].name} に転記しました`);
}

/* キャラciの「素のレイアウト」を生成 */
function generateLayoutForChar(ci) {
  const origName = state.charNames[ci];
  const pc = state.perChar[ci];
  const v = state.values[origName];
  const lines = [];

  // :HP= / :MP= を共通statusの並び順で（除外されていない分だけ）
  const hpItem = state.commonStatus.find(s => s.label === 'HP');
  const mpItem = state.commonStatus.find(s => s.label === 'MP');
  if (hpItem && !pc.excludedStatus.has('HP')) {
    const val = v['HP'] != null ? v['HP'] : 0;
    lines.push(`:HP=${val}　HP全快`);
  }
  if (mpItem && !pc.excludedStatus.has('MP')) {
    const val = v['MP'] != null ? v['MP'] : 0;
    lines.push(`:MP=${val}　MP全快`);
  }

  // :initiative=DEX 行（DEXがparamsにあり、除外されていない場合のみ）
  const dexItem = state.commonParams.find(p => p.label === 'DEX');
  if (dexItem && !pc.excludedParams.has('DEX')) {
    const dexVal = v['DEX'] != null ? v['DEX'] : 0;
    lines.push(`:initiative=${dexVal}　イニシアティブリセット`);
  }

  // params を CCB<=値 〈ラベル〉 形式で。区切り行はそのまま挿入
  state.commonParams.forEach(item => {
    if (item.isDivider) {
      lines.push(item.label);
      return;
    }
    if (pc.excludedParams.has(item.label)) return;
    const val = v[item.label] != null ? v[item.label] : 0;
    lines.push(`CCB<=${val}　〈${item.label}〉`);
  });

  return lines.join('\n');
}

/* =========================================
   3) 「📋 レイアウトを全員に適用」ボタン
   - 現在のキャラ(=セレクト)の3)テキストを「テンプレート」として使い
   - 各キャラ用に値を差し替えて全員のchatpal3を上書き
========================================= */
function doApplyLayoutToAll() {
  const sel = document.getElementById('chatpal3CharSel');
  const baseCi = parseInt(sel.value, 10);
  if (isNaN(baseCi) || !state.perChar[baseCi]) {
    alert('元になるキャラを選択してください。');
    return;
  }
  const baseText = state.perChar[baseCi].chatpal3 || '';
  if (!baseText.trim()) {
    alert('現在のキャラの3)が空です。先に「📋 転記」して整形してから押してください。');
    return;
  }
  if (!confirm(`現在の「${state.perChar[baseCi].name}」のレイアウトを全員(${state.charNames.length}人)に適用します。\n各キャラのCCB値・:HP=・:MP=はその人の値で更新されます。\n（他のキャラの3)テキストは上書きされます。Ctrl+Z で元に戻せます）`)) return;

  pushUndoSnapshot('apply-layout');

  state.charNames.forEach((origName, ci) => {
    state.perChar[ci].chatpal3 = transformLayoutForChar(baseText, ci);
  });
  // 現在表示中のキャラを再ロード
  loadChatpal3(baseCi);
  showToast(`全${state.charNames.length}人にレイアウトを適用しました（Ctrl+Z で戻せます）`);
}

/* レイアウトテキストの値部分だけをキャラciの値に差し替えて返す
   - :HP=N　... → :HP=その人のHP値　...
   - :MP=N　... → 同上
   - :initiative=N　... → :initiative=その人のDEX値　...
   - CCB<=N　〈ラベル〉 → そのラベルがそのキャラのparamsにある場合、その値で
   - その他の行（区切り、見出し）→ そのまま
*/
const RE_HPMP_LINE = /^(:(?:HP|MP)=)(\d+)(.*)$/;
const RE_INITIATIVE_LINE = /^(:initiative=)(\d+)(.*)$/;
const RE_CCB_LABELED_LINE = /^(CCB<=)\s*(\d+)\s*([　 ]*)〈([^〉]+)〉(.*)$/;

function transformLayoutForChar(layoutText, ci) {
  const origName = state.charNames[ci];
  const pc = state.perChar[ci];
  const v = state.values[origName];
  const lines = layoutText.split(/\r?\n/);

  return lines.map(line => {
    // :HP= / :MP=
    const mhp = line.match(RE_HPMP_LINE);
    if (mhp) {
      const prefix = mhp[1];
      const labelKey = prefix.slice(1, -1);  // "HP" or "MP"
      const newVal = (v[labelKey] != null) ? v[labelKey] : 0;
      return `${prefix}${newVal}${mhp[3]}`;
    }
    // :initiative= (DEX値で更新)
    const mini = line.match(RE_INITIATIVE_LINE);
    if (mini) {
      const dexItem = state.commonParams.find(p => p.label === 'DEX');
      if (dexItem && !pc.excludedParams.has('DEX')) {
        const dexVal = (v['DEX'] != null) ? v['DEX'] : 0;
        return `${mini[1]}${dexVal}${mini[3]}`;
      }
      // DEXがない/除外 → 行を削除
      return null;
    }
    // CCB<=N 〈ラベル〉...
    const mccb = line.match(RE_CCB_LABELED_LINE);
    if (mccb) {
      const label = mccb[4].trim();
      // そのキャラがそのラベルを持っているか
      const inParams = state.commonParams.find(p => p.label === label);
      if (inParams && !pc.excludedParams.has(label)) {
        const newVal = (v[label] != null) ? v[label] : 0;
        return `${mccb[1]}${newVal}${mccb[3] || '　'}〈${label}〉${mccb[5]}`;
      }
      // ラベルがない/除外されている → その行をスキップ
      return null;
    }
    // それ以外（区切り線、見出し、フリーテキスト）はそのまま
    return line;
  }).filter(l => l !== null).join('\n');
}

/* =========================================
   4) 「🔄 統合」ボタン
   - 選択キャラの 1)+2)+3) を結合してプレビューに表示
========================================= */
function doBuildIntegrated() {
  const sel = document.getElementById('chatpal4CharSel');
  const ci = parseInt(sel.value, 10);
  if (isNaN(ci) || !state.perChar[ci]) return;
  const text = buildCommandsForChar(ci);
  document.getElementById('chatpal4Integrated').value = text;
}

/* =========================================
   ③共通paramsの「上限」機能
   - 上限90と入力 → 値105のセルが「105-15」という文字列に書き換わる
   - 出力時もそのまま「105-15」、CCB行も CCB<=105-15
   - 値はstate.values内に文字列として保存
========================================= */
function getCapValue() {
  const inp = document.getElementById('paramsCap');
  if (!inp) return null;
  const v = parseInt(inp.value, 10);
  return isNaN(v) ? null : v;
}

/* 値を上限と比較して表示用文字列に変換 */
function applyCapToValue(rawVal, cap) {
  if (cap == null) return rawVal;
  // 既に "X-Y" 形式なら一旦元値を取り出す
  let baseNum = null;
  if (typeof rawVal === 'string') {
    const m = rawVal.match(/^(\d+)-(\d+)$/);
    if (m) baseNum = parseInt(m[1], 10);
    else if (/^\d+$/.test(rawVal)) baseNum = parseInt(rawVal, 10);
    else return rawVal; // 文字列だが数値でも"X-Y"でもない → そのまま
  } else if (typeof rawVal === 'number') {
    baseNum = rawVal;
  } else {
    return rawVal;
  }
  if (baseNum == null) return rawVal;
  if (baseNum > cap) {
    return `${baseNum}-${baseNum - cap}`;
  }
  return baseNum;
}

/* 上限値変更時：paramsの全セルを再計算して書き換える */
function onCapChange() {
  const cap = getCapValue();
  // values内のparams値を上限処理（元の数値を保持するため、別領域に「素の数値」を残す）
  state.charNames.forEach(origName => {
    state.commonParams.forEach(item => {
      if (item.isDivider) return;  // 区切り行はスキップ
      const key = item.label;
      const baseKey = '__base__' + key;
      // 初回：素の数値を別領域にバックアップ
      if (state.values[origName][baseKey] == null) {
        const cur = state.values[origName][key];
        if (cur != null) state.values[origName][baseKey] = cur;
      }
      // バックアップから上限処理して上書き
      const base = state.values[origName][baseKey];
      if (base != null) {
        state.values[origName][key] = applyCapToValue(base, cap);
      }
    });
  });
  // 表とチャパレを再描画
  renderTable('params');
  // 統合プレビューも更新（現在表示されているキャラ）
  doBuildIntegrated();
  scheduleTheadHeightUpdate();
}

/* params値が編集されたとき：上限処理込みで保存
   この関数は renderTable 側の値編集 oninput から呼ばれる
   （現状の oninput を更新する必要があるが、ここでは新規にラップ関数として用意）
*/
function setParamValue(origName, label, rawInput) {
  const cap = getCapValue();
  const baseKey = '__base__' + label;
  // ユーザーが入力した値を解釈：数値？「X-Y」？
  let baseNum = null;
  const trimmed = String(rawInput).trim();
  if (/^\d+$/.test(trimmed)) {
    baseNum = parseInt(trimmed, 10);
  } else if (/^(\d+)-(\d+)$/.test(trimmed)) {
    baseNum = parseInt(trimmed.match(/^(\d+)-/)[1], 10);
  }
  if (baseNum != null) {
    state.values[origName][baseKey] = baseNum;
    state.values[origName][label] = applyCapToValue(baseNum, cap);
  } else {
    // 数値でない場合：そのまま保存
    state.values[origName][label] = rawInput;
    delete state.values[origName][baseKey];
  }
}

/* =========================================
   保存・復元（LocalStorage）
========================================= */
const SAVE_KEY = 'lap-002-many-state';

/* state→serializable */
function serializeState() {
  return {
    version: 1,
    charNames: state.charNames,
    commonStatus: state.commonStatus,
    commonParams: state.commonParams,
    values: state.values,
    perChar: state.perChar.map(pc => ({
      name: pc.name,
      url: pc.url,
      iconUrl: pc.iconUrl || '',
      initiative: pc.initiative || 0,
      chatpal2: pc.chatpal2,
      chatpal3: pc.chatpal3,
      excludedStatus: [...pc.excludedStatus],
      excludedParams: [...pc.excludedParams]
    })),
    chatpal1Common: document.getElementById('chatpal1Common') ? document.getElementById('chatpal1Common').value : '',
    paramsCap: document.getElementById('paramsCap') ? document.getElementById('paramsCap').value : '',
    tsvInput: document.getElementById('tsvInput') ? document.getElementById('tsvInput').value : '',
    inputMode: getInputMode(),
    iacharaList: _iacharaList
  };
}

/* serializable→state */
function deserializeState(obj) {
  if (!obj || typeof obj !== 'object') return false;
  state.charNames = obj.charNames || [];
  state.commonStatus = obj.commonStatus || [];
  state.commonParams = obj.commonParams || [];
  state.values = obj.values || {};
  state.perChar = (obj.perChar || []).map(pc => ({
    name: pc.name,
    url: pc.url || '',
    iconUrl: pc.iconUrl || '',
    initiative: pc.initiative || 0,
    chatpal2: pc.chatpal2 || '',
    chatpal3: pc.chatpal3 || '',
    excludedStatus: new Set(pc.excludedStatus || []),
    excludedParams: new Set(pc.excludedParams || [])
  }));
  state.parsed = state.charNames.length > 0;

  // 入力欄の復元
  if (document.getElementById('chatpal1Common')) document.getElementById('chatpal1Common').value = obj.chatpal1Common || '';
  if (document.getElementById('paramsCap')) document.getElementById('paramsCap').value = obj.paramsCap || '';
  if (document.getElementById('tsvInput') && obj.tsvInput != null) document.getElementById('tsvInput').value = obj.tsvInput;
  // 入力モードといあきゃらリスト復元
  if (obj.inputMode) {
    const r = document.querySelector(`input[name="inputMode"][value="${obj.inputMode}"]`);
    if (r) { r.checked = true; onInputModeChange(); }
  }
  _iacharaList = Array.isArray(obj.iacharaList) ? obj.iacharaList : [];
  renderIacharaList();

  if (state.parsed) {
    renderTable('status');
    renderTable('params');
    initChatpalSection();
    document.getElementById('statusBox').style.display = '';
    document.getElementById('paramsBox').style.display = '';
    document.getElementById('chatpalEditBox').style.display = '';
    document.getElementById('statusBox').open = true;
    document.getElementById('paramsBox').open = true;
    document.getElementById('chatpalEditBox').open = true;
    scheduleTheadHeightUpdate();
  }
  return true;
}

function doSaveLocal() {
  try {
    const data = serializeState();
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    setSaveMsg('✓ ブラウザに保存しました', false);
  } catch (e) {
    setSaveMsg('保存エラー: ' + (e && e.message ? e.message : String(e)), true);
  }
}

function doRestoreLocal() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      setSaveMsg('保存された状態がありません', true);
      return;
    }
    if (!confirm('現在の編集内容を破棄して、保存された状態に戻しますか？')) return;
    const obj = JSON.parse(raw);
    deserializeState(obj);
    setSaveMsg('✓ 復元しました', false);
  } catch (e) {
    setSaveMsg('復元エラー: ' + (e && e.message ? e.message : String(e)), true);
  }
}

function doExportJson() {
  try {
    const data = serializeState();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    a.href = url;
    a.download = `002-many-${ts}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setSaveMsg('✓ JSONファイルをダウンロード', false);
  } catch (e) {
    setSaveMsg('エクスポートエラー: ' + (e && e.message ? e.message : String(e)), true);
  }
}

function doImportJson(ev) {
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const obj = JSON.parse(e.target.result);
      if (!confirm(`「${file.name}」を読み込んで現在の編集内容を上書きしますか？`)) {
        ev.target.value = '';
        return;
      }
      deserializeState(obj);
      setSaveMsg(`✓ ${file.name} を読み込みました`, false);
    } catch (err) {
      setSaveMsg('読み込みエラー: ' + (err && err.message ? err.message : String(err)), true);
    }
    ev.target.value = '';
  };
  reader.readAsText(file);
}

function setSaveMsg(msg, isErr) {
  const el = document.getElementById('saveMsg');
  if (!el) return;
  el.textContent = msg;
  el.className = isErr ? 'small err' : 'small ok';
  setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 4000);
}

/* =========================================
   5) テキスト作成（ロールテーブル）
   - 21-chat/04-table/index.html の ① テキスト作成 を移植
   - モード：table（項目入力）/ tablePaste（txt編集）/ plain（プレーンテキスト）
   - 番号は自動付与、+/× で行追加削除
========================================= */
let _ttCurrentMode = 'table';
let _ttResultRows = [];
let _ttPlainRows = [];

/* モード切替 */
function setTTMode(mode) {
  _ttCurrentMode = mode;
  document.getElementById('ttModeTable').classList.toggle('active',      mode === 'table');
  document.getElementById('ttModeTablePaste').classList.toggle('active', mode === 'tablePaste');
  document.getElementById('ttModePlain').classList.toggle('active',      mode === 'plain');
  document.getElementById('ttTableForm').style.display      = mode === 'table'      ? '' : 'none';
  document.getElementById('ttTablePasteForm').style.display = mode === 'tablePaste' ? '' : 'none';
  document.getElementById('ttPlainForm').style.display      = mode === 'plain'      ? '' : 'none';
  if (mode === 'table') {
    initTTResultRows();
  } else if (mode === 'tablePaste') {
    updateTTPreview();
  } else {
    if (_ttPlainRows.length === 0) _ttPlainRows = [''];
    renderTTPlainList();
  }
}

/* テーブルモード：ダイス変更 */
function getTTDiceTotal() {
  return Math.max(2, parseInt(document.getElementById('ttDiceFace').value, 10) || 6);
}

function onTTDiceChange() {
  const face = getTTDiceTotal();
  const hint = document.getElementById('ttDiceHint');
  if (hint) hint.textContent = '→ ' + face + '行';
  while (_ttResultRows.length < face) _ttResultRows.push('');
  if (_ttResultRows.length > face) _ttResultRows = _ttResultRows.slice(0, face);
  renderTTResultList();
}

function initTTResultRows() {
  const face = getTTDiceTotal();
  _ttResultRows = Array(face).fill('');
  const hint = document.getElementById('ttDiceHint');
  if (hint) hint.textContent = '→ ' + face + '行';
  renderTTResultList();
}

/* 結果行レンダリング */
function renderTTResultList() {
  const list = document.getElementById('ttResultList');
  if (!list) return;
  list.innerHTML = '';

  _ttResultRows.forEach((val, idx) => {
    const row = document.createElement('div');
    row.className = 'lap-tt-line-row';

    const num = document.createElement('span');
    num.className = 'lap-tt-line-num result-num';
    num.textContent = (idx + 1) + ':';

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'lap-tt-line-input';
    inp.value = val;
    inp.placeholder = (idx + 1) + ' の結果を入力';
    inp.addEventListener('input', () => {
      _ttResultRows[idx] = inp.value;
      updateTTPreview();
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'lap-tt-line-add-btn';
    addBtn.textContent = '+';
    addBtn.title = '下に行を追加';
    addBtn.style.visibility = (idx === _ttResultRows.length - 1) ? 'visible' : 'hidden';
    addBtn.addEventListener('click', () => {
      _ttResultRows.splice(idx + 1, 0, '');
      renderTTResultList();
      const inputs = list.querySelectorAll('.lap-tt-line-input');
      if (inputs[idx + 1]) inputs[idx + 1].focus();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'lap-tt-line-del-btn';
    delBtn.textContent = '×';
    delBtn.title = '行を削除';
    delBtn.disabled = _ttResultRows.length <= 1;
    delBtn.addEventListener('click', () => {
      _ttResultRows.splice(idx, 1);
      renderTTResultList();
    });

    row.appendChild(num);
    row.appendChild(inp);
    row.appendChild(addBtn);
    row.appendChild(delBtn);
    list.appendChild(row);
  });

  updateTTPreview();
}

/* プレーンモード：行レンダリング */
function renderTTPlainList() {
  const list = document.getElementById('ttPlainList');
  if (!list) return;
  list.innerHTML = '';

  _ttPlainRows.forEach((val, idx) => {
    const row = document.createElement('div');
    row.className = 'lap-tt-line-row';

    const num = document.createElement('span');
    num.className = 'lap-tt-line-num';
    num.textContent = idx + 1;

    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'lap-tt-line-input';
    inp.value = val;
    inp.addEventListener('input', () => {
      _ttPlainRows[idx] = inp.value;
      updateTTPreview();
    });

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'lap-tt-line-add-btn';
    addBtn.textContent = '+';
    addBtn.title = '下に行を追加';
    addBtn.style.visibility = (idx === _ttPlainRows.length - 1) ? 'visible' : 'hidden';
    addBtn.addEventListener('click', () => {
      _ttPlainRows.splice(idx + 1, 0, '');
      renderTTPlainList();
      const inputs = list.querySelectorAll('.lap-tt-line-input');
      if (inputs[idx + 1]) inputs[idx + 1].focus();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'lap-tt-line-del-btn';
    delBtn.textContent = '×';
    delBtn.title = '行を削除';
    delBtn.disabled = _ttPlainRows.length <= 1;
    delBtn.addEventListener('click', () => {
      _ttPlainRows.splice(idx, 1);
      renderTTPlainList();
    });

    row.appendChild(num);
    row.appendChild(inp);
    row.appendChild(addBtn);
    row.appendChild(delBtn);
    list.appendChild(row);
  });

  updateTTPreview();
}

/* プレビュー更新 */
function updateTTPreview() {
  const preview = document.getElementById('ttPreview');
  if (!preview) return;
  let lines = [];

  if (_ttCurrentMode === 'table') {
    lines.push('/roll-table');
    const titleEl = document.getElementById('ttTitleInput');
    const title = titleEl ? titleEl.value.trim() : '';
    if (title) lines.push(title);
    const face = getTTDiceTotal();
    lines.push('1D' + face);
    _ttResultRows.forEach((val, idx) => {
      lines.push((idx + 1) + ':' + val);
    });
  } else if (_ttCurrentMode === 'tablePaste') {
    lines.push('/roll-table');
    const titleP = document.getElementById('ttTitleInputP').value.trim();
    if (titleP) lines.push(titleP);
    const faceP = Math.max(2, parseInt(document.getElementById('ttDiceFaceP').value, 10) || 6);
    lines.push('1D' + faceP);
    const raw = document.getElementById('ttPasteArea').value;
    const items = raw.split('\n').map(l => l.trim()).filter(l => l !== '');
    items.forEach((item, idx) => {
      lines.push((idx + 1) + ':' + item);
    });
  } else {
    lines = _ttPlainRows.map(v => v);
  }

  preview.value = lines.join('\n');
}

/* プレビューをコピー */
async function doCopyTTPreview(btnEl) {
  const text = document.getElementById('ttPreview').value;
  if (!text.trim()) { alert('プレビューが空です'); return; }
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {}
  if (!ok) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { ok = document.execCommand('copy'); } catch (_) {}
    document.body.removeChild(ta);
  }
  if (ok) {
    const orig = btnEl.textContent;
    btnEl.textContent = '✓ コピーしました';
    setTimeout(() => btnEl.textContent = orig, 1500);
  } else {
    alert('コピー失敗');
  }
}

/* =========================================
   ② テキスト変換（「」→〈〉）
   - 21-chat/04-table の ② を移植
   - 先頭の「、末尾の」を除去
   - 各行先頭の全角スペースを除去
   - 改行を \n に変換
========================================= */

/* プレビューを変換入力欄に送る */
function doSendToConvert() {
  const text = document.getElementById('ttPreview').value || '';
  if (!text.trim()) { alert('プレビューが空です'); return; }
  // 「」で囲んで送る（変換側で外すロジックなのであっても無くてもOK）
  const wrapped = text.startsWith('「') ? text : `「${text}」`;
  document.getElementById('ttConvertInput').value = wrapped;
  document.getElementById('ttConvertBlock').open = true;
  doConvertTT();
}

/* 変換実行 */
function doConvertTT() {
  const raw = document.getElementById('ttConvertInput').value;
  const out = document.getElementById('ttConvertOutput');
  if (!raw.trim()) {
    out.value = '';
    return;
  }
  let inner = raw;
  if (inner.startsWith('「')) inner = inner.slice(1);
  if (inner.endsWith('」')) inner = inner.slice(0, -1);
  // 実際の改行 OR リテラル \n 両方に対応
  const ls = inner.split(/\n|\\n/);
  // 各行の先頭の全角スペースを除去して \n で結合
  const result = ls.map(l => l.replace(/^\u3000/, '')).join('\\n');
  out.value = result;
}

/* 変換結果コピー */
async function doCopyTTConvert(btnEl) {
  const text = document.getElementById('ttConvertOutput').value;
  if (!text) { alert('まず変換してください'); return; }
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch (_) {}
  if (!ok) {
    const ta = document.getElementById('ttConvertOutput');
    ta.focus(); ta.select();
    try { ok = document.execCommand('copy'); } catch (_) {}
  }
  if (ok) {
    const orig = btnEl.textContent;
    btnEl.textContent = '✓ コピー！';
    setTimeout(() => btnEl.textContent = orig, 1500);
  } else {
    alert('コピー失敗');
  }
}

/* 変換クリア */
function doClearTTConvert() {
  document.getElementById('ttConvertInput').value = '';
  document.getElementById('ttConvertOutput').value = '';
}

/* DOMロード後に項目入力の初期値を生成 */
window.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('ttResultList')) {
    initTTResultRows();
  }
});


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
