function getInputData() {
  const rows = document.querySelectorAll('#inputTable tbody tr.input-row');
  const result = [];
  rows.forEach(row => {
    const before        = row.querySelector('.before').value.trim();
    const after         = row.querySelector('.after').value.trim();
    const startBeforeEl = row.querySelector('.start-before');
    const startAfterEl  = row.querySelector('.start-after');
    const startBefore   = startBeforeEl ? (parseInt(startBeforeEl.value, 10) || 1) : 1;
    const startAfter    = startAfterEl  ? (parseInt(startAfterEl.value,  10) || 1) : 1;
    const breakEl       = row.querySelector('.break');
    const breakLine     = breakEl ? breakEl.checked : false;
    if (before || after) {
      result.push({ before, after: after || before, startBefore, startAfter, break: breakLine });
    }
  });
  return result;
}

function generateSVG() {
  const inputData  = getInputData();
  const fontSize   = parseInt(document.getElementById('fontSize').value, 10);
  const fontColor  = document.getElementById('fontColor').value;
  const fontFamily = document.body.dataset.fontFamily || "'Noto Sans JP', sans-serif";
  const bgColor    = document.getElementById('bgColor').value;
  const speed      = parseInt(document.getElementById('speed').value, 10);

  const lineHeight = fontSize * 1.6;
  const underlineY = fontSize * 0.85;
  const charWidth  = fontSize * 0.6;

  const styles = `
    .dash { stroke-dasharray: 4 2; stroke: ${fontColor}; stroke-width: 1; }
    .undashed { stroke: ${fontColor}; stroke-width: 1; }
    .cursor { fill: ${fontColor}; animation: blink 1s step-start infinite; }
    @keyframes blink { 50% { opacity: 0; } }
    text {
      font-family: ${fontFamily};
      font-size: ${fontSize}px;
      fill: ${fontColor};
      text-anchor: start;
      dominant-baseline: alphabetic;
    }
  `;

  const lines = [];
  let y = fontSize * 1.5;

  inputData.forEach((item, i) => {
    const x = (item.startBefore - 1) * charWidth + 20;
    lines.push(`
      <g id="line${i}" transform="translate(${x}, ${y})">
        <text id="text${i}" x="0" y="0"></text>
        <line id="underline${i}" y1="${underlineY}" y2="${underlineY}" x1="0" x2="0" class="dash"/>
      </g>`);
    if (item.break) y += lineHeight;
    // breakなしの場合はyを変えない（同じ行に続く）
  });

  const svgScript = `
    const inputData = ${JSON.stringify(inputData)};
    const speed = ${speed};
    const fontSize = ${fontSize};
    const charWidth = ${charWidth};
    const underlineY = ${underlineY};
    const cursor = document.getElementById('cursor');

    async function typeLine(i) {
      const textEl    = document.getElementById('text' + i);
      const underline = document.getElementById('underline' + i);
      const gEl       = textEl.parentNode;
      const kana      = inputData[i].before;
      const kanji     = inputData[i].after;
      let str = '';

      for (let j = 0; j < kana.length; j++) {
        str += kana[j];
        textEl.textContent = str;
        await new Promise(r => setTimeout(r, speed));
        const len = textEl.getComputedTextLength();
        const t   = gEl.getAttribute('transform');
        const m   = t.match(/translate\\(([\\d.]+),\\s*([\\d.]+)\\)/);
        cursor.setAttribute('x', parseFloat(m[1]) + len);
        cursor.setAttribute('y', parseFloat(m[2]) - fontSize);
        underline.setAttribute('x2', len);
      }

      await new Promise(r => setTimeout(r, 300));
      // 変化後の開始位置に切り替え
      const xAfter = (inputData[i].startAfter - 1) * charWidth + 20;
      const t   = gEl.getAttribute('transform');
      const m   = t.match(/translate\\([\\d.]+,\\s*([\\d.]+)\\)/);
      gEl.setAttribute('transform', 'translate(' + xAfter + ', ' + m[1] + ')');
      textEl.textContent = kanji;
      const len = textEl.getComputedTextLength();
      underline.setAttribute('x2', len);
      underline.setAttribute('class', 'undashed');
    }

    async function animate() {
      for (let i = 0; i < inputData.length; i++) {
        await typeLine(i);
        const underline = document.getElementById('underline' + i);
        await new Promise(r => setTimeout(r, 300));
        underline.setAttribute('visibility', 'hidden');
      }
      cursor.remove();
    }

    animate();
  `.replace(/<\/script>/gi, '<\\/script>');

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400" viewBox="0 0 800 400">
  <style>${styles}</style>
  <rect width="100%" height="100%" fill="${bgColor}"/>
  ${lines.join('\n')}
  <rect id="cursor" width="2" height="${fontSize}" class="cursor" x="0" y="0"/>
  <script><![CDATA[${svgScript}]]></script>
</svg>`;

  const preview = document.getElementById('preview');
  preview.innerHTML = '';

  const blob   = new Blob([svg], { type: 'image/svg+xml' });
  const url    = URL.createObjectURL(blob);
  const object = document.createElement('object');
  object.type   = 'image/svg+xml';
  object.data   = url;
  object.width  = 800;
  object.height = 400;
  preview.appendChild(object);
  document.getElementById('svgCode').value = svg;
  setTimeout(scalePreview, 50);
}

function copyCode() {
  navigator.clipboard.writeText(document.getElementById('svgCode').value);
  alert('SVGコードをコピーしました');
}

function downloadSVG() {
  const text = document.getElementById('svgCode').value;
  const blob = new Blob([text], { type: 'image/svg+xml' });
  const a    = document.createElement('a');
  a.href     = URL.createObjectURL(blob);
  a.download = 'typing.svg';
  a.click();
}

async function generateAPNG() {
  const object = document.querySelector('#preview object');
  if (!object) return alert("まずSVGを生成してください。");

  if (!window.pako) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/pako@2.1.0/dist/pako.min.js";
      s.onload = resolve; s.onerror = reject;
      document.body.appendChild(s);
    });
  }
  if (!window.UPNG) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js";
      s.onload = resolve; s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  const svgDoc = object.contentDocument;
  if (!svgDoc) return alert("SVGがまだ読み込まれていません。");
  const svgEl = svgDoc.querySelector('svg');
  const width = 800, height = 400;
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx    = canvas.getContext('2d');
  const frames = [];
  const frameDelay = 100;

  for (let i = 0; i < 60; i++) {
    const data = new XMLSerializer().serializeToString(svgEl);
    const img  = new Image();
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    img.src = url;
    await img.decode();
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(img, 0, 0);
    const b = await new Promise(r => canvas.toBlob(r, 'image/png'));
    frames.push(new Uint8Array(await b.arrayBuffer()));
    URL.revokeObjectURL(url);
    await new Promise(r => setTimeout(r, frameDelay));
  }

  const apng = UPNG.encode(frames, width, height, 0, new Array(frames.length).fill(frameDelay));
  const blob  = new Blob([apng], { type: 'image/png' });
  const url   = URL.createObjectURL(blob);
  const a     = document.createElement('a');
  a.href = url; a.download = 'typing.apng'; a.click();
}

// プレビュー縮小
function scalePreview() {
  const wrap = document.getElementById('previewWrap');
  const prev = document.getElementById('preview');
  const obj  = prev.querySelector('object');
  if (!obj) return;
  const svgW = Number(obj.getAttribute('width'))  || 800;
  const svgH = Number(obj.getAttribute('height')) || 400;
  const scale = Math.min(1, (wrap.offsetWidth - 4) / svgW);
  prev.style.transformOrigin = 'top left';
  prev.style.transform       = `scale(${scale})`;
  prev.style.width           = svgW + 'px';
  prev.style.height          = svgH + 'px';
  wrap.style.height          = (svgH * scale) + 'px';
  wrap.style.overflow        = 'hidden';
}

window.addEventListener('resize', scalePreview);

function updateInlinePreview(input) {
  updateKanaPreview();
}

function updateKanaPreview() {
  const area     = document.getElementById('kanaPreviewArea');
  const fontSize = parseInt(document.getElementById('fontSize').value) || 32;
  const color    = document.getElementById('fontColor').value || '#000';
  const family   = document.body.dataset.fontFamily || "'Noto Sans JP',sans-serif";
  const charW    = fontSize * 0.6;
  const lineH    = fontSize * 1.6;
  const MARGIN_X = 20;
  area.innerHTML = '';
  let y = fontSize * 1.5;
  const wrapper = document.createElement('div');
  wrapper.style.position   = 'relative';
  wrapper.style.fontFamily = family;
  wrapper.style.fontSize   = fontSize + 'px';
  wrapper.style.color      = color;
  wrapper.style.lineHeight = '1';
  area.appendChild(wrapper);
  const previewRows = Array.from(document.querySelectorAll('#inputTable tbody tr.input-row'));
  previewRows.forEach(row => {
    const before      = row.querySelector('.before');
    const startBefore = row.querySelector('.start-before');
    const breakEl     = row.querySelector('.break');
    const doBreak     = breakEl ? breakEl.checked : false;

    if (before && before.value) {
      const start = startBefore ? (parseInt(startBefore.value) || 1) : 1;
      const x     = (start - 1) * charW + MARGIN_X;
      const span  = document.createElement('span');
      span.textContent    = before.value;
      span.style.position = 'absolute';
      span.style.left     = x + 'px';
      span.style.top      = (y - fontSize) + 'px';
      wrapper.appendChild(span);
    }
    if (doBreak) y += lineH;
  });
  if (y === fontSize * 1.5) y += lineH;
  wrapper.style.height = y + 'px';
  area.style.minHeight = y + 'px';
}

function updateAllPreviews() { updateKanaPreview(); }

function delRow(btn) {
  const rows = document.querySelectorAll('#inputTable tbody tr.input-row');
  if (rows.length <= 1) return;
  const row = btn.closest('tr');
  row.classList.add('row-collapsing');
  row.addEventListener('transitionend', () => { row.remove(); updateKanaPreview(); }, { once: true });
}

function addRow() {
  const tbody = document.querySelector('#inputTable tbody');
  const row   = document.createElement('tr');
  row.className = 'input-row row-expanding';
  row.innerHTML = `
    <td>
      <input type="text" class="before" oninput="updateInlinePreview(this)">
      <div class="inline-preview" style="display:none"></div>
      <input type="range" class="start-before" value="1" min="1" max="40" oninput="updateKanaPreview()">
    </td>
    <td>
      <input type="text" class="after">
      <input type="range" class="start-after" value="1" min="1" max="40" oninput="updateKanaPreview()">
    </td>
    <td class="td-del"><button class="row-del-btn" onclick="delRow(this)" title="削除"><span class="chev-sp1"></span><span class="chev-sp2"></span></button></td>
  `;
  tbody.appendChild(row);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    row.classList.remove('row-expanding');
    updateKanaPreview();
  }));
}

window.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'hnknCfg') return;
  const c = e.data.cfg;
  if (c.fontColor  != null) document.getElementById('fontColor').value = c.fontColor;
  if (c.fontSize   != null) document.getElementById('fontSize').value  = c.fontSize;
  if (c.bgColor    != null) document.getElementById('bgColor').value   = c.bgColor;
  if (c.speed      != null) document.getElementById('speed').value     = c.speed;
  if (c.fontFamily != null) document.body.dataset.fontFamily = c.fontFamily;
  updateAllPreviews();
});

window.addEventListener('load', () => updateAllPreviews());
