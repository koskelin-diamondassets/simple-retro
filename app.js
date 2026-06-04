function initTheme() {
  const saved = localStorage.getItem('retro_theme');
  if (saved) document.documentElement.dataset.theme = saved;
  updateThemeIcon();
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  localStorage.setItem('retro_theme', next);
  updateThemeIcon();
}

function updateThemeIcon() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  const isDark = document.documentElement.dataset.theme === 'dark' ||
    (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
  btn.querySelector('i').className = isDark ? 'ti ti-moon' : 'ti ti-sun';
}

const COLS = [
  { id:'went-well', label:'Went well', color:'#1D9E75', dot:'#1D9E75' },
  { id:'improve',   label:'To improve', color:'#E24B4A', dot:'#E24B4A' },
  { id:'ideas',     label:'Ideas / try', color:'#BA7517', dot:'#BA7517' },
  { id:'kudos',     label:'Kudos', color:'#185FA5', dot:'#185FA5' }
];

let state = {
  phase: 'submit',
  notes: {},
  pending: {},
  votes: {},
  myVotes: {},
  actions: []
};

const MAX_VOTES = 5;

function load() {
  try {
    const raw = localStorage.getItem('retro_state_v2');
    if (raw) Object.assign(state, JSON.parse(raw));
  } catch(e) {}
  COLS.forEach(c => {
    if (!state.notes[c.id]) state.notes[c.id] = [];
    if (!state.pending[c.id]) state.pending[c.id] = [];
    if (!state.votes[c.id]) state.votes[c.id] = {};
    if (!state.myVotes) state.myVotes = {};
    if (!state.myVotes[c.id]) state.myVotes[c.id] = {};
  });
  if (!state.actions) state.actions = [];
}

function save() {
  try { localStorage.setItem('retro_state_v2', JSON.stringify(state)); } catch(e) {}
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2000);
}

function goPhase(p) {
  state.phase = p;
  save();
  ['submit','reveal','vote','actions','export'].forEach(ph => {
    document.getElementById('phase-'+ph).classList.toggle('hidden', ph !== p);
    const step = document.getElementById('step-'+ph);
    step.classList.toggle('active', ph === p);
  });
  document.getElementById('phase-label').textContent = 'Phase: ' + p;
  if (p === 'reveal') renderReveal();
  if (p === 'vote') renderVote();
  if (p === 'actions') renderActions();
  if (p === 'export') renderExport();
}

function renderSubmit() {
  const grid = document.getElementById('submit-grid');
  grid.innerHTML = '';
  COLS.forEach(col => {
    const div = document.createElement('div');
    div.className = 'submit-col';
    const pending = state.pending[col.id] || [];
    div.innerHTML = `
      <h2><span class="col-dot" style="background:${col.dot}"></span>${col.label}</h2>
      <textarea id="ta-${col.id}" placeholder="Add a note..."></textarea>
      <div class="add-row">
        <button class="btn btn-primary btn-sm" onclick="addPending('${col.id}')"><i class="ti ti-plus" aria-hidden="true"></i> Add</button>
      </div>
      <div id="pending-${col.id}">
        ${pending.map((n,i) => `<div class="pending-note">${escHtml(n)}<button class="rm" onclick="removePending('${col.id}',${i})">×</button></div>`).join('')}
      </div>
      <p class="pending-count">${pending.length} note${pending.length!==1?'s':''} ready to submit</p>
    `;
    grid.appendChild(div);
  });
}

function addPending(colId) {
  const ta = document.getElementById('ta-'+colId);
  const txt = ta.value.trim();
  if (!txt) return;
  if (!state.pending[colId]) state.pending[colId] = [];
  state.pending[colId].push(txt);
  ta.value = '';
  save();
  renderSubmit();
  toast('Note added!');
}

function removePending(colId, idx) {
  state.pending[colId].splice(idx, 1);
  save();
  renderSubmit();
}

function renderReveal() {
  COLS.forEach(col => {
    if (state.pending[col.id]) {
      state.pending[col.id].forEach(txt => {
        const id = 'n_' + Math.random().toString(36).slice(2,9);
        state.notes[col.id].push({ id, text: txt });
        if (!state.votes[col.id]) state.votes[col.id] = {};
        state.votes[col.id][id] = 0;
      });
      state.pending[col.id] = [];
    }
  });
  save();

  const board = document.getElementById('board-reveal');
  board.innerHTML = '';
  COLS.forEach(col => {
    const div = document.createElement('div');
    div.className = 'board-col';
    div.dataset.col = col.id;
    div.innerHTML = `<h2><span class="col-dot" style="background:${col.dot}"></span>${col.label} <span style="font-size:11px;color:var(--color-text-secondary);">(${(state.notes[col.id]||[]).length})</span></h2>`;
    (state.notes[col.id]||[]).forEach(note => {
      div.appendChild(makeStickyReveal(note, col.id));
    });
    div.addEventListener('dragover', e => { e.preventDefault(); });
    div.addEventListener('drop', e => { e.preventDefault(); handleDrop(e, col.id, 'reveal'); });
    board.appendChild(div);
  });
}

function makeStickyReveal(note, colId) {
  const el = document.createElement('div');
  el.className = 'sticky';
  el.draggable = true;
  el.dataset.id = note.id;
  el.dataset.col = colId;
  el.innerHTML = `<div class="sticky-text">${escHtml(note.text)}</div>
    <div class="sticky-foot">
      <span style="font-size:11px;color:var(--color-text-secondary);">drag to regroup</span>
      <button class="del-btn" onclick="deleteNote('${note.id}','${colId}','reveal')" aria-label="Delete note"><i class="ti ti-trash" aria-hidden="true"></i></button>
    </div>`;
  el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', JSON.stringify({id:note.id,from:colId})); el.classList.add('dragging'); });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  return el;
}

function handleDrop(e, toCol, phase) {
  const data = JSON.parse(e.dataTransfer.getData('text/plain'));
  if (data.from === toCol) return;
  const fromNotes = state.notes[data.from];
  const idx = fromNotes.findIndex(n => n.id === data.id);
  if (idx === -1) return;
  const [note] = fromNotes.splice(idx, 1);
  state.notes[toCol].push(note);
  if (!state.votes[toCol]) state.votes[toCol] = {};
  if (!state.votes[toCol][note.id]) state.votes[toCol][note.id] = (state.votes[data.from]||{})[note.id] || 0;
  delete (state.votes[data.from]||{})[note.id];
  save();
  if (phase === 'reveal') renderReveal();
  else renderVote();
}

function deleteNote(id, colId, phase) {
  state.notes[colId] = (state.notes[colId]||[]).filter(n => n.id !== id);
  delete (state.votes[colId]||{})[id];
  save();
  if (phase === 'reveal') renderReveal();
  else renderVote();
}

function renderVote() {
  const board = document.getElementById('board-vote');
  board.innerHTML = '';
  updateVotesLeft();
  COLS.forEach(col => {
    const div = document.createElement('div');
    div.className = 'board-col';
    div.dataset.col = col.id;
    div.innerHTML = `<h2><span class="col-dot" style="background:${col.dot}"></span>${col.label}</h2>`;
    const sorted = [...(state.notes[col.id]||[])].sort((a,b) => ((state.votes[col.id]||{})[b.id]||0) - ((state.votes[col.id]||{})[a.id]||0));
    sorted.forEach(note => div.appendChild(makeStickyVote(note, col.id)));
    div.addEventListener('dragover', e => e.preventDefault());
    div.addEventListener('drop', e => { e.preventDefault(); handleDrop(e, col.id, 'vote'); });
    board.appendChild(div);
  });
}

function totalMyVotes() {
  let t = 0;
  Object.values(state.myVotes||{}).forEach(obj => Object.values(obj).forEach(v => t += v));
  return t;
}

function updateVotesLeft() {
  const left = MAX_VOTES - totalMyVotes();
  const el = document.getElementById('votes-left-badge');
  if (el) el.textContent = left + ' vote' + (left!==1?'s':'') + ' left';
}

function makeStickyVote(note, colId) {
  const el = document.createElement('div');
  el.className = 'sticky';
  el.draggable = true;
  el.dataset.id = note.id;
  const voteCount = (state.votes[colId]||{})[note.id] || 0;
  const myV = (state.myVotes[colId]||{})[note.id] || 0;
  if (voteCount > 0) el.classList.add('voted-note');
  el.innerHTML = `<div class="sticky-text">${escHtml(note.text)}</div>
    <div class="sticky-foot">
      <button class="vote-btn ${myV>0?'voted':''}" onclick="vote('${note.id}','${colId}')"><i class="ti ti-arrow-up" aria-hidden="true" style="font-size:12px"></i><span class="vote-count">${voteCount}</span></button>
      ${myV>0 ? `<button class="vote-btn" onclick="unvote('${note.id}','${colId}')" style="font-size:11px;">−1</button>` : ''}
    </div>`;
  el.addEventListener('dragstart', e => { e.dataTransfer.setData('text/plain', JSON.stringify({id:note.id,from:colId})); el.classList.add('dragging'); });
  el.addEventListener('dragend', () => el.classList.remove('dragging'));
  return el;
}

function vote(id, colId) {
  if (totalMyVotes() >= MAX_VOTES) { toast('No votes left!'); return; }
  if (!state.votes[colId]) state.votes[colId] = {};
  if (!state.myVotes[colId]) state.myVotes[colId] = {};
  state.votes[colId][id] = (state.votes[colId][id]||0) + 1;
  state.myVotes[colId][id] = (state.myVotes[colId][id]||0) + 1;
  save(); renderVote();
}

function unvote(id, colId) {
  if (!state.myVotes[colId] || !state.myVotes[colId][id]) return;
  state.votes[colId][id] = Math.max(0, (state.votes[colId][id]||0) - 1);
  state.myVotes[colId][id] = Math.max(0, (state.myVotes[colId][id]||0) - 1);
  save(); renderVote();
}

function renderActions() {
  const topSection = document.getElementById('top-voted-section');
  topSection.innerHTML = '<h2 style="font-size:14px;font-weight:500;margin-bottom:10px;color:var(--color-text-primary);"><i class="ti ti-flame" aria-hidden="true" style="margin-right:6px;vertical-align:-2px;color:#E24B4A"></i>Top voted notes</h2>';
  const all = [];
  COLS.forEach(col => {
    (state.notes[col.id]||[]).forEach(n => {
      all.push({ note: n, col, votes: (state.votes[col.id]||{})[n.id]||0 });
    });
  });
  all.sort((a,b) => b.votes - a.votes);
  const top = all.slice(0, 5).filter(x => x.votes > 0);
  if (top.length === 0) {
    topSection.innerHTML += '<p style="font-size:13px;color:var(--color-text-secondary);">No votes cast yet.</p>';
  } else {
    top.forEach(({note, col, votes}) => {
      const d = document.createElement('div');
      d.style.cssText = 'display:flex;align-items:center;gap:10px;background:var(--color-background-secondary);border-radius:var(--border-radius-md);padding:8px 12px;margin-bottom:6px;border:0.5px solid var(--color-border-tertiary);';
      d.innerHTML = `<span style="font-size:13px;font-weight:500;color:#0F6E56;min-width:28px;">▲${votes}</span><span style="font-size:13px;color:var(--color-text-primary);flex:1;">${escHtml(note.text)}</span><span style="font-size:11px;color:${col.dot};background:var(--color-background-primary);border-radius:999px;padding:2px 8px;border:0.5px solid var(--color-border-tertiary);">${col.label}</span>`;
      topSection.appendChild(d);
    });
  }

  const list = document.getElementById('action-list');
  list.innerHTML = '';
  (state.actions||[]).forEach((a,i) => {
    const d = document.createElement('div');
    d.className = 'action-item' + (a.done ? ' done-item' : '');
    d.innerHTML = `<span>${escHtml(a.text)}<span class="action-meta"> — ${escHtml(a.owner||'?')}${a.due?' · '+escHtml(a.due):''}</span></span>
      <input type="checkbox" class="action-check" ${a.done?'checked':''} onchange="toggleAction(${i})" aria-label="Mark done">
      <button class="del-btn" onclick="deleteAction(${i})" aria-label="Delete"><i class="ti ti-trash" aria-hidden="true"></i></button>`;
    list.appendChild(d);
  });
}

function addAction() {
  const txt = document.getElementById('action-text').value.trim();
  if (!txt) return;
  const owner = document.getElementById('action-owner').value.trim();
  const due = document.getElementById('action-due').value.trim();
  state.actions.push({ text: txt, owner, due, done: false });
  document.getElementById('action-text').value = '';
  document.getElementById('action-owner').value = '';
  document.getElementById('action-due').value = '';
  save(); renderActions();
  toast('Action item added!');
}

function toggleAction(i) { state.actions[i].done = !state.actions[i].done; save(); renderActions(); }
function deleteAction(i) { state.actions.splice(i,1); save(); renderActions(); }

function renderExport() {
  const lines = ['RETROSPECTIVE SUMMARY', '='.repeat(40), ''];
  const date = new Date().toLocaleDateString('en-GB', {year:'numeric',month:'long',day:'numeric'});
  lines.push('Date: ' + date, '');
  COLS.forEach(col => {
    const notes = state.notes[col.id]||[];
    if (!notes.length) return;
    lines.push(col.label.toUpperCase(), '-'.repeat(30));
    const sorted = [...notes].sort((a,b) => ((state.votes[col.id]||{})[b.id]||0) - ((state.votes[col.id]||{})[a.id]||0));
    sorted.forEach(n => {
      const v = (state.votes[col.id]||{})[n.id]||0;
      lines.push(`  [▲${v}] ${n.text}`);
    });
    lines.push('');
  });
  lines.push('ACTION ITEMS', '-'.repeat(30));
  if ((state.actions||[]).length === 0) lines.push('  (none)');
  state.actions.forEach(a => {
    lines.push(`  [${a.done?'✓':' '}] ${a.text} — ${a.owner||'?'}${a.due?' · '+a.due:''}`);
  });
  document.getElementById('export-text').textContent = lines.join('\n');
}

function copyExport() {
  const txt = document.getElementById('export-text').textContent;
  navigator.clipboard.writeText(txt).then(() => toast('Copied!')).catch(() => toast('Select text and copy manually'));
}

function resetBoard() {
  if (!confirm('Start a new retro? This will clear all notes, votes, and actions.')) return;
  state = { phase:'submit', notes:{}, pending:{}, votes:{}, myVotes:{}, actions:[] };
  COLS.forEach(c => { state.notes[c.id]=[]; state.pending[c.id]=[]; state.votes[c.id]={}; state.myVotes[c.id]={}; });
  save();
  goPhase('submit');
  renderSubmit();
  toast('Board cleared!');
}

function escHtml(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

initTheme();
load();
renderSubmit();
goPhase(state.phase||'submit');
