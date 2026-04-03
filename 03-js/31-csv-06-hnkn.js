function addRow() {
  const tbody = document.querySelector('#inputTable tbody');
  const row = document.createElement('tr');
  row.innerHTML = `
    <td><input type="text" class="before"></td>
    <td><input type="text" class="after"></td>
    <td><input type="checkbox" class="break"></td>
    <td><input type="number" class="start" value="1" min="1"></td>
  `;
  tbody.appendChild(row);
}

function getInputData() {
  const rows = document.querySelectorAll('#inputTable tbody tr');
  const result = [];
  rows.forEach(row => {
    const before = row.querySelector('.before').value.trim();
    const after = row.querySelector('.after').value.trim();
    const breakLine = row.querySelector('.break').checked;
    const start = parseInt(row.querySelector('.start').value, 10) || 1;
    if (before || after) {
      result.push({ before, after: after || before, break: breakLine, start });
    }
  });
  return result;
}

function generateSVG() {
  const inputData = getInputData();
  const fontSize = parseInt(document.getElementById('fontSize').value, 10);
  const fontColor = document.getElementById('fontColor').value;
  const bgColor = document.getElementById('bgColor').value;
  const speed = parseInt(document.getElementById('speed').value, 10);

  const lineHeight = fontSize * 1.6;
  const underlineY = fontSize * 0.85;
  const charWidth = fontSize * 0.6;

  const styles = `
    .dash { stroke-dasharray: 4 2; stroke: ${fontColor}; stroke-width: 1; }
    .undashed { stroke: ${fontColor}; stroke-width: 1; }
    .cursor { fill: ${fontColor}; animation: blink 1s step-start infinite; }
    @keyframes blink { 50% { opacity: 0; } }
    text {
      font-family: 'Noto Sans JP', sans-serif;
      font-size: ${fontSize}px;
      fill: ${fontColor};
      text-anchor: start;
      dominant-baseline: alphabetic;
    }
  `;

  const lines = [];
  let y = fontSize * 1.5;

  inputData.forEach((item, i) => {
    const x = (item.start - 1) * charWidth + 20;
    lines.push(`
      <g id="line${i}" transform="translate(${x}, ${y})">
        <text id="text${i}" x="0" y="0"></text>
        <line id="underline${i}" y1="${underlineY}" y2="${underlineY}" x1="0" x2="0" class="dash"/>
      </g>`);
    if (item.break) y += lineHeight;
  });

  const svgScript = `
    const inputData = ${JSON.stringify(inputData)};
    const speed = ${speed};
    const fontSize = ${fontSize};
    const underlineY = ${underlineY};
    const cursor = document.getElementById('cursor');

    async function typeLine(i) {
      const textEl = document.getElementById('text' + i);
      const underline = document.getElementById('underline' + i);
      const kana = inputData[i].before;
      const kanji = inputData[i].after;
      let str = '';

      for (let j = 0; j < kana.length; j++) {
        str += kana[j];
        textEl.textContent = str;
        await new Promise(r => setTimeout(r, speed));

        const len = textEl.getComputedTextLength();
        const transform = textEl.parentNode.getAttribute('transform');
        const [xStr, yStr] = transform.match(/[\d.]+/g) || [0, 0];
        const x = parseFloat(xStr) + len;
        const y = parseFloat(yStr) - fontSize;
        cursor.setAttribute('x', x);
        cursor.setAttribute('y', y);

        underline.setAttribute('x2', len);
      }

      await new Promise(r => setTimeout(r, 300));
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

  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const object = document.createElement('object');
  object.type = 'image/svg+xml';
  object.data = url;
  object.width = 800;
  object.height = 400;

  preview.appendChild(object);
  document.getElementById('svgCode').value = svg;
}

function copyCode() {
  const text = document.getElementById('svgCode').value;
  navigator.clipboard.writeText(text);
  alert('SVGコードをコピーしました');
}

function downloadSVG() {
  const text = document.getElementById('svgCode').value;
  const blob = new Blob([text], { type: 'image/svg+xml' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
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
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  if (!window.UPNG) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/upng-js@2.1.0/UPNG.js";
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  const svgDoc = object.contentDocument;
  if (!svgDoc) return alert("SVGがまだ読み込まれていません。");
  const svgEl = svgDoc.querySelector('svg');
  const width = 800, height = 400;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const frames = [];
  const frameDelay = 100;

  for (let i = 0; i < 60; i++) {
    const data = new XMLSerializer().serializeToString(svgEl);
    const img = new Image();
    const blob = new Blob([data], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
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
  const blob = new Blob([apng], { type: 'image/png' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'typing.apng';
  a.click();
}

// プレビューをウィンドウ幅に合わせてスケール
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

// generateSVG完了後にscalePreviewを呼ぶ
const _origGenerate = window.generateSVG;
window.generateSVG = function() {
  if (typeof _origGenerate === 'function') _origGenerate();
  setTimeout(scalePreview, 50);
};

window.addEventListener('resize', scalePreview);
