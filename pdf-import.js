// ─── PDF Import Module ────────────────────────────────────────────────────────
// Configura o worker do PDF.js via CDN
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

let parsedRows = []; // Todas as linhas extraídas do PDF
let activeVigas = new Set(); // Vigas selecionadas pelo filtro
let allVigas = [];

// ─── Upload handler ───────────────────────────────────────────────────────────
async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Mostra nome do arquivo
  document.getElementById('pdfFileName').textContent = file.name;

  // Abre o modal com indicador de carregamento
  openPdfModal();
  setParseStatus('loading', `Lendo "${file.name}"…`);
  document.getElementById('pdfTableBody').innerHTML = '';
  document.getElementById('viga-chips').innerHTML = '';

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      // Ordenar items por y (top→bottom) depois x (left→right)
      const items = content.items
        .map(item => ({
          str: item.str,
          x: item.transform[4],
          y: item.transform[5],
        }))
        .sort((a, b) => b.y - a.y || a.x - b.x);

      // Agrupar em linhas por proximidade de y
      const lines = groupIntoLines(items);
      fullText += lines.map(l => l.join('\t')).join('\n') + '\n';
    }

    parsedRows = parseTableText(fullText);

    if (parsedRows.length === 0) {
      setParseStatus('error', '⚠ Nenhuma linha de dados reconhecida. Verifique se o PDF contém texto selecionável (não é imagem escaneada).');
      return;
    }

    setParseStatus('success', `✓ ${parsedRows.length} linha(s) encontrada(s) em ${pdf.numPages} página(s).`);
    buildVigas();
    renderPreviewTable();
  } catch (err) {
    setParseStatus('error', `Erro ao ler PDF: ${err.message}`);
    console.error(err);
  }

  // Limpa o input para permitir re-upload do mesmo arquivo
  event.target.value = '';
}

// ─── Group text items into visual lines ──────────────────────────────────────
function groupIntoLines(items, tolerance = 3) {
  const lines = [];
  let currentLine = [];
  let lastY = null;

  for (const item of items) {
    if (lastY === null || Math.abs(item.y - lastY) <= tolerance) {
      currentLine.push(item.str.trim());
    } else {
      if (currentLine.some(s => s)) lines.push(currentLine);
      currentLine = [item.str.trim()];
    }
    lastY = item.y;
  }
  if (currentLine.some(s => s)) lines.push(currentLine);
  return lines;
}

// ─── Parse extracted text into structured rows ────────────────────────────────
/*
  Estrutura esperada da tabela:
  AÇO | POS | BIT (mm) | QUANT | COMPR UNIT (cm) | COMPR TOTAL (cm)

  Cabeçalho de viga: "V101 (15X82)" ou "V101"
  Linha de dado: "50A | 101 | 10 | 4 | 235 | 940"

  O parser é tolerante: aceita espaços e tabulações como separadores.
*/
function parseTableText(text) {
  const rows = [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Padrão para cabeçalho de viga: V seguido de dígitos, opcionalmente com (...)
  const vigaHeaderRe = /^(V\d+)\s*(?:\([\dXx]+\))?\s*(?:\([\dXx]+\))?/i;
  // Padrão para linha de dados: começa com AÇO (ex: 50A) e tem ao menos 5 tokens numéricos/alfanuméricos
  // Tokens: aco, pos, bit, quant, comptUnit, comptTotal
  const dataLineRe = /(\w+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+([\d.]+)\s+([\d.]+)/;

  let currentViga = 'N/D';

  for (const line of lines) {
    // Detecta cabeçalho de viga
    const vigaMatch = line.match(vigaHeaderRe);
    if (vigaMatch && /^V\d+/i.test(line)) {
      // Confirma que é só o cabeçalho (não tem números de dados na mesma linha)
      const tokens = line.trim().split(/\s+/);
      const numericTokens = tokens.filter(t => /^\d+(\.\d+)?$/.test(t));
      if (numericTokens.length < 3) {
        currentViga = vigaMatch[1].toUpperCase();
        continue;
      }
    }

    // Tenta parsear linha de dados
    const m = line.match(dataLineRe);
    if (m) {
      const aco = m[1];
      const pos = m[2];
      const bit = parseFloat(m[3]);
      const quant = parseInt(m[4], 10);
      const comprUnit = parseFloat(m[5]);
      const comprTotal = parseFloat(m[6]);

      // Sanity check: bit deve ser valor de diâmetro de aço válido
      if (!isNaN(bit) && !isNaN(quant) && !isNaN(comprUnit) && comprUnit > 0) {
        rows.push({
          viga: currentViga,
          aco,
          pos,
          bit: normalizeBit(bit),
          quant,
          comprUnit,
          comprTotal,
          selected: true,
        });
      }
    }
  }

  return rows;
}

// Normaliza o diâmetro para os valores aceitos pela calculadora
function normalizeBit(bit) {
  const valid = [6.3, 10, 12.5];
  // Encontra o mais próximo
  return valid.reduce((prev, curr) =>
    Math.abs(curr - bit) < Math.abs(prev - bit) ? curr : prev
  );
}

// ─── Build viga chips ─────────────────────────────────────────────────────────
function buildVigas() {
  allVigas = [...new Set(parsedRows.map(r => r.viga))];
  activeVigas = new Set(allVigas);

  const container = document.getElementById('viga-chips');
  container.innerHTML = '';
  allVigas.forEach(viga => {
    const chip = document.createElement('button');
    chip.className = 'viga-chip active';
    chip.textContent = viga;
    chip.dataset.viga = viga;
    chip.onclick = () => toggleVigaChip(chip, viga);
    container.appendChild(chip);
  });
}

function toggleVigaChip(chip, viga) {
  if (activeVigas.has(viga)) {
    activeVigas.delete(viga);
    chip.classList.remove('active');
  } else {
    activeVigas.add(viga);
    chip.classList.add('active');
  }
  // Atualiza seleção dos checkboxes
  parsedRows.forEach(r => {
    if (r.viga === viga) r.selected = activeVigas.has(viga);
  });
  renderPreviewTable();
  updateImportCount();
}

let allSelected = true;
function toggleSelectAll() {
  allSelected = !allSelected;
  allVigas.forEach(v => {
    if (allSelected) activeVigas.add(v);
    else activeVigas.delete(v);
  });
  parsedRows.forEach(r => { r.selected = allSelected; });
  document.querySelectorAll('.viga-chip').forEach(c => {
    c.classList.toggle('active', allSelected);
  });
  renderPreviewTable();
  updateImportCount();
}

// ─── Render preview table ─────────────────────────────────────────────────────
function renderPreviewTable() {
  const tbody = document.getElementById('pdfTableBody');
  tbody.innerHTML = '';

  const filtered = parsedRows.filter(r => activeVigas.has(r.viga));

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:20px">Nenhuma linha visível com o filtro atual.</td></tr>`;
    document.getElementById('selectAllRows').checked = false;
    updateImportCount();
    return;
  }

  let lastViga = null;
  filtered.forEach((row, idx) => {
    const tr = document.createElement('tr');
    tr.className = `pdf-row ${row.selected ? 'pdf-row-selected' : ''}`;

    if (row.viga !== lastViga) {
      tr.classList.add('pdf-row-first-in-group');
      lastViga = row.viga;
    }

    tr.innerHTML = `
      <td><input type="checkbox" class="row-checkbox" ${row.selected ? 'checked' : ''} data-idx="${parsedRows.indexOf(row)}" onchange="toggleRow(this)"></td>
      <td><span class="viga-badge">${row.viga}</span></td>
      <td>${row.aco}</td>
      <td>${row.pos}</td>
      <td class="hl">${row.bit} mm</td>
      <td>${row.quant}</td>
      <td class="hl2">${row.comprUnit} cm</td>
      <td style="color:var(--muted)">${row.comprTotal} cm</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('selectAllRows').checked = filtered.every(r => r.selected);
  updateImportCount();
}

function toggleRow(checkbox) {
  const idx = parseInt(checkbox.dataset.idx, 10);
  parsedRows[idx].selected = checkbox.checked;
  const tr = checkbox.closest('tr');
  tr.classList.toggle('pdf-row-selected', checkbox.checked);
  document.getElementById('selectAllRows').checked =
    parsedRows.filter(r => activeVigas.has(r.viga)).every(r => r.selected);
  updateImportCount();
}

function toggleAllRows(checked) {
  parsedRows.forEach(r => {
    if (activeVigas.has(r.viga)) r.selected = checked;
  });
  renderPreviewTable();
}

function updateImportCount() {
  const count = parsedRows.filter(r => r.selected).length;
  document.getElementById('pdfImportCount').textContent =
    count > 0 ? `${count} linha(s) selecionada(s)` : 'Nenhuma linha selecionada';
}

// ─── Confirm import ───────────────────────────────────────────────────────────
function confirmPdfImport() {
  const selected = parsedRows.filter(r => r.selected);
  if (selected.length === 0) {
    setParseStatus('error', '⚠ Selecione ao menos uma linha para importar.');
    return;
  }

  // Limpa lista atual
  document.getElementById('piecesList').innerHTML = '';
  pieceCount = 0;

  // Agrupa por diâmetro + comprimento e soma quantidades
  const grouped = new Map();
  selected.forEach(row => {
    const key = `${row.bit}_${row.comprUnit}`;
    if (grouped.has(key)) {
      grouped.get(key).qty += row.quant;
    } else {
      grouped.set(key, { bit: row.bit, comprUnit: row.comprUnit, qty: row.quant });
    }
  });

  grouped.forEach(({ bit, comprUnit, qty }) => {
    addPiece(String(bit), String(comprUnit), String(qty));
  });

  closePdfModal();

  // Feedback visual
  const label = document.getElementById('pdfImportLabel');
  label.style.background = 'var(--accent2)';
  label.style.color = '#000';
  setTimeout(() => {
    label.style.background = '';
    label.style.color = '';
  }, 2000);
}

// ─── Modal helpers ────────────────────────────────────────────────────────────
function openPdfModal() {
  document.getElementById('pdfModal').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closePdfModal() {
  document.getElementById('pdfModal').style.display = 'none';
  document.body.style.overflow = '';
}

// Fecha modal ao clicar no overlay externo
document.getElementById('pdfModal').addEventListener('click', function(e) {
  if (e.target === this) closePdfModal();
});

// Fecha com Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closePdfModal();
});

function setParseStatus(type, msg) {
  const el = document.getElementById('pdfParseStatus');
  el.className = `pdf-parse-status pdf-status-${type}`;
  el.innerHTML = type === 'loading'
    ? `<span class="pdf-spinner"></span>${msg}`
    : msg;
}
