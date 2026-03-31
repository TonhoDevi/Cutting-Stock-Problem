// ─── State ────────────────────────────────────────────────────────────────────
let pieceCount = 0;

const COLORS = ['--c0','--c1','--c2','--c3','--c4','--c5','--c6','--c7'];

function getColor(i) {
  const v = COLORS[i % COLORS.length];
  const el = document.querySelector('.colors');
  return getComputedStyle(el).getPropertyValue(v).trim();
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
       <option value="6.3" ${dia=='6.3'?'selected':''}>6.3 mm</option>
       <option value="10" ${dia=='10'?'selected':''}>10.0 mm</option>
       <option value="12.5" ${dia=='12.5'?'selected':''}>12.5 mm</option>
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

      let score = 0;
      let lenUsed = 0;
      for (let i = 0; i < n; i++) {
        const used = Math.min(pat[i], demand[i]);
        score += used * pieces[i].len;
        lenUsed += pat[i] * pieces[i].len;
      }
      score += (lenUsed / beamLen) * 0.5;

      if (score > bestScore) {
        bestScore = score;
        bestPattern = pat;
      }
    }

    if (!bestPattern) break;

    let times = Infinity;
    for (let i = 0; i < n; i++) {
      if (bestPattern[i] > 0 && demand[i] > 0) {
        times = Math.min(times, Math.ceil(demand[i] / bestPattern[i]));
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
  const diameters = [...new Set(allPieces.map(p => p.dia))].sort((a,b) => parseFloat(a) - parseFloat(b));

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

  diameters.forEach(dia => {
    // Filtrar e ordenar peças desse diâmetro
    let pieces = allPieces.filter(p => p.dia === dia);
    pieces.sort((a, b) => b.len - a.len);

    // Atribuir cores globais consistentes
    pieces.forEach(p => {
      p.color = getColor(globalPieceIdx++);
    });

    // Resolver agrupamento
    const patterns = generatePatterns(pieces, beamLen);
    const solution = solve(pieces, beamLen, patterns);

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
      s4 += `<h4 style="color:var(--accent); margin-top:24px; margin-bottom:12px; border-bottom: 1px solid var(--border); padding-bottom: 6px;">
               CORTES PARA BARRAS Ø${dia}mm (Total Necessário: ${dBeams} barras)
             </h4>`;
      let beamNum = 1;
      solution.forEach(u => {
        for (let c = 0; c < u.count; c++) {
          const waste = patternWaste(u.pattern, pieces, beamLen);
          s4 += `<div class="cut-beam">`;
          s4 += `<div class="cut-beam-title">BARRA MATRIZ ${beamNum++} <span>de ${beamLen}cm (Ø${dia}mm)</span></div>`;
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
            s4 += `<div class="cut-item waste-line" style="margin-top:4px">▸ Sobra de matriz: ${waste % 1 !== 0 ? waste.toFixed(2) : waste}cm</div>`;
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
  
  s4 += `<div class="math-block" style="margin-top: 30px;">RESUMO GERAL DOS MATERIAIS\n────────────────────────────────\nTotal Barras Usadas : ${totalBeams} (de 12m)\nMaterial Útil (Liq.): ${(totalUsed/100).toFixed(2)}m\nSobra (Desperdício) : ${(totalWaste/100).toFixed(2)}m (${wastePercent}%)\nMínimo Teórico Ideal: ${theorMin} barras</div>`;
  document.getElementById('step4').innerHTML = s4;

  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
addPiece('10', 250, 4);
addPiece('6.3', 600, 2);
addPiece('10', 300, 3);
addPiece('12.5', 400, 1);