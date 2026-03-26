// ─── State ────────────────────────────────────────────────────────────────────
let pieceCount = 0;

const COLORS = ['--c0','--c1','--c2','--c3','--c4','--c5','--c6','--c7'];

function getColor(i) {
  const v = COLORS[i % COLORS.length];
  const el = document.querySelector('.colors');
  return getComputedStyle(el).getPropertyValue(v).trim();
}

// ─── Piece management ─────────────────────────────────────────────────────────
function addPiece(len = '', qty = '') {
  const list = document.getElementById('piecesList');
  const id = pieceCount++;
  const row = document.createElement('div');
  row.className = 'piece-row';
  row.id = `piece_${id}`;
  row.innerHTML = `
    <input type="number" placeholder="ex: 2.5" min="0.01" step="0.01" value="${len}" class="piece-len">
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
    const len = parseFloat(row.querySelector('.piece-len').value);
    const qty = parseInt(row.querySelector('.piece-qty').value);
    if (!isNaN(len) && !isNaN(qty) && len > 0 && qty > 0) {
      pieces.push({ len, qty });
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
      const col = getColor(i);
      html += `<div class="beam-segment" style="width:${pct}%;background:${col}20;border-right:1px solid ${col};color:${col}">${pieces[i].len}m</div>`;
    }
  }
  const waste = patternWaste(pattern, pieces, beamLen);
  if (waste > 0) {
    const pct = (waste / total * 100).toFixed(2);
    html += `<div class="beam-segment beam-waste" style="width:${pct}%">${waste > 0.5 ? waste + 'm' : ''}</div>`;
  }
  html += '</div>';
  return html;
}

function calculate() {
  const beamLen = parseFloat(document.getElementById('beamLength').value);
  const pieces = getPieces();
  const errBox = document.getElementById('errorBox');
  errBox.innerHTML = '';

  // Validation
  const errors = [];
  if (isNaN(beamLen) || beamLen <= 0) errors.push('Informe um comprimento válido para a viga-mãe.');
  if (pieces.length === 0) errors.push('Adicione ao menos uma peça.');
  pieces.forEach(p => {
    if (p.len > beamLen) errors.push(`Peça de ${p.len}m é maior que a viga-mãe (${beamLen}m). Impossível cortar.`);
  });

  if (errors.length) {
    errBox.innerHTML = errors.map(e => `<div class="error-box">⚠ ${e}</div>`).join('');
    document.getElementById('results').style.display = 'none';
    return;
  }

  // Sort pieces descending for better packing
  pieces.sort((a, b) => b.len - a.len);

  const patterns = generatePatterns(pieces, beamLen);
  const solution = solve(pieces, beamLen, patterns);

  const totalBeams = solution.reduce((s, u) => s + u.count, 0);
  const totalMaterial = totalBeams * beamLen;
  const totalUsed = pieces.reduce((s, p) => s + p.len * p.qty, 0);
  const totalWaste = +(totalMaterial - totalUsed).toFixed(4);
  const wastePercent = ((totalWaste / totalMaterial) * 100).toFixed(1);
  const theorMin = Math.ceil(totalUsed / beamLen);

  document.getElementById('results').style.display = 'block';

  // ── Summary
  document.getElementById('summaryBox').innerHTML = `
    <div class="summary-stat">
      <div class="summary-num">${totalBeams}</div>
      <div class="summary-label">Vigas Necessárias</div>
    </div>
    <div class="summary-divider"></div>
    <div class="summary-stat">
      <div class="summary-num" style="color:var(--accent2)">${totalWaste}m</div>
      <div class="summary-label">Desperdício Total</div>
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

  // ── Step 1: Viability
  let s1 = `<p>Antes de calcular qualquer coisa, verificamos se cada peça solicitada <strong>cabe fisicamente</strong> dentro da viga-mãe.</p>`;
  s1 += `<div class="math-block">Para cada peça i:\n  comprimento_i ≤ comprimento_viga\n\nViga-mãe: ${beamLen}m</div>`;
  s1 += `<table class="eq-table"><thead><tr><th>Peça</th><th>Comprimento</th><th>Qtd. Necessária</th><th>Cabe?</th><th>Material Total</th></tr></thead><tbody>`;
  pieces.forEach((p, i) => {
    const col = getColor(i);
    s1 += `<tr>
      <td><span style="display:inline-block;width:10px;height:10px;background:${col};border-radius:2px;margin-right:6px"></span>Peça ${i + 1}</td>
      <td class="hl">${p.len}m</td><td>${p.qty}×</td>
      <td class="hl2">✓ ${p.len}m ≤ ${beamLen}m</td>
      <td>${(p.len * p.qty).toFixed(2)}m</td>
    </tr>`;
  });
  const sumMat = pieces.reduce((s, p) => s + p.len * p.qty, 0);
  s1 += `</tbody></table>`;
  s1 += `<div class="math-block">Total de material necessário: ${sumMat.toFixed(2)}m\nMínimo teórico de vigas: ⌈${sumMat.toFixed(2)} ÷ ${beamLen}⌉ = ${theorMin} vigas\n\n(Atenção: o mínimo teórico ignora perdas de corte;\nna prática pode ser necessário mais.)</div>`;
  document.getElementById('step1').innerHTML = s1;

  // ── Step 2: Patterns
  let s2 = `<p>Um <strong>padrão de corte</strong> é qualquer combinação de peças que caiba dentro de uma única viga-mãe, respeitando a restrição:</p>`;
  s2 += `<div class="math-block">Σ (quantidade_i × comprimento_i) ≤ ${beamLen}m</div>`;
  s2 += `<p>Para o seu caso, foram gerados <strong>${patterns.length} padrões válidos</strong>. Abaixo os padrões utilizados na solução (destacados):</p>`;
  s2 += `<div class="patterns-grid">`;
  const usedKeys = new Set(solution.map(u => u.pattern.join(',')));
  const displayPats = [
    ...patterns.filter(p => usedKeys.has(p.join(','))),
    ...patterns.filter(p => !usedKeys.has(p.join(','))).slice(0, 6)
  ].slice(0, 12);
  displayPats.forEach((pat, idx) => {
    const waste = patternWaste(pat, pieces, beamLen);
    const used = usedKeys.has(pat.join(','));
    const piecesDesc = pieces.map((p, i) => pat[i] > 0 ? `${pat[i]}× ${p.len}m` : null).filter(Boolean).join(' + ');
    s2 += `<div class="pattern-card ${used ? 'used' : ''}">
      <div class="pattern-card-title">${used ? '★ USADO' : `PADRÃO ${idx + 1}`}</div>
      <div class="pattern-pieces">${piecesDesc}</div>
      ${renderBeam(pat, pieces, beamLen)}
      <div class="pattern-waste">Sobra: <span class="waste-val ${waste === 0 ? 'waste-zero' : ''}">${waste}m</span></div>
    </div>`;
  });
  if (patterns.length > 12) {
    s2 += `<div class="pattern-card" style="display:flex;align-items:center;justify-content:center;color:var(--muted);font-family:var(--mono);font-size:12px">
      + ${patterns.length - 12} outros padrões
    </div>`;
  }
  s2 += `</div>`;
  document.getElementById('step2').innerHTML = s2;

  // ── Step 3: PLI model
  let s3 = `<p>O problema é formulado como <strong>Programação Linear Inteira (PLI)</strong>. Definimos variáveis de decisão x_p que representam quantas vezes cada padrão de corte P é usado:</p>`;
  s3 += `<div class="math-block">MINIMIZAR:   Σ x_p   (total de vigas cortadas)\n\nSUJEITO A:\n  Para cada tipo de peça i:\n  Σ a_ip × x_p ≥ d_i    (satisfazer a demanda)\n\n  x_p ≥ 0, inteiro\n\nOnde:\n  a_ip = quantidade da peça i no padrão p\n  d_i  = demanda da peça i</div>`;
  s3 += `<p>Para o seu problema, as restrições de demanda são:</p>`;
  s3 += `<div class="math-block">`;
  pieces.forEach((p, i) => {
    s3 += `Peça ${i + 1} (${p.len}m): Σ a_${i + 1}p × x_p ≥ ${p.qty}\n`;
  });
  s3 += `</div>`;
  s3 += `<p>O algoritmo usado é um <strong>Greedy guloso por cobertura</strong> — em cada iteração escolhemos o padrão que maximiza o comprimento aproveitado considerando a demanda restante, e aplicamos tantas vezes quanto necessário até zerar todas as demandas.</p>`;
  s3 += `<div class="math-block">Pontuação de um padrão P na iteração k:\n\n  score(P) = Σ min(a_ip, demanda_i_restante) × comprimento_i\n           + (comprimento_total_padrão / ${beamLen}) × 0.5</div>`;
  document.getElementById('step3').innerHTML = s3;

  // ── Step 4: Final plan
  let s4 = `<p>A solução ótima encontrada usa <strong>${totalBeams} viga(s)</strong>. Siga o plano abaixo para executar os cortes:</p>`;
  let beamNum = 1;
  solution.forEach(u => {
    for (let c = 0; c < u.count; c++) {
      const waste = patternWaste(u.pattern, pieces, beamLen);
      s4 += `<div class="cut-beam">`;
      s4 += `<div class="cut-beam-title">VIGA ${beamNum++} <span>de ${beamLen}m</span></div>`;
      s4 += renderBeam(u.pattern, pieces, beamLen);
      s4 += `<div class="cut-list">`;
      pieces.forEach((p, i) => {
        if (u.pattern[i] > 0) {
          const col = getColor(i);
          for (let q = 0; q < u.pattern[i]; q++) {
            s4 += `<div class="cut-item">
              <div class="cut-swatch" style="background:${col}"></div>
              Cortar 1 peça de <span style="color:${col}">${p.len}m</span>
            </div>`;
          }
        }
      });
      if (waste > 0) {
        s4 += `<div class="cut-item waste-line">▸ Sobra: ${waste}m (desperdício)</div>`;
      }
      s4 += `</div></div>`;
    }
  });
  s4 += `<div class="math-block">RESUMO FINAL\n────────────────────────────────\nVigas-mãe usadas : ${totalBeams} × ${beamLen}m = ${totalMaterial}m\nMaterial útil    : ${totalUsed.toFixed(2)}m\nDesperdício      : ${totalWaste}m (${wastePercent}%)\nMínimo teórico   : ${theorMin} vigas</div>`;
  document.getElementById('step4').innerHTML = s4;

  document.getElementById('results').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Init ─────────────────────────────────────────────────────────────────────
addPiece(2, 2);
addPiece(6, 4);
addPiece(7, 1);