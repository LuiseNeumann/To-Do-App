/* ══════════════════════════════════════════════════════
   Planer App – app.js
   ══════════════════════════════════════════════════════ */

const API = '';  // relative URLs via Flask

// ── State ──────────────────────────────────────────────
let todos = [];
let calendarEntries = [];
let currentView = 'week';
let currentDate = new Date();
let editingTodoId = null;
let pendingCalEntry = null;   // { todo_id, entry_date, start_time, end_time }
let deletingTodoId = null;
let dragTodoId = null;
let eisenAssignments = JSON.parse(localStorage.getItem('eisenAssignments') || '{}');
// { todoId: 'do' | 'schedule' | 'delegate' | 'eliminate' }
let partnerEntries = [];
let dragGhost = null;
let currentFilter = 'all';
let currentProfile = 'me';         // 'me' oder 'partner'
let partnerView = 'week';
let partnerDate = new Date();
let selectedRecurrence = 'once';

// ── DOM Refs ────────────────────────────────────────────
const todoList     = document.getElementById('todoList');
const todoEmpty    = document.getElementById('todoEmpty');
const trayItems    = document.getElementById('trayItems');
const calWrap      = document.getElementById('calendarWrapper');
const calSubtitle  = document.getElementById('calendarSubtitle');

const modalTodo      = document.getElementById('modalTodo');
const modalCalEntry  = document.getElementById('modalCalEntry');
const modalConflict  = document.getElementById('modalConflict');
const modalDelete    = document.getElementById('modalDelete');

// ── Utility ─────────────────────────────────────────────
function fmt(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('de-DE', { day:'2-digit', month:'2-digit', year:'numeric' });
}
function isOverdue(dateStr) {
  if (!dateStr) return false;
  return new Date(dateStr + 'T23:59:59') < new Date();
}
const PRIO_LABELS = {5:'Höchste', 4:'Hoch', 3:'Mittel', 2:'Niedrig', 1:'Minimal'};

function toast(msg, type='info') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

// ── API Calls ────────────────────────────────────────────
async function fetchTodos() {
  const r = await fetch(`${API}/api/todos`);
  todos = await r.json();
  renderTodos();
  renderTray();
  updateStats();
}

async function fetchCalendar(start, end, profile = 'me') {
  const url = `${API}/api/calendar?profile=${profile}` +
              (start && end ? `&start=${start}&end=${end}` : '');
  const r = await fetch(url);
  const entries = await r.json();
  if (profile === 'me') {
    calendarEntries = entries;
    renderCalendar();
  } else {
    partnerEntries = entries;
    renderPartnerCalendar();
  }
}

async function createTodo(data) {
  const r = await fetch(`${API}/api/todos`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
  const todo = await r.json();
  todos.unshift(todo);
  renderTodos();
  renderTray();
  updateStats();
  toast('Aufgabe erstellt', 'success');
}

async function updateTodo(id, data) {
  const r = await fetch(`${API}/api/todos/${id}`, {
    method: 'PUT', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
  const updated = await r.json();
  todos = todos.map(t => t.id === id ? updated : t);
  renderTodos();
  renderTray();
  updateStats();
}

async function deleteTodo(id) {
  await fetch(`${API}/api/todos/${id}`, { method: 'DELETE' });
  todos = todos.filter(t => t.id !== id);
  calendarEntries = calendarEntries.filter(e => e.todo_id !== id);
  renderTodos();
  renderTray();
  updateStats();
  renderCalendar();
  toast('Aufgabe gelöscht', 'info');
}

async function createCalEntry(data) {
  const r = await fetch(`${API}/api/calendar`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
  if (r.status === 409) {
    pendingCalEntry = data;
    openModal('modalConflict');
    return false;
  }
  const entry = await r.json();
  if (data.profile === 'partner') {
    partnerEntries.push(entry);
    renderPartnerCalendar();
  } else {
    calendarEntries.push(entry);
    renderCalendar();
  }
  toast('Aufgabe eingeplant', 'success');
  return true;
}

async function forceCreateCalEntry(data) {
  const r = await fetch(`${API}/api/calendar/force`, {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify(data)
  });
  const entry = await r.json();
  calendarEntries = calendarEntries.filter(
    e => !(e.todo_id === data.todo_id && e.entry_date === data.entry_date)
  );
  calendarEntries.push(entry);
  renderCalendar();
  toast('Eintrag überschrieben', 'success');
}

async function deleteCalEntry(id) {
  await fetch(`${API}/api/calendar/${id}`, { method: 'DELETE' });
  calendarEntries = calendarEntries.filter(e => e.id !== id);
  renderCalendar();
  toast('Kalendereintrag entfernt', 'info');
}

// ── Stats ────────────────────────────────────────────────
function updateStats() {
  document.getElementById('statTotal').textContent  = todos.length;
  document.getElementById('statDone').textContent   = todos.filter(t => t.completed).length;
  document.getElementById('statUrgent').textContent = todos.filter(t => t.priority >= 4 && !t.completed).length;
}

// ── TODO Rendering ────────────────────────────────────────
function filteredTodos() {
  switch(currentFilter) {
    case 'all':     return todos;
    case 'pending': return todos.filter(t => !t.completed);
    case 'done':    return todos.filter(t =>  t.completed);
    default:        return todos.filter(t => t.priority === parseInt(currentFilter));
  }
}

function renderTodos() {
  const list = filteredTodos();
  todoEmpty.style.display = list.length ? 'none' : 'flex';
  const existing = new Map();
  todoList.querySelectorAll('.todo-card').forEach(el => existing.set(parseInt(el.dataset.id), el));

  // Remove cards not in filtered list
  existing.forEach((el, id) => {
    if (!list.find(t => t.id === id)) el.remove();
  });

  // Add / update cards
  list.forEach((todo, idx) => {
    let card = existing.get(todo.id);
    if (!card) {
      card = buildTodoCard(todo);
      todoList.appendChild(card);
    } else {
      const newCard = buildTodoCard(todo);
      card.replaceWith(newCard);
    }
  });
}

function buildTodoCard(todo) {
  const card = document.createElement('div');
  card.className = `todo-card prio-${todo.priority}${todo.completed ? ' completed' : ''}`;
  card.dataset.id = todo.id;

  const deadlineTag = todo.deadline
    ? `<span class="tag tag-dead${isOverdue(todo.deadline) && !todo.completed ? ' overdue' : ''}">📅 ${fmt(todo.deadline)}</span>`
    : '';

  card.innerHTML = `
    <button class="todo-check" title="Erledigt">${todo.completed ? '✓' : ''}</button>
    <div class="todo-body">
      <div class="todo-title-text">${escHtml(todo.title)}</div>
      ${todo.description ? `<div class="todo-desc">${escHtml(todo.description)}</div>` : ''}
      <div class="todo-tags">
        <span class="tag tag-prio">★ ${todo.priority} – ${PRIO_LABELS[todo.priority]}</span>
        <span class="tag tag-dur">⏱ ${formatDuration(todo.duration_hours)}</span>
        ${deadlineTag}
      </div>
    </div>
    <div class="todo-actions">
      <button class="action-btn cal" title="In Kalender einplanen">📅</button>
      <button class="action-btn edit" title="Bearbeiten">✎</button>
      <button class="action-btn del" title="Löschen">✕</button>
    </div>
  `;

  card.querySelector('.todo-check').addEventListener('click', () => {
    updateTodo(todo.id, { completed: todo.completed ? 0 : 1 });
  });
  card.querySelector('.action-btn.edit').addEventListener('click', () => openEditTodo(todo));
  card.querySelector('.action-btn.del').addEventListener('click', () => {
    deletingTodoId = todo.id;
    openModal('modalDelete');
  });
  card.querySelector('.action-btn.cal').addEventListener('click', () => openCalEntryModal(todo));

  return card;
}

function formatDuration(h) {
  if (!h) return '–';
  const hours = Math.floor(h);
  const mins  = Math.round((h - hours) * 60);
  if (hours === 0) return `${mins}min`;
  if (mins === 0)  return `${hours}h`;
  return `${hours}h ${mins}min`;
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Tray Rendering ────────────────────────────────────────
function renderTray() {
  trayItems.innerHTML = '';
  const incomplete = todos.filter(t => !t.completed);
  if (incomplete.length === 0) {
    trayItems.innerHTML = '<span style="color:var(--text-light);font-size:0.8rem;padding:4px 0;">Alle Aufgaben erledigt 🎉</span>';
    return;
  }
  incomplete.forEach(todo => {
    const item = document.createElement('div');
    item.className = 'tray-item';
    item.draggable = true;
    item.dataset.todoId = todo.id;
    item.innerHTML = `
      <span class="prio-dot prio-dot-${todo.priority}"></span>
      <span>${escHtml(todo.title)}</span>
      <span style="color:var(--text-light);font-size:0.75rem;">${formatDuration(todo.duration_hours)}</span>
    `;
    item.addEventListener('dragstart', onDragStart);
    item.addEventListener('dragend', onDragEnd);
    trayItems.appendChild(item);
  });
}

// ── Calendar ──────────────────────────────────────────────
function getWeekRange(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = (day === 0 ? -6 : 1) - day; // Monday first
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  mon.setHours(0,0,0,0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: mon, end: sun };
}

function dateToISO(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function renderCalendar() {
  if (currentView === 'week') renderWeekView();
  else renderMonthView();
  updateCalendarSubtitle();
}

function updateCalendarSubtitle() {
  if (currentView === 'week') {
    const { start, end } = getWeekRange(currentDate);
    calSubtitle.textContent = `${start.toLocaleDateString('de-DE',{day:'2-digit',month:'short'})} – ${end.toLocaleDateString('de-DE',{day:'2-digit',month:'short',year:'numeric'})}`;
  } else {
    calSubtitle.textContent = currentDate.toLocaleDateString('de-DE',{month:'long',year:'numeric'});
  }
}

const HOURS = Array.from({length: 24}, (_, i) => i); // 0–23
const DAY_NAMES = ['Mo','Di','Mi','Do','Fr','Sa','So'];


function showSlotPicker(isoDate, hour, x, y) {
  // Altes Popup entfernen
  document.getElementById('slotPicker')?.remove();

  const incomplete = todos.filter(t => !t.completed);
  const popup = document.createElement('div');
  popup.id = 'slotPicker';
  popup.className = 'slot-picker';
  popup.style.cssText = `left:${Math.min(x, window.innerWidth - 240)}px;top:${Math.min(y, window.innerHeight - 300)}px;`;

  popup.innerHTML = `
    <div class="slot-picker-header">
      <span>Aufgabe wählen</span>
      <button onclick="document.getElementById('slotPicker').remove()">✕</button>
    </div>
    <div class="slot-picker-list">
      ${incomplete.map(t => `
        <div class="slot-picker-item" data-id="${t.id}">
          <span class="prio-dot prio-dot-${t.priority}"></span>
          <span>${escHtml(t.title)}</span>
        </div>
      `).join('')}
    </div>
    <div style="padding:8px 12px;border-top:1px solid var(--border);">
      <button class="btn-primary" style="width:100%;font-size:0.78rem;" id="slotPickerCustom">+ Neue Aufgabe + Termin</button>
    </div>
  `;

  popup.querySelectorAll('.slot-picker-item').forEach(item => {
    item.addEventListener('click', () => {
      const todo = todos.find(t => t.id === parseInt(item.dataset.id));
      popup.remove();
      calEntryTodoContext = todo;
      openCalEntryModalWithDate(todo, isoDate, hour);
    });
  });

  popup.querySelector('#slotPickerCustom').addEventListener('click', () => {
    popup.remove();
    openAddTodo();
  });

  document.body.appendChild(popup);
  setTimeout(() => document.addEventListener('click', function handler(e) {
    if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', handler); }
  }), 50);
}



function renderWeekView() {
  renderWeekViewInto(calWrap, currentDate, calendarEntries, 'me');
}

function renderMonthView() {
  renderMonthViewInto(calWrap, currentDate, calendarEntries, 'me');
}

function renderWeekViewInto(wrapper, refDate, entries, profile) {
  const { start } = getWeekRange(refDate);
  const days = Array.from({length:7}, (_,i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const todayStr = dateToISO(new Date());

  let html = '<div class="week-grid">';
  html += `<div class="week-time-col" style="border-bottom:1.5px solid var(--border);background:var(--surface);"></div>`;
  days.forEach((d, i) => {
    const iso = dateToISO(d);
    const isToday = iso === todayStr;
    html += `<div class="week-day-header${isToday?' today':''}">
      <div class="week-day-name">${DAY_NAMES[i]}</div>
      <div class="week-day-num">${d.getDate()}</div>
    </div>`;
  });
  HOURS.forEach(hour => {
    html += `<div class="time-label" style="border-right:1.5px solid var(--border)">${String(hour).padStart(2,'0')}:00</div>`;
    days.forEach(day => {
      const iso = dateToISO(day);
      html += `<div class="week-slot" data-date="${iso}" data-hour="${hour}" data-profile="${profile}"></div>`;
    });
  });
  html += '</div>';
  wrapper.innerHTML = html;

  wrapper.querySelectorAll('.week-slot').forEach(slot => {
    slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('drag-over'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', e => {
      e.preventDefault();
      slot.classList.remove('drag-over');
      currentProfile = slot.dataset.profile;
      handleDrop(slot.dataset.date, slot.dataset.hour, null);
    });
    slot.addEventListener('click', (e) => {
      if (e.target.closest('.cal-entry')) return;
      const incomplete = todos.filter(t => !t.completed);
      if (!incomplete.length) { toast('Keine offenen Aufgaben vorhanden', 'info'); return; }
      currentProfile = slot.dataset.profile;
      showSlotPicker(slot.dataset.date, slot.dataset.hour, e.clientX, e.clientY);
    });
  });

  placeWeekEntries(days, wrapper, entries, profile);
}

function renderMonthViewInto(wrapper, refDate, entries, profile) {
  const year  = refDate.getFullYear();
  const month = refDate.getMonth();
  const first = new Date(year, month, 1);
  const todayStr = dateToISO(new Date());

  let startDay = first.getDay();
  startDay = startDay === 0 ? 6 : startDay - 1;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - startDay);

  let html = `<div class="month-grid">
    <div class="month-weekday-row">
      ${DAY_NAMES.map(d => `<div class="month-weekday">${d}</div>`).join('')}
    </div>
    <div class="month-days-grid">`;

  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const iso = dateToISO(d);
    const isCurrentMonth = d.getMonth() === month;
    const isToday = iso === todayStr;
    const dayEntries = entries.filter(e => e.entry_date === iso);

    html += `<div class="month-day${!isCurrentMonth?' other-month':''}${isToday?' today':''}" data-date="${iso}" data-profile="${profile}">
      <div class="month-day-num">${d.getDate()}</div>`;
    dayEntries.slice(0,3).forEach(entry => {
      html += `<div class="month-entry cal-prio-${entry.priority}" data-entry-id="${entry.id}">
        <span style="overflow:hidden;text-overflow:ellipsis;">${escHtml(entry.title)}</span>
        <span class="entry-del">✕</span>
      </div>`;
    });
    if (dayEntries.length > 3) {
      html += `<div style="font-size:0.7rem;color:var(--text-light);">+${dayEntries.length-3} mehr</div>`;
    }
    html += `</div>`;
  }
  html += '</div></div>';
  wrapper.innerHTML = html;

  wrapper.querySelectorAll('.month-day').forEach(cell => {
    cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('drag-over'); });
    cell.addEventListener('dragleave', () => cell.classList.remove('drag-over'));
    cell.addEventListener('drop', e => {
      e.preventDefault();
      cell.classList.remove('drag-over');
      currentProfile = cell.dataset.profile;
      handleDrop(cell.dataset.date, null, null);
    });
  });
  wrapper.querySelectorAll('.entry-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const entryId = btn.closest('[data-entry-id]').dataset.entryId;
      if (!String(entryId).startsWith('virtual_')) deleteCalEntry(parseInt(entryId));
    });
  });
}

function placeWeekEntries(days, wrapper = calWrap, entries = calendarEntries, profile = 'me') {
  days.forEach(day => {
    const iso = dateToISO(day);
    const dayEntries = entries.filter(e => e.entry_date === iso);
    dayEntries.forEach(entry => {
      const [sh, sm] = entry.start_time.split(':').map(Number);
      const [eh, em] = entry.end_time.split(':').map(Number);
      const startSlot = wrapper.querySelector(`.week-slot[data-date="${iso}"][data-hour="${sh}"]`);
      if (!startSlot) return;
      const totalMins = (eh * 60 + em) - (sh * 60 + sm);
      const slotH = 52;
      const height = Math.max(20, (totalMins / 60) * slotH);
      const topOffset = (sm / 60) * slotH;

      const recIcon = entry.recurrence === 'daily' ? ' 🔄' : entry.recurrence === 'weekly' ? ' 🔁' : entry.recurrence === 'yearly' ? ' 📅' : '';
      const chip = document.createElement('div');
      chip.className = `cal-entry cal-prio-${entry.priority}`;
      chip.style.cssText = `top:${topOffset}px;height:${height}px;`;
      chip.innerHTML = `
        <span style="overflow:hidden;text-overflow:ellipsis;">${escHtml(entry.title)}${recIcon}<br>
        <small>${entry.start_time}–${entry.end_time}</small></span>
        <span class="entry-del" title="Entfernen">✕</span>
      `;
      chip.querySelector('.entry-del').addEventListener('click', e => {
        e.stopPropagation();
        if (!String(entry.id).startsWith('virtual_')) deleteCalEntry(entry.id);
        else toast('Wiederkehrenden Termin beim Original löschen', 'info');
      });
      startSlot.style.position = 'relative';
      startSlot.appendChild(chip);
    });
  });
}

// ── Drag & Drop ───────────────────────────────────────────
function onDragStart(e) {
  dragTodoId = parseInt(e.currentTarget.dataset.todoId);
  e.dataTransfer.effectAllowed = 'copy';
  e.dataTransfer.setData('text/plain', dragTodoId);

  // Custom ghost
  const todo = todos.find(t => t.id === dragTodoId);
  dragGhost = document.createElement('div');
  dragGhost.className = 'drag-ghost';
  dragGhost.textContent = todo ? todo.title : 'Aufgabe';
  document.body.appendChild(dragGhost);
  e.dataTransfer.setDragImage(dragGhost, 20, 10);
}

function onDragEnd() {
  if (dragGhost) { dragGhost.remove(); dragGhost = null; }
  dragTodoId = null;
}

function handleDrop(isoDate, hourStr, endHourStr) {
  if (!dragTodoId) return;
  const todo = todos.find(t => t.id === dragTodoId);
  if (!todo) return;

  if (!hourStr) {
    openCalEntryModalWithDate(todo, isoDate, null);
    return;
  }

  const hour = parseInt(hourStr);
  const startTime = `${String(hour).padStart(2,'0')}:00`;
  const endH = Math.min(23, hour + Math.ceil(todo.duration_hours));
  const endMins = Math.round((todo.duration_hours % 1) * 60);
  const endTime = `${String(endH).padStart(2,'0')}:${String(endMins).padStart(2,'0')}`;

  createCalEntry({
    todo_id: todo.id,
    entry_date: isoDate,
    start_time: startTime,
    end_time: endTime,
    title: todo.title,
    recurrence: selectedRecurrence,
    profile: currentProfile,
  });
}

// ── Calendar Entry Modal ──────────────────────────────────
let calEntryTodoContext = null;

function openCalEntryModal(todo) {
  // Recurrence zurücksetzen
  selectedRecurrence = 'once';
  document.querySelectorAll('.rec-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === 'once');
  });

  calEntryTodoContext = todo;
  document.getElementById('calEntryTitle').textContent = 'Aufgabe einplanen';
  document.getElementById('calEntryTodoName').textContent = todo.title;
  document.getElementById('calEntryDate').value = dateToISO(new Date());
  document.getElementById('calEntryStart').value = '08:00';
  const endH = Math.min(23, 8 + Math.ceil(todo.duration_hours));
  document.getElementById('calEntryEnd').value = `${String(endH).padStart(2,'0')}:00`;
  openModal('modalCalEntry');
}

function openCalEntryModalWithDate(todo, isoDate, hourStr) {
  if (todo) {
    // Recurrence zurücksetzen
  selectedRecurrence = 'once';
  document.querySelectorAll('.rec-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === 'once');
  });

    calEntryTodoContext = todo;
    document.getElementById('calEntryTodoName').textContent = todo.title;
  }
  document.getElementById('calEntryDate').value = isoDate;
  if (hourStr !== null) {
    const h = parseInt(hourStr);
    document.getElementById('calEntryStart').value = `${String(h).padStart(2,'0')}:00`;
    const endH = Math.min(23, h + (calEntryTodoContext ? Math.ceil(calEntryTodoContext.duration_hours) : 1));
    document.getElementById('calEntryEnd').value = `${String(endH).padStart(2,'0')}:00`;
  }
  if (!calEntryTodoContext) {
    // Pick from list? Just show dropdown-like prompt via existing modal
    const incomplete = todos.filter(t => !t.completed);
    if (incomplete.length) calEntryTodoContext = incomplete[0];
    document.getElementById('calEntryTodoName').textContent = calEntryTodoContext ? calEntryTodoContext.title : '–';
  }
  openModal('modalCalEntry');
}

document.getElementById('btnSaveCalEntry').addEventListener('click', async () => {
  if (!calEntryTodoContext && !document.getElementById('calEntryCustomTitle').value.trim()) {
    toast('Bitte Aufgabe wählen oder Titel eingeben', 'error');
    return;
  }
  const data = {
    todo_id:    calEntryTodoContext ? calEntryTodoContext.id : null,
    entry_date: document.getElementById('calEntryDate').value,
    start_time: document.getElementById('calEntryStart').value,
    end_time:   document.getElementById('calEntryEnd').value,
    title:      document.getElementById('calEntryCustomTitle').value.trim(),
    recurrence: selectedRecurrence,
    profile:    currentProfile,
  };
  if (!data.entry_date || !data.start_time || !data.end_time) {
    toast('Bitte alle Felder ausfüllen', 'error');
    return;
  }
  closeModal('modalCalEntry');
  const ok = await createCalEntry(data);
  if (ok) {
    // Neu laden damit wiederkehrende Einträge expandiert werden
    if (currentProfile === 'partner') {
      fetchPartnerCalendarForCurrentView();
    } else {
      fetchCalendarForCurrentView();
    }
  }
});

// ── Conflict Modal ────────────────────────────────────────
document.getElementById('btnConflictOverwrite').addEventListener('click', async () => {
  closeModal('modalConflict');
  if (pendingCalEntry) {
    await forceCreateCalEntry(pendingCalEntry);
    pendingCalEntry = null;
  }
});

document.getElementById('btnConflictKeep').addEventListener('click', () => {
  closeModal('modalConflict');
  if (pendingCalEntry) {
    // Re-open calendar entry modal for a new date
    openCalEntryModal(todos.find(t => t.id === pendingCalEntry.todo_id));
    pendingCalEntry = null;
  }
});

// ── Todo Modal ────────────────────────────────────────────
let selectedPriority = 3;

function openAddTodo() {
  editingTodoId = null;
  document.getElementById('modalTodoTitle').textContent = 'Neue Aufgabe';
  document.getElementById('todoTitle').value = '';
  document.getElementById('todoDesc').value = '';
  document.getElementById('todoDuration').value = '1';
  document.getElementById('todoDeadline').value = '';
  document.getElementById('todoCalDate').value = '';
  document.getElementById('todoCalStart').value = '';
  document.getElementById('todoCalEnd').value = '';

  setPriority(3);
  openModal('modalTodo');
  setTimeout(() => document.getElementById('todoTitle').focus(), 100);
}

function openEditTodo(todo) {
  editingTodoId = todo.id;
  document.getElementById('modalTodoTitle').textContent = 'Aufgabe bearbeiten';
  document.getElementById('todoTitle').value = todo.title;
  document.getElementById('todoDesc').value = todo.description || '';
  document.getElementById('todoDuration').value = todo.duration_hours;
  document.getElementById('todoDeadline').value = todo.deadline || '';
  setPriority(todo.priority);

  const existing = calendarEntries.find(e => e.todo_id === todo.id);
  document.getElementById('todoCalDate').value  = existing ? existing.entry_date  : '';
  document.getElementById('todoCalStart').value = existing ? existing.start_time  : '';
  document.getElementById('todoCalEnd').value   = existing ? existing.end_time    : '';


  openModal('modalTodo');
  setTimeout(() => document.getElementById('todoTitle').focus(), 100);
}

function setPriority(val) {
  selectedPriority = parseInt(val);
  document.querySelectorAll('.prio-btn').forEach(btn => {
    btn.classList.toggle('active', parseInt(btn.dataset.val) === selectedPriority);
  });
  document.getElementById('priorityHint').textContent = PRIO_LABELS[selectedPriority];
}

document.querySelectorAll('.prio-btn').forEach(btn => {
  btn.addEventListener('click', () => setPriority(btn.dataset.val));
});

document.querySelectorAll('.rec-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.rec-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedRecurrence = btn.dataset.val;
  });
});

document.getElementById('btnAddTodo').addEventListener('click', openAddTodo);

document.getElementById('btnSaveTodo').addEventListener('click', async () => {
  const title = document.getElementById('todoTitle').value.trim();
  if (!title) { toast('Bitte Titel eingeben', 'error'); return; }

  const data = {
    title,
    description:    document.getElementById('todoDesc').value.trim(),
    priority:       selectedPriority,
    duration_hours: parseFloat(document.getElementById('todoDuration').value) || 1,
    deadline:       document.getElementById('todoDeadline').value || null,
  };

  const calDate  = document.getElementById('todoCalDate').value;
  const calStart = document.getElementById('todoCalStart').value;
  const calEnd   = document.getElementById('todoCalEnd').value;

  closeModal('modalTodo');

  let savedTodo;
  if (editingTodoId) {
    await updateTodo(editingTodoId, data);
    savedTodo = todos.find(t => t.id === editingTodoId);
    toast('Aufgabe aktualisiert', 'success');
  } else {
    const r = await fetch(`${API}/api/todos`, {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(data)
    });
    savedTodo = await r.json();
    todos.unshift(savedTodo);
    renderTodos();
    renderTray();
    updateStats();
    toast('Aufgabe erstellt', 'success');
  }

  // Kalendereintrag anlegen wenn Datum + Zeit angegeben
  if (calDate && calStart && calEnd && savedTodo) {
    // Bestehenden Eintrag für dieses Todo an diesem Tag entfernen
    const existingEntry = calendarEntries.find(
      e => e.todo_id === savedTodo.id && e.entry_date === calDate
    );
    if (existingEntry) {
      await fetch(`${API}/api/calendar/${existingEntry.id}`, { method: 'DELETE' });
      calendarEntries = calendarEntries.filter(e => e.id !== existingEntry.id);
    }

    await createCalEntry({
      todo_id:    savedTodo.id,
      entry_date: calDate,
      start_time: calStart,
      end_time:   calEnd,
      title:      savedTodo.title,
      recurrence: 'once',
      profile:    currentProfile,
    });
    fetchCalendarForCurrentView();
  }
});

// Enter key in title field
document.getElementById('todoTitle').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btnSaveTodo').click();
});

// ── Delete ────────────────────────────────────────────────
document.getElementById('btnConfirmDelete').addEventListener('click', () => {
  closeModal('modalDelete');
  if (deletingTodoId) {
    deleteTodo(deletingTodoId);
    deletingTodoId = null;
  }
});

// ── Modal Helpers ─────────────────────────────────────────
function openModal(id) {
  document.getElementById(id).classList.add('open');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('.modal-close, [data-modal]').forEach(el => {
  el.addEventListener('click', () => closeModal(el.dataset.modal || el.closest('.modal-overlay').id));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ── Tab Navigation ────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    if (btn.dataset.tab === 'calendar') {
      currentProfile = 'me';
      fetchCalendarForCurrentView();
    }
    if (btn.dataset.tab === 'partner') {
      currentProfile = 'partner';
      fetchPartnerCalendarForCurrentView();
    }
    if (btn.dataset.tab === 'eisenhower') {
      renderEisenhower();
    }
  });
});

// ── Filter Buttons ────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTodos();
  });
});

// ── Calendar View Toggle ──────────────────────────────────
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    renderCalendar();
    fetchCalendarForCurrentView();
  });
});

// ── Navigation ────────────────────────────────────────────
document.getElementById('btnPrev').addEventListener('click', () => {
  if (currentView === 'week') {
    currentDate = new Date(currentDate.getTime());
    currentDate.setDate(currentDate.getDate() - 7);
  } else {
    currentDate = new Date(currentDate.getTime());
    currentDate.setMonth(currentDate.getMonth() - 1);
  }
  fetchCalendarForCurrentView();
});

document.getElementById('btnNext').addEventListener('click', () => {
  if (currentView === 'week') {
    currentDate = new Date(currentDate.getTime());
    currentDate.setDate(currentDate.getDate() + 7);
  } else {
    currentDate = new Date(currentDate.getTime());
    currentDate.setMonth(currentDate.getMonth() + 1);
  }
  fetchCalendarForCurrentView();
});

document.getElementById('btnToday').addEventListener('click', () => {
  currentDate = new Date();
  fetchCalendarForCurrentView();
});

document.getElementById('btnPartnerPrev').addEventListener('click', () => {
  if (partnerView === 'week') partnerDate.setDate(partnerDate.getDate() - 7);
  else partnerDate.setMonth(partnerDate.getMonth() - 1);
  fetchPartnerCalendarForCurrentView();
});
document.getElementById('btnPartnerNext').addEventListener('click', () => {
  if (partnerView === 'week') partnerDate.setDate(partnerDate.getDate() + 7);
  else partnerDate.setMonth(partnerDate.getMonth() + 1);
  fetchPartnerCalendarForCurrentView();
});
document.getElementById('btnPartnerToday').addEventListener('click', () => {
  partnerDate = new Date();
  fetchPartnerCalendarForCurrentView();
});
document.querySelectorAll('[data-partner-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('[data-partner-view]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    partnerView = btn.dataset.partnerView;
    fetchPartnerCalendarForCurrentView();
  });
});

// Partner Tray
document.getElementById('partnerTrayToggle').addEventListener('click', () => {
  document.getElementById('partnerTodoTray').classList.toggle('collapsed');
});

function fetchCalendarForCurrentView() {
  let start, end;
  if (currentView === 'week') {
    const { start: s, end: e } = getWeekRange(currentDate);
    start = dateToISO(s); end = dateToISO(e);
  } else {
    const y = currentDate.getFullYear(), m = currentDate.getMonth();
    start = dateToISO(new Date(y, m, 1));
    end   = dateToISO(new Date(y, m+1, 0));
  }
  fetchCalendar(start, end, 'me');
}

function fetchPartnerCalendarForCurrentView() {
  let start, end;
  if (partnerView === 'week') {
    const { start: s, end: e } = getWeekRange(partnerDate);
    start = dateToISO(s); end = dateToISO(e);
  } else {
    const y = partnerDate.getFullYear(), m = partnerDate.getMonth();
    start = dateToISO(new Date(y, m, 1));
    end   = dateToISO(new Date(y, m+1, 0));
  }
  fetchCalendar(start, end, 'partner');
}

// ── Tray Toggle ───────────────────────────────────────────
document.getElementById('trayToggle').addEventListener('click', () => {
  document.querySelector('.todo-tray').classList.toggle('collapsed');
});
document.querySelector('.tray-header').addEventListener('click', e => {
  if (e.target.id !== 'trayToggle') {
    document.querySelector('.todo-tray').classList.toggle('collapsed');
  }
});

function renderPartnerCalendar() {
  const wrapper = document.getElementById('partnerCalWrapper');
  if (!wrapper) return;

  // Tray befüllen
  const tray = document.getElementById('partnerTrayItems');
  tray.innerHTML = '';
  todos.filter(t => !t.completed).forEach(todo => {
    const item = document.createElement('div');
    item.className = 'tray-item';
    item.draggable = true;
    item.dataset.todoId = todo.id;
    item.innerHTML = `
      <span class="prio-dot prio-dot-${todo.priority}"></span>
      <span>${escHtml(todo.title)}</span>
      <span style="color:var(--text-light);font-size:0.75rem;">${formatDuration(todo.duration_hours)}</span>
    `;
    item.addEventListener('dragstart', e => {
      dragTodoId = parseInt(e.currentTarget.dataset.todoId);
      e.dataTransfer.effectAllowed = 'copy';
    });
    item.addEventListener('dragend', onDragEnd);
    tray.appendChild(item);
  });

  // Kalender rendern (gleiche Logik wie renderWeekView/renderMonthView
  // aber mit partnerEntries und profile='partner')
  const savedEntries = calendarEntries;
  const savedProfile = currentProfile;
  calendarEntries = partnerEntries;
  currentProfile  = 'partner';
  const savedWrap = calWrap;

  // Temporär calWrap auf partnerCalWrapper umleiten
  Object.defineProperty(window, '_partnerRender', { value: true, configurable: true });

  if (partnerView === 'week') {
    renderWeekViewInto(wrapper, partnerDate, partnerEntries, 'partner');
  } else {
    renderMonthViewInto(wrapper, partnerDate, partnerEntries, 'partner');
  }

  calendarEntries = savedEntries;
  currentProfile  = savedProfile;
}

// ── Init ──────────────────────────────────────────────────
(async function init() {
  await fetchTodos();
  await fetchCalendarForCurrentView();
  // Logo laden
  const settings = await (await fetch('/api/settings')).json();
  if (settings.logo) {
    const img = document.getElementById('logoImg');
    const icon = document.getElementById('logoIcon');
    img.src = '/static/' + settings.logo;
    img.style.display = 'block';
    icon.style.display = 'none';
  }

  // Share-Modus: wenn per Link geöffnet, Edit-Rechte prüfen
  if (window.SHARE_TOKEN && !window.CAN_EDIT) {
    document.querySelectorAll('.btn-primary, .action-btn.del, .action-btn.edit').forEach(el => {
      el.style.display = 'none';
    });
  }
})();

document.getElementById('logoUpload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const fd = new FormData();
  fd.append('logo', file);
  const r = await fetch('/api/settings/logo', { method: 'POST', body: fd });
  const data = await r.json();
  if (data.logo) {
    const img = document.getElementById('logoImg');
    const icon = document.getElementById('logoIcon');
    img.src = data.logo + '?t=' + Date.now();
    img.style.display = 'block';
    icon.style.display = 'none';
    toast('Logo aktualisiert', 'success');
  }
});

document.getElementById('btnShare').addEventListener('click', async () => {
  await renderShareLinks();
  const baseUrl = window.location.origin;
  document.getElementById('icsUrl').innerHTML =
    `<code style="word-break:break-all;font-size:0.78rem;">${baseUrl}/api/calendar/export.ics</code>`;
  openModal('modalShare');
});

async function renderShareLinks() {
  const links = await (await fetch('/api/share/links')).json();
  const base = window.location.origin;
  const container = document.getElementById('shareLinks');
  if (!links.length) {
    container.innerHTML = '<p style="font-size:0.82rem;color:var(--text-light);">Noch keine Links erstellt.</p>';
    return;
  }
  container.innerHTML = links.map(l => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;">
      <input readonly value="${base}/shared/${l.token}"
        style="flex:1;padding:8px;border:1.5px solid var(--border);border-radius:8px;font-size:0.78rem;background:var(--surface);"
        onclick="this.select();document.execCommand('copy');window.showToast('Link kopiert!','success')">
      <button onclick="deleteShareLink(${l.id})" class="btn-danger" style="padding:6px 10px;">✕</button>
    </div>
  `).join('');
}

window.showToast = toast; // expose for inline handlers

document.getElementById('btnCreateShareLink').addEventListener('click', async () => {
  await fetch('/api/share/create', { method: 'POST' });
  await renderShareLinks();
  toast('Link erstellt', 'success');
});

async function deleteShareLink(id) {
  await fetch(`/api/share/links/${id}`, { method: 'DELETE' });
  await renderShareLinks();
}

// ── EISENHOWER ────────────────────────────────────────────

function saveEisen() {
  localStorage.setItem('eisenAssignments', JSON.stringify(eisenAssignments));
}

function renderEisenhower() {
  const incomplete = todos.filter(t => !t.completed);

  // Tray: nicht zugeordnete Todos
  const eisenTrayItems = document.getElementById('eisenTrayItems');
  const unassigned = incomplete.filter(t => !eisenAssignments[t.id]);
  eisenTrayItems.innerHTML = '';
  if (!unassigned.length) {
    eisenTrayItems.innerHTML = '<span style="color:var(--text-light);font-size:0.8rem;">Alle Aufgaben zugeordnet ✓</span>';
  } else {
    unassigned.forEach(todo => {
      const item = document.createElement('div');
      item.className = 'tray-item';
      item.draggable = true;
      item.dataset.todoId = todo.id;
      item.innerHTML = `
        <span class="prio-dot prio-dot-${todo.priority}"></span>
        <span>${escHtml(todo.title)}</span>
        <span style="color:var(--text-light);font-size:0.75rem;">${formatDuration(todo.duration_hours)}</span>
      `;
      item.addEventListener('dragstart', onEisenDragStart);
      item.addEventListener('dragend', onDragEnd);
      eisenTrayItems.appendChild(item);
    });
  }

  // 2x2 Quadranten befüllen
  const quadrants = ['do', 'schedule', 'delegate', 'eliminate'];
  quadrants.forEach(q => {
    const zone = document.querySelector(`.eisen-drop-zone[data-q="${q}"]`);
    if (!zone) return;
    zone.innerHTML = '';

    const assigned = incomplete.filter(t => eisenAssignments[t.id] === q);
    assigned.forEach(todo => {
      const chip = document.createElement('div');
      chip.className = `eisen-chip prio-${todo.priority}`;
      chip.draggable = true;
      chip.dataset.todoId = todo.id;
      chip.innerHTML = `
        <span class="prio-dot prio-dot-${todo.priority}"></span>
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escHtml(todo.title)}</span>
        <button class="eisen-remove" title="Zurück in Tray">↩</button>
      `;
      chip.querySelector('.eisen-remove').addEventListener('click', e => {
        e.stopPropagation();
        delete eisenAssignments[todo.id];
        saveEisen();
        renderEisenhower();
      });
      chip.addEventListener('dragstart', onEisenDragStart);
      chip.addEventListener('dragend', onDragEnd);
      zone.appendChild(chip);
    });

    // Drop-Events neu setzen
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      if (dragTodoId) {
        eisenAssignments[dragTodoId] = q;
        saveEisen();
        renderEisenhower();
      }
    });
  });
}

function onEisenDragStart(e) {
  dragTodoId = parseInt(e.currentTarget.dataset.todoId);
  e.dataTransfer.effectAllowed = 'move';
  const todo = todos.find(t => t.id === dragTodoId);
  dragGhost = document.createElement('div');
  dragGhost.className = 'drag-ghost';
  dragGhost.textContent = todo ? todo.title : 'Aufgabe';
  document.body.appendChild(dragGhost);
  e.dataTransfer.setDragImage(dragGhost, 20, 10);
}