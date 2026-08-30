/**
 * DemoForge review console behavior.
 * Same design system as Oracle's dashboard: Emil easings, GSAP polish,
 * keyboard-first approvals, reduced-motion respected.
 */

const API = '';
const $ = (id) => document.getElementById(id);

let currentApprovalId = null;
let currentCuts = [];
let picked = -1;

/* ---------- entrance (GSAP, reduced-motion aware) ---------- */
if (window.gsap) {
  const mm = gsap.matchMedia();
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    gsap.to('.stagger-item', { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', stagger: 0.06, overwrite: 'auto' });
  });
  mm.add('(prefers-reduced-motion: reduce)', () => gsap.set('.stagger-item', { opacity: 1, y: 0 }));
} else {
  document.querySelectorAll('.stagger-item').forEach((el) => { el.style.opacity = 1; el.style.transform = 'none'; });
}

/* ---------- SSE ---------- */
const es = new EventSource(`${API}/api/events`);
es.onmessage = (e) => {
  let ev; try { ev = JSON.parse(e.data); } catch { return; }
  switch (ev.type) {
    case 'approval_requested': showGate(ev); break;
    case 'approval_resolved':
      $('gateModal').classList.remove('show');
      setStage(ev.approved ? 'approved — director continuing' : 'denied — director replans');
      break;
    case 'footage_uploaded': setStage(`footage uploaded (${ev.name})`); break;
    case 'scene_indexed': setStage('scenes indexed — searching moments…'); break;
    case 'rough_cut_ready': addRoughCut(ev); break;
    case 'final_rendered': showFinal(ev); break;
  }
};

function setStage(text) { $('stage').textContent = text; }

/* ---------- shot list ---------- */
function renderShots(shots) {
  const el = $('shots');
  el.classList.remove('empty');
  el.innerHTML = shots.map((s) => `
    <div class="shot">
      <div class="title">${escapeHtml(s.title)}</div>
      <div class="meta">${escapeHtml(s.goal)} · ~${s.estSeconds}s</div>
    </div>`).join('');
  if (window.gsap) gsap.fromTo('#shots .shot', { opacity: 0, y: -6 }, { opacity: 1, y: 0, duration: 0.2, ease: 'power2.out', stagger: 0.05 });
}

/* ---------- rough cuts ---------- */

function renderCuts(cuts) {
  const el = $('cuts');
  if (!cuts.length) { el.innerHTML = '<span class="empty">No rough cuts yet.</span>'; return; }
  el.innerHTML = cuts.map((c, i) => `
    <div class="cut" data-i="${i}" style="border-color:${picked === i ? 'var(--accent)' : 'var(--border)'}">
      <h3>${escapeHtml(c.variantName ?? `Variant ${i + 1}`)}</h3>
      <video src="${escapeAttr(c.streamUrl)}" controls muted></video>
      <div class="row">
        <span class="meta">${c.shotCount} shots · ~${Math.round(c.durationSec)}s</span>
        <button class="btn btn-approve" data-pick="${i}">${picked === i ? '✓ picked' : 'Pick this cut'}</button>
      </div>
    </div>`).join('');
  el.querySelectorAll('[data-pick]').forEach((btn) =>
    btn.addEventListener('click', () => { picked = Number(btn.dataset.pick); renderCuts(currentCuts); }));
}

function addRoughCut(ev) {
  currentCuts.push({ streamUrl: ev.streamUrl, shotCount: ev.shotCount, durationSec: ev.durationSec, variantName: ev.variantName });
  renderCuts(currentCuts);
  setStage(`rough cut ready — ${ev.shotCount} shots, ~${Math.round(ev.durationSec)}s`);
}

/* ---------- final render ---------- */
function showFinal(ev) {
  $('finalRow').innerHTML = `
    <a class="btn btn-render" href="${escapeAttr(ev.videoUrl)}" target="_blank" rel="noopener">
      ⬇ Download final MP4 — ${escapeHtml(ev.variantName)}
    </a>`;
}

/* ---------- gate modal ---------- */
function showGate(ev) {
  currentApprovalId = ev.approvalId;
  $('gateAction').textContent = ev.action;
  $('gateReason').textContent = ev.reason || 'The director is waiting for your decision.';
  $('gateModal').classList.add('show');
  $('gateYes').focus();
}

async function decide(approved) {
  const id = currentApprovalId;
  $('gateModal').classList.remove('show');
  if (!id) return;
  currentApprovalId = null;
  await fetch(`${API}/api/decide`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvalId: id, approved }),
  });
}

$('gateYes').addEventListener('click', () => decide(true));
$('gateDeny').addEventListener('click', () => decide(false));
window.addEventListener('keydown', (e) => {
  if (!$('gateModal').classList.contains('show')) return;
  if (e.key === 'Enter') { e.preventDefault(); decide(true); }
  if (e.key === 'Escape') { e.preventDefault(); decide(false); }
});

/* ---------- utils ---------- */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const escapeAttr = escapeHtml;
