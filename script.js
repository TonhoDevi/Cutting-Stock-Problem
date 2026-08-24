// ─── State ────────────────────────────────────────────────────────────────────
let pieceCount = 0;

const COLORS = ['--c0', '--c1', '--c2', '--c3', '--c4', '--c5', '--c6', '--c7'];

function getColor(i) {
  const v = COLORS[i % COLORS.length];
  const el = document.querySelector('.colors');
  return getComputedStyle(el).getPropertyValue(v).trim();
}

// ─── Collapsible steps ────────────────────────────────────────────────────────
function toggleStep(id) {
  const box = document.getElementById(id);
  if (!box) return;
  box.classList.toggle('collapsed');
}

function collapseStep(id) {
  const box = document.getElementById(id);
  if (box) box.classList.add('collapsed');
}

function expandStep(id) {
  const box = document.getElementById(id);
  if (box) box.classList.remove('collapsed');
}

// ─── Piece management ─────────────────────────────────────────────────────────
function addPiece(dia = '10', len = '', qty = '') {
  const list = document.getElementById('piecesList');
  const id = pieceCount++;
  const row = document.createElement('div');
  row.className = 'piece-row';
  row.id = `piece_${id}`;
  row.innerHTML = `
    <select class="piece-dia">
       <option value="6.3" ${dia == '6.3' ? 'selected' : ''}>6.3 mm</option>
       <option value="10" ${dia == '10' ? 'selected' : ''}>10.0 mm</option>
       <option value="12.5" ${dia == '12.5' ? 'selected' : ''}>12.5 mm</option>
    </select>
    <input type="number" placeholder="ex: 250" min="1" step="0.1" value="${len}" class="piece-len">
    <input type="number" placeholder="ex: 3" min="1" step="1" value="${qty}" class="piece-qty">
    <button class="btn-remove" onclick="removePiece('piece_${id}')">×</button>
  `;
  list.appendChild(row);
}

function removePiece(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function getPieces() {
  const rows = document.querySelectorAll('.piece-row');
  const pieces = [];
  rows.forEach(row => {
    const dia = row.querySelector('.piece-dia').value;
    const len = parseFloat(row.querySelector('.piece-len').value);
    const qty = parseInt(row.querySelector('.piece-qty').value);
    if (!isNaN(len) && !isNaN(qty) && len > 0 && qty > 0) {
      pieces.push({ dia, len, qty });
    }
  });
  return pieces;
}

// ─── Algorithm ────────────────────────────────────────────────────────────────

// Generate all valid patterns (combinations that fit in beamLen)
function generatePatterns(pieces, beamLen) {
  const patterns = [];
  const n = pieces.length;

  function recurse(idx, remaining, current) {
    if (current.some(c => c > 0)) {
      patterns.push([...current]);
    }
    for (let i = idx; i < n; i++) {
      const maxQty = Math.min(Math.floor(remaining / pieces[i].len), pieces[i].qty * 3);
      for (let q = 1; q <= maxQty; q++) {
        current[i] += q;
        recurse(i, remaining - q * pieces[i].len, current);
        current[i] -= q;
      }
    }
  }

  recurse(0, beamLen, new Array(n).fill(0));

  // Deduplicate
  const seen = new Set();
  return patterns.filter(p => {
    const key = p.join(',');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Greedy solver: find minimum beams
function solve(pieces, beamLen, patterns) {
  const demand = pieces.map(p => p.qty);
  const n = pieces.length;
  const usedPatterns = [];

  let iters = 0;
  while (demand.some(d => d > 0) && iters < 1000) {
    iters++;

    let bestScore = -1;
    let bestPattern = null;

    for (const pat of patterns) {
      let useful = false;
      for (let i = 0; i < n; i++) {
        if (pat[i] > 0 && demand[i] > 0) { useful = true; break; }
      }
      if (!useful) continue;

      // FIX 1: score conta apenas produção dentro da demanda
      let score = 0;
      for (let i = 0; i < n; i++) {
        const used = Math.min(pat[i], demand[i]);
        score += used * pieces[i].len;
      }
      score += (score / beamLen) * 0.5;

      // FIX 2: penalidade por cada peça produzida além da demanda
      for (let i = 0; i < n; i++) {
        const excess = Math.max(0, pat[i] - demand[i]);
        score -= excess * pieces[i].len * 0.8;
      }

      if (score > bestScore) {
        bestScore = score;
        bestPattern = pat;
      }
    }

    if (!bestPattern) break;

    // FIX 3: floor em vez de ceil — não ultrapassa a demanda por nenhuma peça
    let times = Infinity;
    for (let i = 0; i < n; i++) {
      if (bestPattern[i] > 0 && demand[i] > 0) {
        times = Math.min(times, Math.floor(demand[i] / bestPattern[i]));
      }
    }
    times = Math.max(1, times === Infinity ? 1 : times);

    for (let i = 0; i < n; i++) {
      demand[i] = Math.max(0, demand[i] - bestPattern[i] * times);
    }

    const existing = usedPatterns.find(u => u.pattern.join(',') === bestPattern.join(','));
    if (existing) existing.count += times;
    else usedPatterns.push({ pattern: bestPattern, count: times });
  }

  return usedPatterns;
}

// Busca exata (branch and bound) sobre os padrões já gerados.
// A heurística gulosa de `solve` escolhe a cada passo o padrão que mais
// aproveita a barra atual, mas isso pode ser míope: usar peças que só
// combinam com outras (ex: 350cm+652cm) de forma "pura" primeiro deixa as
// peças restantes sem parceiro, gerando mais barras do que o necessário.
// Aqui exploramos combinações de padrões com poda por limite inferior
// (comprimento restante / comprimento da barra), sempre partindo da
// solução gulosa como teto inicial — nunca piora o resultado, e se o
// espaço de busca for grande demais, simplesmente devolve a gulosa.
function solveOptimal(pieces, beamLen, patterns) {
  const greedy = solve(pieces, beamLen, patterns);
  const n = pieces.length;
  const totalDemand = pieces.reduce((s, p) => s + p.qty, 0);

  const MAX_DEMAND_FOR_EXACT = 40;
  const NODE_LIMIT = 40000;
  if (totalDemand === 0 || totalDemand > MAX_DEMAND_FOR_EXACT || patterns.length === 0) {
    return greedy;
  }

  let bestCount = greedy.reduce((s, u) => s + u.count, 0);
  let bestBeams = greedy.flatMap(u => Array(u.count).fill(u.pattern));
  let nodes = 0;

  // Tenta primeiro os padrões que mais aproveitam a barra: encontra boas
  // soluções cedo, o que fortalece a poda.
  const sortedPatterns = [...patterns].sort((a, b) => {
    const usedA = a.reduce((s, q, i) => s + q * pieces[i].len, 0);
    const usedB = b.reduce((s, q, i) => s + q * pieces[i].len, 0);
    return usedB - usedA;
  });

  function lowerBound(demand) {
    let len = 0;
    for (let i = 0; i < n; i++) len += demand[i] * pieces[i].len;
    return Math.ceil(len / beamLen);
  }

  function search(demand, count, beams) {
    nodes++;
    if (nodes > NODE_LIMIT) return;
    if (demand.every(d => d <= 0)) {
      if (count < bestCount) {
        bestCount = count;
        bestBeams = beams.slice();
      }
      return;
    }
    if (count + lowerBound(demand) >= bestCount) return; // poda: não pode melhorar

    for (const pat of sortedPatterns) {
      let useful = false;
      for (let i = 0; i < n; i++) {
        if (pat[i] > 0 && demand[i] > 0) { useful = true; break; }
      }
      if (!useful) continue;

      const next = demand.map((d, i) => Math.max(0, d - pat[i]));
      beams.push(pat);
      search(next, count + 1, beams);
      beams.pop();
      if (nodes > NODE_LIMIT) return;
    }
  }

  search(pieces.map(p => p.qty), 0, []);

  const grouped = [];
  bestBeams.forEach(pat => {
    const existing = grouped.find(g => g.pattern.join(',') === pat.join(','));
    if (existing) existing.count++;
    else grouped.push({ pattern: pat, count: 1 });
  });
  return grouped;
}

// Compute waste for a pattern
function patternWaste(pattern, pieces, beamLen) {
  let used = 0;
  for (let i = 0; i < pieces.length; i++) {
    used += pattern[i] * pieces[i].len;
  }
  return +(beamLen - used).toFixed(4);
}

// ─── UI rendering ─────────────────────────────────────────────────────────────
function renderBeam(pattern, pieces, beamLen) {
  let html = '<div class="beam-visual">';
  const total = beamLen;
  for (let i = 0; i < pieces.length; i++) {
    for (let q = 0; q < pattern[i]; q++) {
      const pct = (pieces[i].len / total * 100).toFixed(2);
      const col = pieces[i].color || getColor(i);
      html += `<div class="beam-segment" style="width:${pct}%;background:${col}20;border-right:1px solid ${col};color:${col}">${pieces[i].len}</div>`;
    }
  }
  const waste = patternWaste(pattern, pieces, beamLen);
  if (waste > 0) {
    const pct = (waste / total * 100).toFixed(2);
    const wasteText = waste % 1 !== 0 ? waste.toFixed(1) : waste;
    html += `<div class="beam-segment beam-waste" style="width:${pct}%">${waste > 10 ? wasteText : ''}</div>`;
  }
  html += '</div>';
  return html;
}

function calculate() {
  // A barra matriz é sempre de 12 metros, ou seja, 1200 cm
  const beamLen = parseFloat(document.getElementById('beamLength').value) * 100;
  const allPieces = getPieces();
  const errBox = document.getElementById('errorBox');
  errBox.innerHTML = '';

  // Validation
  const errors = [];
  if (allPieces.length === 0) errors.push('Adicione ao menos uma peça.');
  allPieces.forEach(p => {
    if (p.len > beamLen) errors.push(`Peça de ${p.len}cm é maior que a barra matriz de ${beamLen}cm. Impossível cortar.`);
  });

  if (errors.length) {
    errBox.innerHTML = errors.map(e => `<div class="error-box">⚠ ${e}</div>`).join('');
    document.getElementById('results').style.display = 'none';
    return;
  }

  // Obter lista única de diâmetros (do menor pro maior)
  const diameters = [...new Set(allPieces.map(p => p.dia))].sort((a, b) => parseFloat(a) - parseFloat(b));

  let totalBeams = 0;
  let totalMaterial = 0; // em cm
  let totalUsed = 0; // em cm
  let totalWaste = 0; // em cm
  let theorMin = 0;

  let s1 = `<p>A verificação física garante que a peça solicitada não excede os <strong>${beamLen}cm</strong> da barra matriz.</p>`;
  let s2 = `<p>Um <strong>padrão de corte</strong> agrupa peças de mesmo diâmetro que cabem numa única matriz:</p>
            <div class="math-block">Σ (quantidade_i × comprimento_i) ≤ ${beamLen}cm</div>`;
  let s3 = `<p>O problema é formulado como <strong>Otimização Combinatória</strong>, resolvido via heurística gulosa independentemente para cada bitola de aço (diâmetro).</p>`;
  let s4 = ``;

  let globalPieceIdx = 0;
  let printCutCounter = 0;
  const MAX_CUTS_PER_PAGE = 5; // Limite de blocos de corte por página impressa

  let summaryByType = [];
  let totalCutsCount = 0;

  diameters.forEach((dia, diaIndex) => {
    let printCutCounter = 0; // reset po diâmetro
    // Filtrar e ordenar peças desse diâmetro
    let pieces = allPieces.filter(p => p.dia === dia);
    pieces.sort((a, b) => b.len - a.len);

    // Atribuir cores globais consistentes
    pieces.forEach(p => {
      p.color = getColor(globalPieceIdx++);
    });

    // Resolver agrupamento
    const patterns = generatePatterns(pieces, beamLen);
    const solution = solveOptimal(pieces, beamLen, patterns);

    const dBeams = solution.reduce((s, u) => s + u.count, 0);
    const dMaterial = dBeams * beamLen;
    const dUsed = pieces.reduce((s, p) => s + p.len * p.qty, 0);
    const dWaste = +(dMaterial - dUsed).toFixed(4);
    const dTheorMin = Math.ceil(dUsed / beamLen);

    totalBeams += dBeams;
    totalMaterial += dMaterial;
    totalUsed += dUsed;
    totalWaste += dWaste;
    theorMin += dTheorMin;
    summaryByType.push({ dia, count: dBeams });

    // Contabilizar cortes físicos desse diâmetro
    let dCuts = 0;
    solution.forEach(u => {
      let parts = u.pattern.reduce((sum, qty) => sum + qty, 0);
      dCuts += parts * u.count;
    });
    totalCutsCount += dCuts;

    // ----- S1: Verificação -----
    s1 += `<h4 style="margin: 16px 0 8px; color: var(--accent2)">Diâmetro: Ø${dia}mm</h4>`;
    s1 += `<table class="eq-table"><thead><tr><th>Peça</th><th>Compr.</th><th>Qtd.</th><th>Cabe?</th><th>Total (cm)</th></tr></thead><tbody>`;
    pieces.forEach((p, i) => {
      s1 += `<tr>
        <td><span style="display:inline-block;width:10px;height:10px;background:${p.color};border-radius:2px;margin-right:6px"></span>Peça (Ø${dia})</td>
        <td class="hl">${p.len}cm</td><td>${p.qty}×</td>
        <td class="hl2">✓</td>
        <td>${+(p.len * p.qty).toFixed(2)}cm</td>
      </tr>`;
    });
    s1 += `</tbody></table>`;

    // ----- S2: Padrões -----
    s2 += `<h4 style="margin: 16px 0 8px; color: var(--accent2)">Padrões Gerados (Ø${dia}mm)</h4>`;
    s2 += `<div class="patterns-grid">`;
    const usedKeys = new Set(solution.map(u => u.pattern.join(',')));
    const displayPats = [
      ...patterns.filter(p => usedKeys.has(p.join(','))),
      ...patterns.filter(p => !usedKeys.has(p.join(','))).slice(0, 6)
    ].slice(0, 12); // Exibe até 12 padrões no máximo por diâmetro para não poluir

    displayPats.forEach((pat, idx) => {
      const waste = patternWaste(pat, pieces, beamLen);
      const used = usedKeys.has(pat.join(','));
      const piecesDesc = pieces.map((p, i) => pat[i] > 0 ? `${pat[i]}× ${p.len}cm` : null).filter(Boolean).join(' + ');
      s2 += `<div class="pattern-card ${used ? 'used' : ''}">
        <div class="pattern-card-title">${used ? '★ USADO' : `PADRÃO ${idx + 1}`}</div>
        <div class="pattern-pieces">${piecesDesc}</div>
        ${renderBeam(pat, pieces, beamLen)}
        <div class="pattern-waste">Sobra: <span class="waste-val ${waste === 0 ? 'waste-zero' : ''}">${waste % 1 !== 0 ? waste.toFixed(1) : waste}cm</span></div>
      </div>`;
    });
    s2 += `</div>`;

    // ----- S4: Plano Final -----
    if (dBeams > 0) {
      s4 += `<div class="page-break"></div>`;
      s4 += `<h4 style="color:var(--accent); margin-top:24px; margin-bottom:12px; border-bottom: 1px solid var(--border); padding-bottom: 6px;">
               CORTES PARA BARRAS Ø${dia}mm (Total Necessário: ${dBeams} barras)
             </h4>`;
      let beamNum = 1;
      solution.forEach(u => {
        for (let c = 0; c < u.count; c++) {
          if (printCutCounter > 0 && printCutCounter % MAX_CUTS_PER_PAGE === 0) {
            s4 += `<div class="page-break"></div>`;
          }
          printCutCounter++;

          const waste = patternWaste(u.pattern, pieces, beamLen);
          s4 += `<div class="cut-beam">`;
          s4 += `<div class="cut-beam-title">BARRA ${beamNum++} <span>de ${beamLen}cm (Ø${dia}mm)</span></div>`;
          s4 += renderBeam(u.pattern, pieces, beamLen);
          s4 += `<div class="cut-list">`;
          pieces.forEach((p, i) => {
            if (u.pattern[i] > 0) {
              for (let q = 0; q < u.pattern[i]; q++) {
                s4 += `<div class="cut-item">
                  <div class="cut-swatch" style="background:${p.color}"></div>
                  Cortar 1 peça de <span style="color:${p.color};font-weight:bold;">${p.len}cm</span>
                </div>`;
              }
            }
          });
          if (waste > 0) {
            s4 += `<div class="cut-item waste-line" style="margin-top:4px">▸ Sobra da barra: ${waste % 1 !== 0 ? waste.toFixed(2) : waste}cm</div>`;
          }
          s4 += `</div></div>`;
        }
      });
    }
  }); // Fim do foreach diameter

  // ----- Resumo e UI Final -----
  document.getElementById('results').style.display = 'block';

  const totalWasteObj = totalMaterial > 0 ? ((totalWaste / totalMaterial) * 100) : 0;
  const wastePercent = totalWasteObj.toFixed(1);

  document.getElementById('summaryBox').innerHTML = `
    <div class="summary-stat">
      <div class="summary-num">${totalBeams}</div>
      <div class="summary-label">Total Barras</div>
    </div>
    <div class="summary-divider"></div>
    <div class="summary-stat">
      <div class="summary-num" style="color:var(--accent2)">${(totalWaste / 100).toFixed(2)}m</div>
      <div class="summary-label">Desperdício (m)</div>
    </div>
    <div class="summary-divider"></div>
    <div class="summary-stat">
      <div class="summary-num" style="color:var(--accent2);font-size:36px">${wastePercent}%</div>
      <div class="summary-label">% Desperdício</div>
    </div>
    <div class="summary-divider"></div>
    <div class="summary-stat">
      <div class="summary-num" style="font-size:28px;color:var(--muted)">${theorMin}</div>
      <div class="summary-label">Mínimo Teórico</div>
    </div>
  `;

  document.getElementById('step1').innerHTML = s1;
  document.getElementById('step2').innerHTML = s2;
  document.getElementById('step3').innerHTML = s3;

  let printCover = `
    <div class="print-cover" style="margin-bottom: 30px;">
      <h3 style="color:var(--accent); border-bottom: 2px solid var(--border); padding-bottom: 15px; font-size: 22px;">RESUMO E SEPARAÇÃO DE MATERIAIS</h3>
      <div style="font-family: var(--mono); font-size: 18px; line-height: 2; margin-top: 20px; color: #000;">
        <p style="font-size: 24px; font-weight: bold;"><strong>Total de Vigas Necessárias:</strong> ${totalBeams} vigas de ${beamLen / 100}m</p>
        <p style="font-size: 20px;"><strong>Total de Cortes Físicos a Realizar:</strong> ${totalCutsCount} cortes</p>
        <div style="margin-top:20px; padding: 15px; background: rgba(0,0,0,0.1) !important; border-left: 4px solid #000;">
          <strong style="font-size: 20px;">Detalhamento por Diâmetro:</strong>
          <ul style="margin-top:10px; margin-left: 20px; list-style-type: square; font-size: 20px;">
            ${summaryByType.map(s => `<li>Ø ${s.dia}mm : <b style="color:#000;">${s.count} vigas</b></li>`).join('')}
          </ul>
        </div>
      </div>
    </div>
  `;

  document.getElementById('step4').innerHTML = printCover + s4;

  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Passos de detalhamento: colapsados por padrão
  collapseStep('stepBox1');
  collapseStep('stepBox2');
  collapseStep('stepBox3');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
addPiece('10', 250, 4);
addPiece('6.3', 600, 2);
addPiece('10', 300, 3);
addPiece('12.5', 400, 1);