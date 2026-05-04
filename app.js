/* Vixe Extras — controle de pagamentos */
(function () {
  'use strict';

  const STORAGE_EMPLOYEES = 'vixe.employees.v1';
  const STORAGE_HISTORY = 'vixe.history.v1';
  const SESSION_KEY = 'vixe.session.v1';
  const SETORES = ['Bar', 'Caixa', 'Cozinha', 'Salão'];

  /* ---------- Estado ---------- */
  const state = {
    employees: load(STORAGE_EMPLOYEES, []),
    history: load(STORAGE_HISTORY, []),
    session: loadSession(),
    view: 'insert',
    selectedEmployeeId: null,        // aba Inserir
    selectedDiscountEmployeeId: null, // aba Descontos
    editingId: null,
  };

  function load(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; }
    catch { return fallback; }
  }
  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
  function loadSession() {
    try {
      const v = JSON.parse(sessionStorage.getItem(SESSION_KEY));
      if (v == null) return { entries: [], discounts: [] };
      // Migração: formato antigo era um array de entries
      if (Array.isArray(v)) return { entries: v, discounts: [] };
      return { entries: v.entries ?? [], discounts: v.discounts ?? [] };
    } catch { return { entries: [], discounts: [] }; }
  }
  function saveSessionState() {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(state.session));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------- Cálculo ---------- */
  const TABLE_EXTRA = {
    1: 25, 1.5: 30, 2: 40, 2.5: 45, 3: 55, 3.5: 60,
    4: 70, 4.5: 75, 5: 85, 5.5: 90, 6: 100,
  };

  function calculateExtraValue(hours) {
    if (hours < 1) return 0;
    if (hours <= 6) return TABLE_EXTRA[hours] ?? 0;
    if (hours < 12) {
      const halves = Math.round((hours - 6) * 2);
      return 100 + halves * 5;
    }
    if (hours === 12) return 200;
    const halves = Math.round((hours - 12) * 2);
    return 200 + halves * 5;
  }

  function computeHours(entryH, entryM, exitH, exitM) {
    let entryMin = entryH * 60 + entryM;
    let exitMin = exitH * 60 + exitM;
    if (exitMin <= entryMin) exitMin += 24 * 60;
    return (exitMin - entryMin) / 60;
  }

  function formatHours(h) {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, '0')}`;
  }

  function formatTime(h, m) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function formatMoney(v) {
    return `$${v}`;
  }

  /* ---------- Render principal ---------- */
  const $app = document.getElementById('app');

  function setView(view) {
    state.view = view;
    document.querySelectorAll('.tab').forEach(t => {
      t.classList.toggle('active', t.dataset.view === view);
    });
    state.selectedEmployeeId = null;
    state.selectedDiscountEmployeeId = null;
    state.editingId = null;
    render();
  }

  function render() {
    if (state.view === 'insert') renderInsert();
    else if (state.view === 'discount') renderDiscount();
    else if (state.view === 'register') renderRegister();
    else if (state.view === 'history') renderHistory();
  }

  /* ---------- View: Inserir Dados ---------- */
  function renderInsert() {
    $app.innerHTML = `
      <div class="card">
        <h2 class="section-title">Novo registro</h2>

        <div class="field">
          <label for="ac-input">Funcionário</label>
          <div class="autocomplete">
            <input type="text" id="ac-input" placeholder="Comece a digitar o nome…" autocomplete="off">
            <div id="ac-list" class="autocomplete-list" hidden></div>
          </div>
        </div>

        <div id="fixo-info" class="fixo-info hidden"></div>

        <div class="field">
          <label>Entrada</label>
          <div class="time-group">
            ${selectHours('entry-h')}
            <span class="colon">:</span>
            ${selectMinutes('entry-m')}
          </div>
        </div>

        <div class="field">
          <label>Saída</label>
          <div class="time-group">
            ${selectHours('exit-h')}
            <span class="colon">:</span>
            ${selectMinutes('exit-m')}
          </div>
        </div>

        <div id="preview" class="preview hidden"></div>

        <button id="btn-add" class="btn btn-primary" disabled>Adicionar</button>
      </div>

      <div class="card">
        <h2 class="section-title">
          Sessão atual
          <span style="font-size:0.8rem;color:var(--muted);font-weight:500">
            ${state.session.entries.length} ${state.session.entries.length === 1 ? 'registro' : 'registros'}${state.session.discounts.length ? ` · ${state.session.discounts.length} ${state.session.discounts.length === 1 ? 'desconto' : 'descontos'}` : ''}
          </span>
        </h2>
        ${renderSessionList()}
      </div>

      <button id="btn-finalize" class="btn btn-info" ${(state.session.entries.length === 0 && state.session.discounts.length === 0) ? 'disabled' : ''}>
        Finalizar e copiar
      </button>
    `;

    setupAutocomplete('ac-input', 'ac-list', (emp) => {
      state.selectedEmployeeId = emp ? emp.id : null;
      updateFixoInfo();
      updatePreview();
    });

    document.getElementById('entry-h').addEventListener('change', updatePreview);
    document.getElementById('entry-m').addEventListener('change', updatePreview);
    document.getElementById('exit-h').addEventListener('change', updatePreview);
    document.getElementById('exit-m').addEventListener('change', updatePreview);
    document.getElementById('btn-add').addEventListener('click', addEntry);
    document.getElementById('btn-finalize').addEventListener('click', openFinalizeModal);

    // Default: 18:00 → 00:00
    document.getElementById('entry-h').value = '18';
    document.getElementById('entry-m').value = '0';
    document.getElementById('exit-h').value = '0';
    document.getElementById('exit-m').value = '0';

    state.session.entries.forEach((_, idx) => {
      const btn = document.querySelector(`[data-remove="${idx}"]`);
      if (btn) btn.addEventListener('click', () => removeEntry(idx));
    });
    state.session.discounts.forEach((_, idx) => {
      const btn = document.querySelector(`[data-remove-disc="${idx}"]`);
      if (btn) btn.addEventListener('click', () => removeDiscount(idx, 'insert'));
    });
  }

  function selectHours(id) {
    const opts = Array.from({ length: 24 }, (_, h) =>
      `<option value="${h}">${String(h).padStart(2, '0')}</option>`).join('');
    return `<select id="${id}"><option value="" disabled selected>HH</option>${opts}</select>`;
  }

  function selectMinutes(id) {
    return `<select id="${id}">
      <option value="" disabled selected>MM</option>
      <option value="0">00</option>
      <option value="30">30</option>
    </select>`;
  }

  function renderSessionList() {
    const { entries, discounts } = state.session;
    if (entries.length === 0 && discounts.length === 0) {
      return `<div class="empty">Nenhum registro nesta sessão.<br>Adicione registros acima.</div>`;
    }

    let html = '';

    if (entries.length > 0) {
      html += '<ul class="entry-list">';
      entries.forEach((entry, idx) => {
        const emp = state.employees.find(e => e.id === entry.employeeId);
        const name = emp ? emp.name : '(removido)';
        const tag = emp?.type === 'fixo' ? ` · fixo${emp.setor ? ' / ' + emp.setor : ''}` : '';
        html += `
          <li class="entry-item">
            <div class="entry-info">
              <div class="entry-name">${escapeHtml(name)}${tag}</div>
              <div class="entry-meta">
                ${entry.entry}–${entry.exit} · ${formatHours(entry.hours)}
              </div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <span class="entry-value">${formatMoney(entry.value)}</span>
              <button class="btn btn-sm btn-ghost" data-remove="${idx}">Remover</button>
            </div>
          </li>
        `;
      });
      html += '</ul>';
    }

    if (discounts.length > 0) {
      html += '<div class="discount-section-title">Descontos</div>';
      html += '<ul class="entry-list">';
      discounts.forEach((d, idx) => {
        const emp = state.employees.find(e => e.id === d.employeeId);
        const name = emp ? emp.name : '(removido)';
        html += `
          <li class="entry-item">
            <div class="entry-info">
              <div class="entry-name">${escapeHtml(name)}</div>
              ${d.note ? `<div class="entry-meta">${escapeHtml(d.note)}</div>` : ''}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
              <span class="entry-value negative">-${formatMoney(d.value)}</span>
              <button class="btn btn-sm btn-ghost" data-remove-disc="${idx}">Remover</button>
            </div>
          </li>
        `;
      });
      html += '</ul>';
    }

    const subtotal = entries.reduce((s, e) => s + e.value, 0);
    const discountTotal = discounts.reduce((s, d) => s + d.value, 0);
    const total = subtotal - discountTotal;

    if (discounts.length > 0) {
      html += `
        <div class="session-summary">
          <div class="session-summary-row">
            <span>Subtotal</span>
            <span>${formatMoney(subtotal)}</span>
          </div>
          <div class="session-summary-row" style="color:var(--danger-dark)">
            <span>Descontos</span>
            <span>-${formatMoney(discountTotal)}</span>
          </div>
          <div class="session-summary-row total">
            <span>Total a receber</span>
            <span>${formatMoney(total)}</span>
          </div>
        </div>
      `;
    } else {
      html += `<div class="session-total"><span>Total</span><span>${formatMoney(total)}</span></div>`;
    }

    return html;
  }

  /* ---------- View: Descontos ---------- */
  function renderDiscount() {
    $app.innerHTML = `
      <div class="card">
        <h2 class="section-title">Adicionar desconto</h2>

        <div class="field">
          <label for="ac-input-disc">Funcionário</label>
          <div class="autocomplete">
            <input type="text" id="ac-input-disc" placeholder="Comece a digitar o nome…" autocomplete="off">
            <div id="ac-list-disc" class="autocomplete-list" hidden></div>
          </div>
        </div>

        <div class="field">
          <label for="disc-value">Valor a descontar ($)</label>
          <input type="number" id="disc-value" min="1" step="1" placeholder="Ex.: 20" inputmode="numeric">
        </div>

        <div class="field">
          <label for="disc-note">Motivo (opcional)</label>
          <input type="text" id="disc-note" placeholder="Ex.: consumação, vale, adiantamento…">
        </div>

        <button id="btn-add-disc" class="btn btn-primary" disabled>Adicionar desconto</button>
      </div>

      <div class="card">
        <h2 class="section-title">
          Descontos da sessão
          <span style="font-size:0.8rem;color:var(--muted);font-weight:500">
            ${state.session.discounts.length} ${state.session.discounts.length === 1 ? 'desconto' : 'descontos'}
          </span>
        </h2>
        ${renderDiscountListInDiscountTab()}
      </div>
    `;

    setupAutocomplete('ac-input-disc', 'ac-list-disc', (emp) => {
      state.selectedDiscountEmployeeId = emp ? emp.id : null;
      updateDiscountButton();
    });

    document.getElementById('disc-value').addEventListener('input', updateDiscountButton);
    document.getElementById('btn-add-disc').addEventListener('click', addDiscount);

    state.session.discounts.forEach((_, idx) => {
      const btn = document.querySelector(`[data-remove-disc-tab="${idx}"]`);
      if (btn) btn.addEventListener('click', () => removeDiscount(idx, 'discount'));
    });
  }

  function renderDiscountListInDiscountTab() {
    const { discounts } = state.session;
    if (discounts.length === 0) {
      return `<div class="empty">Nenhum desconto nesta sessão.</div>`;
    }
    let html = '<ul class="entry-list">';
    discounts.forEach((d, idx) => {
      const emp = state.employees.find(e => e.id === d.employeeId);
      const name = emp ? emp.name : '(removido)';
      html += `
        <li class="entry-item">
          <div class="entry-info">
            <div class="entry-name">${escapeHtml(name)}</div>
            ${d.note ? `<div class="entry-meta">${escapeHtml(d.note)}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
            <span class="entry-value negative">-${formatMoney(d.value)}</span>
            <button class="btn btn-sm btn-ghost" data-remove-disc-tab="${idx}">Remover</button>
          </div>
        </li>
      `;
    });
    html += '</ul>';
    const total = discounts.reduce((s, d) => s + d.value, 0);
    html += `<div class="session-total" style="color:var(--danger-dark)">
      <span>Total descontos</span><span>-${formatMoney(total)}</span>
    </div>`;
    return html;
  }

  function updateDiscountButton() {
    const btn = document.getElementById('btn-add-disc');
    const value = +document.getElementById('disc-value').value;
    btn.disabled = !state.selectedDiscountEmployeeId || !value || value <= 0;
  }

  function addDiscount() {
    const empId = state.selectedDiscountEmployeeId;
    const value = +document.getElementById('disc-value').value;
    const note = document.getElementById('disc-note').value.trim();
    const emp = state.employees.find(e => e.id === empId);
    if (!emp || !value || value <= 0) return;

    state.session.discounts.push({
      employeeId: emp.id,
      value,
      note: note || undefined,
    });
    saveSessionState();
    state.selectedDiscountEmployeeId = null;
    toast(`Desconto: ${emp.name} — -${formatMoney(value)}`);
    renderDiscount();
  }

  function removeDiscount(idx, fromView) {
    state.session.discounts.splice(idx, 1);
    saveSessionState();
    if (fromView === 'insert') renderInsert();
    else renderDiscount();
  }

  /* ---------- Autocomplete reutilizável ---------- */
  function setupAutocomplete(inputId, listId, onSelect) {
    const input = document.getElementById(inputId);
    const list = document.getElementById(listId);
    let highlighted = -1;

    function open() {
      const q = input.value.trim().toLowerCase();
      const items = filterEmployees(q);
      if (items.length === 0) {
        list.innerHTML = `<div class="autocomplete-item" style="cursor:default;color:var(--muted)">Nenhum cadastro encontrado</div>`;
      } else {
        list.innerHTML = items.map((e) => `
          <div class="autocomplete-item" data-id="${e.id}">
            <span>${escapeHtml(e.name)}</span>
            <span class="tag tag-${e.type}">${e.type === 'fixo' ? 'FIXO' : 'EXTRA'}</span>
          </div>
        `).join('');
      }
      list.hidden = false;
      highlighted = -1;
    }
    function close() { list.hidden = true; }

    function selectItem(id) {
      const emp = state.employees.find(e => e.id === id);
      if (!emp) return;
      input.value = emp.name;
      close();
      onSelect(emp);
    }

    input.addEventListener('focus', open);
    input.addEventListener('input', () => {
      onSelect(null);
      open();
    });
    input.addEventListener('keydown', (ev) => {
      const items = list.querySelectorAll('.autocomplete-item[data-id]');
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        highlighted = Math.min(highlighted + 1, items.length - 1);
      } else if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        highlighted = Math.max(highlighted - 1, 0);
      } else if (ev.key === 'Enter') {
        if (highlighted >= 0 && items[highlighted]) {
          ev.preventDefault();
          selectItem(items[highlighted].dataset.id);
        }
        return;
      } else if (ev.key === 'Escape') {
        close();
        return;
      } else {
        return;
      }
      items.forEach((it, i) => it.classList.toggle('highlighted', i === highlighted));
      if (items[highlighted]) items[highlighted].scrollIntoView({ block: 'nearest' });
    });
    list.addEventListener('mousedown', (ev) => {
      const item = ev.target.closest('.autocomplete-item[data-id]');
      if (item) {
        ev.preventDefault();
        selectItem(item.dataset.id);
      }
    });
  }

  // Listener global pra fechar qualquer autocomplete ao clicar fora
  document.addEventListener('click', (ev) => {
    if (!ev.target.closest('.autocomplete')) {
      document.querySelectorAll('.autocomplete-list').forEach(l => l.hidden = true);
    }
  });

  function filterEmployees(query) {
    if (!query) {
      return [...state.employees].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    }
    const q = query.toLowerCase();
    const startsWith = [];
    const contains = [];
    for (const e of state.employees) {
      const n = e.name.toLowerCase();
      if (n.startsWith(q)) startsWith.push(e);
      else if (n.includes(q)) contains.push(e);
    }
    startsWith.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    contains.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    return [...startsWith, ...contains];
  }

  function updateFixoInfo() {
    const el = document.getElementById('fixo-info');
    if (!el) return;
    const emp = state.employees.find(e => e.id === state.selectedEmployeeId);
    if (emp && emp.type === 'fixo') {
      el.innerHTML = `<strong>Fixo</strong> · Setor: ${escapeHtml(emp.setor || '—')} · Valor da dobra: <strong>${formatMoney(emp.dobra)}</strong>`;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  }

  function readTimeForm() {
    const eh = document.getElementById('entry-h').value;
    const em = document.getElementById('entry-m').value;
    const xh = document.getElementById('exit-h').value;
    const xm = document.getElementById('exit-m').value;
    if (eh === '' || em === '' || xh === '' || xm === '') return null;
    return { entryH: +eh, entryM: +em, exitH: +xh, exitM: +xm };
  }

  function updatePreview() {
    const preview = document.getElementById('preview');
    const btn = document.getElementById('btn-add');
    const t = readTimeForm();
    const emp = state.employees.find(e => e.id === state.selectedEmployeeId);

    if (!t || !emp) {
      preview.classList.add('hidden');
      btn.disabled = true;
      return;
    }
    const hours = computeHours(t.entryH, t.entryM, t.exitH, t.exitM);
    if (hours <= 0) {
      preview.classList.add('hidden');
      btn.disabled = true;
      return;
    }
    const value = emp.type === 'fixo' ? emp.dobra : calculateExtraValue(hours);
    preview.classList.remove('hidden');
    preview.innerHTML = `${formatHours(hours)} trabalhadas · <span class="preview-value">${formatMoney(value)}</span>`;
    btn.disabled = false;
  }

  function addEntry() {
    const t = readTimeForm();
    const emp = state.employees.find(e => e.id === state.selectedEmployeeId);
    if (!t || !emp) return;
    const hours = computeHours(t.entryH, t.entryM, t.exitH, t.exitM);
    if (hours <= 0) { toast('Horário inválido'); return; }
    const value = emp.type === 'fixo' ? emp.dobra : calculateExtraValue(hours);
    state.session.entries.push({
      employeeId: emp.id,
      entry: formatTime(t.entryH, t.entryM),
      exit: formatTime(t.exitH, t.exitM),
      hours,
      value,
    });
    saveSessionState();
    state.selectedEmployeeId = null;
    toast(`Adicionado: ${emp.name} — ${formatMoney(value)}`);
    renderInsert();
  }

  function removeEntry(idx) {
    state.session.entries.splice(idx, 1);
    saveSessionState();
    renderInsert();
  }

  /* ---------- Finalizar ---------- */
  function openFinalizeModal() {
    if (state.session.entries.length === 0 && state.session.discounts.length === 0) return;
    const text = buildSessionText(state.session.entries, state.session.discounts, new Date());

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">Finalizar sessão</h2>
        <p style="margin:0 0 10px;color:var(--muted);font-size:0.9rem">
          Copie o texto abaixo e envie no WhatsApp. Ao confirmar, a sessão será arquivada no histórico.
        </p>
        <textarea class="copy-area" id="copy-text" readonly>${escapeHtml(text)}</textarea>
        <div class="modal-actions">
          <button class="btn btn-ghost" id="btn-cancel">Cancelar</button>
          <button class="btn btn-warning" id="btn-copy">Copiar</button>
          <button class="btn btn-primary" id="btn-confirm">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();

    document.getElementById('btn-cancel').addEventListener('click', close);
    document.getElementById('btn-copy').addEventListener('click', async () => {
      const ta = document.getElementById('copy-text');
      try { await navigator.clipboard.writeText(ta.value); toast('Texto copiado!'); }
      catch { ta.select(); document.execCommand('copy'); toast('Texto copiado!'); }
    });
    document.getElementById('btn-confirm').addEventListener('click', () => {
      const finalizedAt = Date.now();
      state.history.unshift({
        id: uid(),
        finalizedAt,
        entries: [...state.session.entries],
        discounts: [...state.session.discounts],
      });
      state.session = { entries: [], discounts: [] };
      saveSessionState();
      save(STORAGE_HISTORY, state.history);
      close();
      toast('Sessão arquivada no histórico');
      render();
    });
  }

  function groupByEmployee(entries, discounts) {
    const groups = new Map();
    function ensure(id) {
      if (!groups.has(id)) {
        groups.set(id, {
          employee: state.employees.find(x => x.id === id),
          entries: [], discounts: [],
          subtotal: 0, discountTotal: 0, total: 0,
        });
      }
      return groups.get(id);
    }
    for (const e of entries) {
      const g = ensure(e.employeeId);
      g.entries.push(e);
      g.subtotal += e.value;
    }
    for (const d of (discounts || [])) {
      const g = ensure(d.employeeId);
      g.discounts.push(d);
      g.discountTotal += d.value;
    }
    groups.forEach(g => { g.total = g.subtotal - g.discountTotal; });
    return [...groups.values()];
  }

  function buildSessionText(entries, discounts, date) {
    const dateStr = date.toLocaleDateString('pt-BR');
    const timeStr = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const groups = groupByEmployee(entries, discounts);
    const grandTotal = groups.reduce((s, g) => s + g.total, 0);

    let text = `*VIXE — Pagamentos ${dateStr} ${timeStr}*\n\n`;
    for (const g of groups) {
      const emp = g.employee;
      const name = emp ? emp.name : '(removido)';
      const tag = emp?.type === 'fixo'
        ? ` (fixo${emp.setor ? ' / ' + emp.setor : ''})`
        : '';
      text += `*${name}*${tag} — ${formatMoney(g.total)}\n`;
      if (emp?.pix) text += `PIX: ${emp.pix}\n`;
      for (const e of g.entries) {
        text += `  • ${e.entry}–${e.exit} (${formatHours(e.hours)}) — ${formatMoney(e.value)}\n`;
      }
      if (g.discounts.length > 0) {
        if (g.entries.length > 0) {
          text += `  Subtotal: ${formatMoney(g.subtotal)}\n`;
        }
        for (const d of g.discounts) {
          const noteStr = d.note ? ` (${d.note})` : '';
          text += `  Desconto: -${formatMoney(d.value)}${noteStr}\n`;
        }
        text += `  Total a receber: *${formatMoney(g.total)}*\n`;
      }
      text += '\n';
    }
    text += `*TOTAL GERAL: ${formatMoney(grandTotal)}*`;
    return text;
  }

  /* ---------- View: Cadastros ---------- */
  function renderRegister() {
    const sorted = [...state.employees].sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR'));

    $app.innerHTML = `
      <button id="btn-new" class="btn btn-primary" style="margin-bottom:14px">+ Novo cadastro</button>
      <div id="employee-list">
        ${sorted.length === 0
          ? `<div class="empty">Nenhum cadastro ainda.<br>Clique em "+ Novo cadastro" pra começar.</div>`
          : sorted.map(employeeCardHtml).join('')
        }
      </div>
    `;

    document.getElementById('btn-new').addEventListener('click', () => openEmployeeModal());

    sorted.forEach(emp => {
      const editBtn = document.querySelector(`[data-edit="${emp.id}"]`);
      const delBtn = document.querySelector(`[data-del="${emp.id}"]`);
      if (editBtn) editBtn.addEventListener('click', () => openEmployeeModal(emp.id));
      if (delBtn) delBtn.addEventListener('click', () => deleteEmployee(emp.id));
    });
  }

  function employeeCardHtml(emp) {
    const tag = emp.type === 'fixo' ? 'FIXO' : 'EXTRA';
    const tagClass = emp.type === 'fixo' ? 'tag-fixo' : 'tag-extra';
    const fixoMeta = emp.type === 'fixo'
      ? `<div class="employee-meta">Setor: ${escapeHtml(emp.setor || '—')} · Dobra: <strong>${formatMoney(emp.dobra || 0)}</strong></div>`
      : '';
    return `
      <div class="employee-card">
        <div class="employee-info">
          <div class="employee-name">
            ${escapeHtml(emp.name)} <span class="tag ${tagClass}">${tag}</span>
          </div>
          ${emp.pix ? `<div class="employee-meta">PIX: ${escapeHtml(emp.pix)}</div>` : ''}
          ${fixoMeta}
        </div>
        <div class="employee-actions">
          <button class="btn btn-sm btn-ghost" data-edit="${emp.id}">Editar</button>
          <button class="btn btn-sm btn-danger" data-del="${emp.id}">Excluir</button>
        </div>
      </div>
    `;
  }

  function openEmployeeModal(id = null) {
    const emp = id ? state.employees.find(e => e.id === id) : null;
    const isEdit = !!emp;

    const modal = document.createElement('div');
    modal.className = 'modal-backdrop';
    modal.innerHTML = `
      <div class="modal">
        <h2 class="modal-title">${isEdit ? 'Editar' : 'Novo'} cadastro</h2>

        <div class="field">
          <label for="emp-name">Nome completo</label>
          <input type="text" id="emp-name" placeholder="Ex.: Vitor Machado" value="${escapeAttr(emp?.name || '')}">
        </div>

        <div class="field">
          <label>Tipo</label>
          <div class="radio-group">
            <label><input type="radio" name="emp-type" value="extra" ${(!emp || emp.type === 'extra') ? 'checked' : ''}>Extra</label>
            <label><input type="radio" name="emp-type" value="fixo" ${emp?.type === 'fixo' ? 'checked' : ''}>Fixo</label>
          </div>
        </div>

        <div class="field">
          <label for="emp-pix">Chave PIX</label>
          <input type="text" id="emp-pix" placeholder="CPF, telefone, e-mail ou aleatória" value="${escapeAttr(emp?.pix || '')}">
        </div>

        <div id="emp-fixo-fields" class="fixo-fields" ${emp?.type === 'fixo' ? '' : 'hidden'}>
          <div class="field">
            <label for="emp-dobra">Valor da dobra ($)</label>
            <input type="number" id="emp-dobra" min="0" step="1" placeholder="Ex.: 200" value="${emp?.dobra ?? ''}">
          </div>
          <div class="field">
            <label for="emp-setor">Setor</label>
            <select id="emp-setor">
              <option value="" disabled ${!emp?.setor ? 'selected' : ''}>Selecione…</option>
              ${SETORES.map(s => `<option value="${s}" ${emp?.setor === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>

        <div class="modal-actions">
          <button class="btn btn-ghost" id="emp-cancel">Cancelar</button>
          <button class="btn btn-primary" id="emp-save">Salvar</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    const close = () => modal.remove();

    function updateRadioClasses() {
      modal.querySelectorAll('.radio-group label').forEach(lbl => {
        const inp = lbl.querySelector('input');
        lbl.classList.toggle('checked', !!inp && inp.checked);
      });
    }
    updateRadioClasses();
    modal.querySelectorAll('input[name="emp-type"]').forEach(r => {
      r.addEventListener('change', () => {
        const fixoFields = document.getElementById('emp-fixo-fields');
        const isFixo = modal.querySelector('input[name="emp-type"]:checked').value === 'fixo';
        fixoFields.hidden = !isFixo;
        updateRadioClasses();
      });
    });

    document.getElementById('emp-cancel').addEventListener('click', close);
    document.getElementById('emp-save').addEventListener('click', () => {
      const name = document.getElementById('emp-name').value.trim();
      const type = document.querySelector('input[name="emp-type"]:checked').value;
      const pix = document.getElementById('emp-pix').value.trim();

      if (!name) { toast('Informe o nome completo'); return; }

      const data = { name, type, pix };
      if (type === 'fixo') {
        const dobra = +document.getElementById('emp-dobra').value;
        const setor = document.getElementById('emp-setor').value;
        if (!dobra || dobra <= 0) { toast('Informe um valor de dobra válido'); return; }
        if (!setor) { toast('Selecione o setor'); return; }
        data.dobra = dobra;
        data.setor = setor;
      }

      if (isEdit) {
        Object.assign(emp, data);
        if (type !== 'fixo') { delete emp.dobra; delete emp.setor; }
      } else {
        state.employees.push({ id: uid(), ...data });
      }
      save(STORAGE_EMPLOYEES, state.employees);
      close();
      toast(isEdit ? 'Cadastro atualizado' : 'Cadastro salvo');
      renderRegister();
    });
  }

  function deleteEmployee(id) {
    const emp = state.employees.find(e => e.id === id);
    if (!emp) return;
    if (!confirm(`Excluir "${emp.name}"?\n\nIsso não apaga registros já feitos no histórico ou na sessão atual.`)) return;
    state.employees = state.employees.filter(e => e.id !== id);
    save(STORAGE_EMPLOYEES, state.employees);
    toast('Cadastro removido');
    renderRegister();
  }

  /* ---------- View: Histórico ---------- */
  function renderHistory() {
    if (state.history.length === 0) {
      $app.innerHTML = `<div class="empty">Nenhuma sessão arquivada ainda.<br>Use "Finalizar" na tela inicial.</div>`;
      return;
    }

    $app.innerHTML = state.history.map(historyItemHtml).join('');

    state.history.forEach(h => {
      const headerEl = document.querySelector(`[data-toggle="${h.id}"]`);
      const delEl = document.querySelector(`[data-hist-del="${h.id}"]`);
      const copyEl = document.querySelector(`[data-hist-copy="${h.id}"]`);
      if (headerEl) headerEl.addEventListener('click', () => {
        headerEl.parentElement.classList.toggle('open');
      });
      if (delEl) delEl.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (!confirm('Excluir esta sessão do histórico?')) return;
        state.history = state.history.filter(x => x.id !== h.id);
        save(STORAGE_HISTORY, state.history);
        toast('Sessão excluída');
        renderHistory();
      });
      if (copyEl) copyEl.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const text = buildSessionText(h.entries, h.discounts || [], new Date(h.finalizedAt));
        try { await navigator.clipboard.writeText(text); toast('Texto copiado!'); }
        catch { toast('Não foi possível copiar'); }
      });
    });
  }

  function historyItemHtml(h) {
    const date = new Date(h.finalizedAt);
    const dateStr = date.toLocaleDateString('pt-BR') + ' ' +
      date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const discounts = h.discounts || [];
    const groups = groupByEmployee(h.entries, discounts);
    const total = groups.reduce((s, g) => s + g.total, 0);

    let body = '';
    for (const g of groups) {
      const emp = g.employee;
      const name = emp ? emp.name : '(removido)';
      const tag = emp?.type === 'fixo'
        ? ` <span class="tag tag-fixo">FIXO${emp.setor ? ' · ' + emp.setor : ''}</span>`
        : '';
      body += `
        <div class="history-person">
          <span>${escapeHtml(name)}${tag}</span>
          <span style="color:var(--accent-dark)">${formatMoney(g.total)}</span>
        </div>
        ${emp?.pix ? `<div class="history-person-pix">PIX: ${escapeHtml(emp.pix)}</div>` : ''}
        ${g.entries.map(e => `
          <div class="history-shift">
            <span>${e.entry}–${e.exit} · ${formatHours(e.hours)}</span>
            <span>${formatMoney(e.value)}</span>
          </div>
        `).join('')}
        ${g.discounts.length > 0 && g.entries.length > 0 ? `
          <div class="history-shift" style="font-style:italic;color:var(--muted)">
            <span>Subtotal</span><span>${formatMoney(g.subtotal)}</span>
          </div>
        ` : ''}
        ${g.discounts.map(d => `
          <div class="history-discount">
            <span>Desconto${d.note ? ' · ' + escapeHtml(d.note) : ''}</span>
            <span>-${formatMoney(d.value)}</span>
          </div>
        `).join('')}
      `;
    }

    const numEntries = h.entries.length;
    const numDiscounts = discounts.length;
    const subtitle =
      `${numEntries} ${numEntries === 1 ? 'registro' : 'registros'}` +
      (numDiscounts ? ` · ${numDiscounts} ${numDiscounts === 1 ? 'desconto' : 'descontos'}` : '') +
      ` · ${groups.length} ${groups.length === 1 ? 'pessoa' : 'pessoas'}`;

    return `
      <div class="history-item" id="h-${h.id}">
        <div class="history-header" data-toggle="${h.id}">
          <div>
            <div class="history-date">${dateStr}</div>
            <div style="font-size:0.8rem;color:var(--muted)">${subtitle}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px">
            <span class="history-total">${formatMoney(total)}</span>
            <span class="history-arrow">▶</span>
          </div>
        </div>
        <div class="history-body">
          ${body}
          <div class="history-actions">
            <button class="btn btn-sm btn-info" data-hist-copy="${h.id}">Copiar texto</button>
            <button class="btn btn-sm btn-danger" data-hist-del="${h.id}">Excluir</button>
          </div>
        </div>
      </div>
    `;
  }

  /* ---------- Util ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  let toastTimer;
  function toast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  /* ---------- Init ---------- */
  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => setView(t.dataset.view));
  });

  render();
})();
