import * as THREE from 'https://unpkg.com/three@0.170.0/build/three.module.js';
import { Text } from 'https://unpkg.com/troika-three-text@0.52.3/dist/troika-three-text.esm.js';

const app = document.getElementById('app');
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03050d);
scene.fog = new THREE.Fog(0x03050d, 6, 17);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.2, 6.4);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-2, -2);

const CARD_W = 3.2;
const CARD_H = 0.68;
const PANEL_W = 3.85;
const PANEL_H = 5.4;
const HEADER_H = 0.7;

const shared = {
  cardGeo: new THREE.PlaneGeometry(CARD_W, CARD_H),
  panelGeo: new THREE.PlaneGeometry(PANEL_W, PANEL_H),
  buttonGeo: new THREE.PlaneGeometry(0.6, 0.24),
  bottomButtonGeo: new THREE.PlaneGeometry(1, 0.24),
  avatarGeo: new THREE.CircleGeometry(0.12, 24),
  scrollbarGeo: new THREE.PlaneGeometry(0.04, 4.3),
  scrollThumbGeo: new THREE.PlaneGeometry(0.04, 0.7)
};

const colors = {
  panel: new THREE.Color(0x0c1322),
  panelEdge: new THREE.Color(0x223452),
  card: new THREE.Color(0x17223b),
  unread: new THREE.Color(0x223964),
  read: new THREE.Color(0x152035),
  spam: new THREE.Color(0x2f343f),
  selected: new THREE.Color(0x3f67a8),
  text: new THREE.Color(0xd9e4ff),
  muted: new THREE.Color(0x8a9cbf),
  aiGlow: new THREE.Color(0x9159ff),
  bottomBar: new THREE.Color(0x0a1021)
};

const springStep = (value, velocity, target, dt, stiffness = 230, damping = 26) => {
  const force = (target - value) * stiffness;
  velocity += force * dt;
  velocity *= Math.exp(-damping * dt);
  value += velocity * dt;
  return [value, velocity];
};

const mkText = (txt, size = 0.1, color = colors.text, width = 3, align = 'left') => {
  const t = new Text();
  t.text = txt;
  t.fontSize = size;
  t.maxWidth = width;
  t.color = color;
  t.anchorX = align;
  t.anchorY = 'middle';
  t.font = 'https://fonts.gstatic.com/s/inter/v19/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIa0ZL7SUc.woff2';
  t.sync();
  return t;
};

const makeEmail = (id, overrides) => ({
  id,
  sender: 'Unknown',
  recipients: [],
  subject: 'Untitled',
  preview: 'Message preview',
  body: 'Body',
  panel: 'A',
  unread: false,
  important: false,
  spam: false,
  ai: false,
  avatarColor: null,
  tags: ['Strategy'],
  mailbox: 'inbox',
  threadId: `t${id}`,
  groupOutOfSeq: false,
  ...overrides
});

const emails = [
  makeEmail(1, { sender: 'Ari Chen', subject: 'Q3 strategy pivots', preview: 'Need your sign-off before board pack freeze.', body: 'Can you review this by noon? Draft is attached.', unread: true, important: true, avatarColor: 0x56c4ff, tags: ['Strategy'], panel: 'A', threadId: 'thread-strat', recipients: ['Board Ops'] }),
  makeEmail(2, { sender: 'Build Agent Sigma', subject: 'Nightly quality summary', preview: '2 regressions detected in checkout.', body: 'Automated report with remediation hints.', unread: true, important: true, ai: true, tags: ['Engineering'], panel: 'A' }),
  makeEmail(3, { sender: 'Tessa', subject: 'Re: acquisition model', preview: 'Added sensitivity bands to tab 4.', body: 'See comments in blue.', unread: false, tags: ['Governance'], panel: 'A', recipients: ['CFO', 'Legal'] }),
  makeEmail(4, { sender: 'Marketing Ops', subject: 'Launch campaign budget', preview: 'Need revised spend by region.', body: 'LATAM increase +12%, APAC flat.', unread: true, tags: ['Marketing'], panel: 'B', avatarColor: 0xff9f6e }),
  makeEmail(5, { sender: 'Sales Pod 4', subject: 'Deal room activity', preview: 'New stakeholder joined thread.', body: 'Follow-up requested by Friday.', unread: false, tags: ['Sales'], panel: 'B', recipients: ['RevOps'] }),
  makeEmail(6, { sender: 'Dev Group', subject: 'Incident followup', preview: 'Thread branched; triage notes conflict.', body: 'This is a group chat with branches.', unread: true, tags: ['Engineering'], panel: 'B', threadId: 'thread-incident', groupOutOfSeq: true, recipients: ['SRE', 'Platform', 'QA'] }),
  makeEmail(7, { sender: 'AdBlast', subject: 'You won 4000 leads', preview: 'Claim now with one click.', body: 'Spam content', spam: true, unread: false, tags: ['Marketing'], panel: 'C' }),
  makeEmail(8, { sender: 'Unknown Promo', subject: 'Crypto treasury multiplier', preview: 'Guaranteed 10x this quarter.', body: 'Spam content', spam: true, unread: false, panel: 'C', tags: ['Sales'] }),
  makeEmail(9, { sender: 'Archive Reminder', subject: 'Policy update notice', preview: 'Historical policy refresh.', body: 'Archived policy notes.', unread: false, mailbox: 'archive', panel: 'B', tags: ['Governance'] }),
  makeEmail(10, { sender: 'Sent: Mira', subject: 'Draft sent to legal', preview: 'Sent from your mailbox.', body: 'This item exists in sent.', unread: false, mailbox: 'sent', panel: 'A', tags: ['Strategy'] })
];

const threadHistory = {
  'thread-strat': [
    { time: '11:03', who: 'Ari Chen', text: 'Shared first draft for board.' },
    { time: '10:42', who: 'You', text: 'Need risk flags and alternate budget.' },
    { time: '09:58', who: 'Ari Chen', text: 'Adding appendix now.' }
  ],
  'thread-incident': [
    { time: '12:02', who: 'QA', text: 'Root cause candidate B.' },
    { time: '11:47', who: 'SRE', text: 'Rollback complete in us-east.' },
    { time: '11:40', who: 'Platform', text: 'Patch A in canary.' }
  ]
};

const state = {
  focusPanel: 'A',
  hoveredPanel: null,
  hoveredControl: null,
  selectedEmailId: null,
  detailOpen: false,
  detailEmailId: null,
  search: '',
  mailboxMode: 'inbox',
  filters: new Set(),
  undoPayload: null,
  pendingClearUndo: false,
  hoveredThreadArrow: false,
  panelScroll: { A: 0, B: 0, C: 0 },
  panelScrollTarget: { A: 0, B: 0, C: 0 },
  typingCursor: true,
  lastClick: { id: null, time: 0 }
};

const interaction = {
  panelMeshes: {},
  controlMeshes: [],
  cardMeshes: [],
  threadArrow: null,
  bottomFilterMeshes: []
};

const root = new THREE.Group();
scene.add(root);

const ambient = new THREE.AmbientLight(0xb9ccff, 0.8);
const dir = new THREE.DirectionalLight(0x7f9cff, 1.2);
dir.position.set(2, 4, 5);
scene.add(ambient, dir);

const panelDefs = {
  A: { x: -2.2, y: 0, z: 0, rotY: 0.08, scale: 1 },
  B: { x: 0.25, y: -0.1, z: -1.1, rotY: 0.01, scale: 0.93 },
  C: { x: 2.4, y: -0.2, z: -2.2, rotY: -0.08, scale: 0.86 }
};

const panelGroups = {};
const panelSprings = {};
const panelCardLayers = {};
const nebula = new THREE.Group();
root.add(nebula);

for (const key of ['A', 'B', 'C']) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(shared.panelGeo, new THREE.MeshStandardMaterial({ color: colors.panel, metalness: 0.35, roughness: 0.5, transparent: true, opacity: 0.96 }));
  const border = new THREE.Mesh(new THREE.PlaneGeometry(PANEL_W + 0.03, PANEL_H + 0.03), new THREE.MeshBasicMaterial({ color: colors.panelEdge, transparent: true, opacity: 0.12 }));
  border.position.z = -0.01;
  g.add(border, bg);

  const title = mkText(`Panel ${key}`, 0.12, colors.muted, 1.2, 'left');
  title.position.set(-1.72, 2.48, 0.03);
  g.add(title);

  const scrollbarTrack = new THREE.Mesh(shared.scrollbarGeo, new THREE.MeshBasicMaterial({ color: 0x8097c0, transparent: true, opacity: 0.09 }));
  scrollbarTrack.position.set(1.86, -0.2, 0.03);
  g.add(scrollbarTrack);

  const scrollbarThumb = new THREE.Mesh(shared.scrollThumbGeo, new THREE.MeshBasicMaterial({ color: 0xb2cdf8, transparent: true, opacity: 0.23 }));
  scrollbarThumb.position.set(1.86, 1.65, 0.04);
  g.add(scrollbarThumb);

  const cardsLayer = new THREE.Group();
  g.add(cardsLayer);

  root.add(g);
  panelGroups[key] = { g, bg, title, scrollbarThumb };
  panelCardLayers[key] = cardsLayer;

  panelSprings[key] = {
    x: panelDefs[key].x,
    y: panelDefs[key].y,
    z: panelDefs[key].z,
    s: panelDefs[key].scale,
    r: panelDefs[key].rotY,
    vx: 0, vy: 0, vz: 0, vs: 0, vr: 0,
    target: { ...panelDefs[key] }
  };

  bg.userData = { type: 'panel', panel: key };
  interaction.panelMeshes[key] = bg;
}

const controlsGroup = new THREE.Group();
root.add(controlsGroup);

const detailWindow = new THREE.Group();
detailWindow.visible = false;
root.add(detailWindow);
const detailBg = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 3.4), new THREE.MeshStandardMaterial({ color: 0x0f1728, metalness: 0.25, roughness: 0.55, transparent: true, opacity: 0.98 }));
detailBg.position.z = 0;
detailWindow.add(detailBg);
const detailTitle = mkText('Email Detail', 0.14, colors.text, 4.2, 'left');
detailTitle.position.set(-2.1, 1.45, 0.04);
detailWindow.add(detailTitle);
const detailBody = mkText('', 0.1, colors.muted, 4.2, 'left');
detailBody.position.set(-2.1, 0.75, 0.04);
detailWindow.add(detailBody);
const composeLabel = mkText('Compose...', 0.11, new THREE.Color(0xc7d5ff), 4.2, 'left');
composeLabel.position.set(-2.1, -1.05, 0.04);
detailWindow.add(composeLabel);

const threadArrow = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.42), new THREE.MeshBasicMaterial({ color: 0xc8d6ff, transparent: true, opacity: 0.45 }));
threadArrow.position.set(2.25, 0.15, 0.05);
threadArrow.userData = { type: 'thread-arrow' };
detailWindow.add(threadArrow);
interaction.threadArrow = threadArrow;

const threadDrawer = new THREE.Group();
detailWindow.add(threadDrawer);
const threadDrawerBg = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.4), new THREE.MeshStandardMaterial({ color: 0x121d33, metalness: 0.2, roughness: 0.5, transparent: true, opacity: 0.94 }));
threadDrawer.add(threadDrawerBg);
threadDrawer.position.set(3.6, 0, 0.02);
let threadDrawerVel = 0;
let threadDrawerX = 3.6;

function clearGroup(group) {
  while (group.children.length) group.remove(group.children[0]);
}

function mailboxVisible(email) {
  if (state.mailboxMode === 'sent') return email.mailbox === 'sent';
  if (state.mailboxMode === 'archive') return email.mailbox === 'archive';
  return email.mailbox === 'inbox';
}

function filterVisible(email) {
  if (!mailboxVisible(email)) return false;
  if (!state.search) return state.filters.size === 0 || email.tags.some((t) => state.filters.has(t));
  const blob = `${email.sender} ${email.subject} ${email.preview}`.toLowerCase();
  const searchMatch = blob.includes(state.search.toLowerCase());
  const filterMatch = state.filters.size === 0 || email.tags.some((t) => state.filters.has(t));
  return searchMatch && filterMatch;
}

function buildControls() {
  clearGroup(controlsGroup);
  interaction.controlMeshes = [];
  const buttons = ['New', 'Delete', 'Archive', 'Filter'];
  if (state.selectedEmailId) buttons.push('Reply', 'Forward');
  if (state.undoPayload) buttons.push('Undo');

  const panelPos = panelSprings[state.focusPanel];
  controlsGroup.position.set(panelPos.x - PANEL_W * panelPos.s * 0.47, panelPos.y + PANEL_H * panelPos.s * 0.44, panelPos.z + 0.09);
  controlsGroup.rotation.y = panelPos.r;
  controlsGroup.scale.setScalar(panelPos.s);

  buttons.forEach((label, i) => {
    const mesh = new THREE.Mesh(shared.buttonGeo, new THREE.MeshBasicMaterial({ color: 0x274068, transparent: true, opacity: 0.65 }));
    mesh.position.set(i * 0.68, 0, 0);
    mesh.userData = { type: 'control', action: label };
    const t = mkText(label, 0.09, colors.text, 0.55, 'center');
    t.position.set(0, 0, 0.02);
    mesh.add(t);
    controlsGroup.add(mesh);
    interaction.controlMeshes.push(mesh);
  });

  const searchBg = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 0.24), new THREE.MeshBasicMaterial({ color: 0x1c2e4e, transparent: true, opacity: 0.75 }));
  searchBg.position.set(buttons.length * 0.68 + 0.7, 0, 0);
  searchBg.userData = { type: 'control', action: 'Search' };
  const st = mkText(`Search: ${state.search || '...'}`, 0.08, colors.muted, 1.34, 'left');
  st.position.set(-0.64, 0, 0.02);
  searchBg.add(st);
  controlsGroup.add(searchBg);
  interaction.controlMeshes.push(searchBg);
}

function makeCardMesh(email) {
  const mesh = new THREE.Mesh(shared.cardGeo, new THREE.MeshStandardMaterial({ color: colors.card, metalness: 0.12, roughness: 0.62, transparent: true, opacity: 0.9 }));
  mesh.userData = { type: 'card', emailId: email.id, panel: email.panel, anim: null, scrunch: 0 };

  const sender = mkText(email.sender, email.important ? 0.11 : 0.1, email.unread ? colors.text : colors.muted, 2.2, 'left');
  sender.position.set(-1.48, 0.18, 0.03);
  mesh.add(sender);

  if (email.recipients.length) {
    const rec = mkText(email.recipients.join(', '), 0.07, new THREE.Color(0x738ab2), 1.6, 'left');
    rec.position.set(-1.48, 0.29, 0.03);
    mesh.add(rec);
  }

  const previewLine = email.unread ? `${email.subject} · ${email.preview}` : `${email.subject}`;
  const preview = mkText(previewLine, 0.08, colors.muted, 2.6, 'left');
  preview.position.set(-1.48, -0.08, 0.03);
  mesh.add(preview);

  if (email.avatarColor) {
    const av = new THREE.Mesh(shared.avatarGeo, new THREE.MeshBasicMaterial({ color: email.avatarColor, transparent: true, opacity: 0.96 }));
    av.position.set(1.32, 0.03, 0.03);
    mesh.add(av);
  }

  if (email.ai) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(CARD_W + 0.05, CARD_H + 0.05), new THREE.MeshBasicMaterial({ color: colors.aiGlow, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending }));
    glow.position.z = -0.01;
    mesh.add(glow);
  }

  return mesh;
}

function renderCards() {
  interaction.cardMeshes = [];
  ['A', 'B', 'C'].forEach((panel) => {
    clearGroup(panelCardLayers[panel]);
    const visible = emails.filter((e) => e.panel === panel && filterVisible(e));
    visible.forEach((email, idx) => {
      const card = makeCardMesh(email);
      const y = 1.88 - idx * 0.76 + state.panelScroll[panel];
      let zDepth = 0.05;
      let opacity = 0.92;
      const mat = card.material;
      if (email.spam) {
        mat.color.copy(colors.spam);
        opacity = 0.48;
        zDepth = -0.18;
      } else if (!email.unread) {
        mat.color.copy(colors.read);
        opacity = 0.68;
        zDepth = -0.07;
      } else {
        mat.color.copy(colors.unread);
      }
      if (state.selectedEmailId === email.id) {
        mat.color.copy(colors.selected);
        opacity = 0.97;
      }
      mat.opacity = opacity;
      card.position.set(0, y, zDepth);
      panelCardLayers[panel].add(card);
      interaction.cardMeshes.push(card);
    });

    const full = emails.filter((e) => e.panel === panel && mailboxVisible(e)).length;
    const shown = visible.length;
    const ratio = shown ? Math.min(1, shown / Math.max(full, 1)) : 1;
    panelGroups[panel].scrollbarThumb.scale.y = ratio;
    panelGroups[panel].scrollbarThumb.position.y = 1.65 - state.panelScroll[panel] * 0.4;
  });

  renderNebula();
}

function renderNebula() {
  clearGroup(nebula);
  const hiddenByFilter = emails.filter((e) => mailboxVisible(e) && !filterVisible(e));
  hiddenByFilter.forEach((email, idx) => {
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), new THREE.MeshBasicMaterial({ color: 0x7b8fb9, transparent: true, opacity: 0.2 }));
    dot.position.set(-3 + (idx % 12) * 0.55, -2 + Math.floor(idx / 12) * 0.1, -6 - (idx % 5) * 0.3);
    nebula.add(dot);
  });
}

const bottomBar = new THREE.Group();
root.add(bottomBar);
const bottomBg = new THREE.Mesh(new THREE.PlaneGeometry(8.6, 0.48), new THREE.MeshBasicMaterial({ color: colors.bottomBar, transparent: true, opacity: 0.72 }));
bottomBar.add(bottomBg);

function buildBottomFilters() {
  interaction.bottomFilterMeshes = [];
  const tags = ['Sent', 'Archive', 'Marketing', 'Engineering', 'Sales', 'Strategy', 'Governance'];
  tags.forEach((tag, i) => {
    const b = new THREE.Mesh(shared.bottomButtonGeo, new THREE.MeshBasicMaterial({ color: 0x1f3154, transparent: true, opacity: 0.52 }));
    b.position.set(-3.5 + i * 1.17, 0, 0.02);
    b.userData = { type: 'bottom-filter', tag };
    const active = tag === 'Sent' ? state.mailboxMode === 'sent' : tag === 'Archive' ? state.mailboxMode === 'archive' : state.filters.has(tag);
    b.material.opacity = active ? 0.9 : 0.52;
    const t = mkText(tag, 0.08, active ? new THREE.Color(0xe7f1ff) : colors.muted, 0.95, 'center');
    t.position.z = 0.02;
    b.add(t);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.03, 12), new THREE.MeshBasicMaterial({ color: active ? 0x91b5ff : 0x5f6f91, transparent: true, opacity: 0.6 }));
    dot.position.set(-0.42, 0, 0.02);
    b.add(dot);
    bottomBar.add(b);
    interaction.bottomFilterMeshes.push(b);
  });
}

function updatePanelTargets() {
  const order = ['A', 'B', 'C'];
  if (state.focusPanel !== 'A') {
    const i = order.indexOf(state.focusPanel);
    [order[0], order[i]] = [order[i], order[0]];
  }
  order.forEach((panel, idx) => {
    const src = idx === 0 ? panelDefs.A : idx === 1 ? panelDefs.B : panelDefs.C;
    const p = panelSprings[panel].target;
    p.x = src.x;
    p.y = src.y;
    p.z = src.z + (state.mailboxMode === 'inbox' ? 0 : -0.3 * idx);
    p.scale = src.scale;
    p.rotY = src.rotY + (state.mailboxMode === 'archive' ? 0.02 : state.mailboxMode === 'sent' ? -0.02 : 0);
  });
}

function setFocusedPanel(panel) {
  if (!panel || panel === state.focusPanel) return;
  state.focusPanel = panel;
  updatePanelTargets();
  buildControls();
}

function openDetail(emailId, isCompose = false) {
  const t = performance.now();
  state.detailOpen = true;
  state.detailEmailId = emailId;
  detailWindow.visible = true;
  detailWindow.userData = { openAt: t, isCompose };
  detailWindow.position.set(0, 0, -0.2);
  detailWindow.scale.setScalar(0.65);
  const email = emails.find((e) => e.id === emailId) || { sender: 'New message', body: '', subject: 'New Message', threadId: '' };
  detailTitle.text = `${email.sender} — ${email.subject}`;
  detailBody.text = email.body;
  composeLabel.text = isCompose ? 'Compose...|' : 'Reply draft...|';
  composeLabel.sync();
  renderThreadDrawer(email);
}

function renderThreadDrawer(email) {
  clearGroup(threadDrawer);
  threadDrawer.add(threadDrawerBg);
  const history = threadHistory[email.threadId] || [];
  if (email.groupOutOfSeq) {
    const title = mkText('Branch view', 0.11, colors.text, 1.8, 'left');
    title.position.set(-0.92, 1.35, 0.03);
    threadDrawer.add(title);
    history.forEach((h, i) => {
      const indent = i % 2 ? -0.15 : 0.12;
      const line = mkText(`${h.who}: ${h.text}`, 0.08, colors.muted, 1.8, 'left');
      line.position.set(-0.88 + indent, 1.0 - i * 0.48, 0.03);
      threadDrawer.add(line);
      const connector = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 0.24), new THREE.MeshBasicMaterial({ color: 0x6f84a8, transparent: true, opacity: 0.35 }));
      connector.position.set(-0.95 + indent, 0.88 - i * 0.48, 0.02);
      threadDrawer.add(connector);
    });
  } else {
    const title = mkText('Thread history', 0.11, colors.text, 1.8, 'left');
    title.position.set(-0.92, 1.35, 0.03);
    threadDrawer.add(title);
    history.forEach((h, i) => {
      const line = mkText(`${h.time} ${h.who}`, 0.075, new THREE.Color(0xaec2eb), 1.8, 'left');
      line.position.set(-0.88, 1.0 - i * 0.44, 0.03);
      threadDrawer.add(line);
      const body = mkText(h.text, 0.07, colors.muted, 1.8, 'left');
      body.position.set(-0.88, 0.84 - i * 0.44, 0.03);
      threadDrawer.add(body);
    });
  }
}

function triggerDelete() {
  const id = state.selectedEmailId;
  if (!id) return;
  const card = interaction.cardMeshes.find((c) => c.userData.emailId === id);
  if (!card) return;
  const emailIndex = emails.findIndex((e) => e.id === id);
  state.undoPayload = { email: { ...emails[emailIndex] }, index: emailIndex };
  state.pendingClearUndo = false;
  card.userData.anim = { type: 'delete', t: 0, dur: 0.36, from: card.position.clone() };
}

function undoDelete() {
  if (!state.undoPayload) return;
  const payload = state.undoPayload;
  const exists = emails.find((e) => e.id === payload.email.id);
  if (!exists) emails.splice(Math.min(payload.index, emails.length), 0, payload.email);
  state.selectedEmailId = payload.email.id;
  renderCards();
  const card = interaction.cardMeshes.find((c) => c.userData.emailId === payload.email.id);
  if (card) {
    card.position.set(2.9, -2.5, 0.2);
    card.userData.anim = { type: 'undo', t: 0, dur: 0.36, to: new THREE.Vector3(0, card.position.y, 0.05) };
  }
  state.undoPayload = null;
}

function handleControl(action) {
  if (action === 'New') {
    openDetail(Date.now(), true);
  } else if (action === 'Delete') {
    triggerDelete();
  } else if (action === 'Archive' && state.selectedEmailId) {
    const e = emails.find((x) => x.id === state.selectedEmailId);
    if (e) e.mailbox = 'archive';
    state.selectedEmailId = null;
    renderCards();
  } else if (action === 'Reply' || action === 'Forward') {
    if (state.selectedEmailId) openDetail(state.selectedEmailId, false);
  } else if (action === 'Undo') {
    undoDelete();
  } else if (action === 'Filter') {
    state.filters.clear();
    renderCards();
    buildBottomFilters();
  }
}

function pick(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

renderer.domElement.addEventListener('pointermove', (e) => {
  pick(e);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([
    ...Object.values(interaction.panelMeshes),
    ...interaction.controlMeshes,
    ...interaction.cardMeshes,
    ...interaction.bottomFilterMeshes,
    interaction.threadArrow
  ].filter(Boolean), false);

  const first = hits[0]?.object;
  state.hoveredPanel = null;
  state.hoveredControl = null;
  state.hoveredThreadArrow = false;
  if (first?.userData.type === 'panel') {
    state.hoveredPanel = first.userData.panel;
    setFocusedPanel(state.hoveredPanel);
  }
  if (first?.userData.type === 'control') state.hoveredControl = first.userData.action;
  if (first?.userData.type === 'thread-arrow') state.hoveredThreadArrow = true;
});

renderer.domElement.addEventListener('wheel', (e) => {
  const panel = state.hoveredPanel || state.focusPanel;
  state.panelScrollTarget[panel] += e.deltaY * -0.0015;
  state.panelScrollTarget[panel] = THREE.MathUtils.clamp(state.panelScrollTarget[panel], -2.8, 0.4);
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  pick(e);
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects([
    ...interaction.controlMeshes,
    ...interaction.cardMeshes,
    ...interaction.bottomFilterMeshes,
    interaction.threadArrow
  ].filter(Boolean), false);
  if (!hits.length) {
    state.pendingClearUndo = true;
    return;
  }

  const obj = hits[0].object;
  if (obj.userData.type === 'control') {
    handleControl(obj.userData.action);
    if (obj.userData.action !== 'Undo') state.pendingClearUndo = true;
    return;
  }

  if (obj.userData.type === 'card') {
    const id = obj.userData.emailId;
    const now = performance.now();
    if (state.lastClick.id === id && now - state.lastClick.time < 280) {
      openDetail(id, false);
    } else {
      state.selectedEmailId = id;
      buildControls();
      renderCards();
    }
    state.lastClick = { id, time: now };
    state.pendingClearUndo = true;
    return;
  }

  if (obj.userData.type === 'bottom-filter') {
    const tag = obj.userData.tag;
    if (tag === 'Sent') {
      state.mailboxMode = state.mailboxMode === 'sent' ? 'inbox' : 'sent';
      updatePanelTargets();
    } else if (tag === 'Archive') {
      state.mailboxMode = state.mailboxMode === 'archive' ? 'inbox' : 'archive';
      updatePanelTargets();
    } else if (state.filters.has(tag)) {
      state.filters.delete(tag);
    } else {
      state.filters.add(tag);
    }
    renderCards();
    buildBottomFilters();
    state.pendingClearUndo = true;
  }
});

window.addEventListener('keydown', (e) => {
  if (state.hoveredControl === 'Search' || e.key === '/' || state.search.length) {
    if (e.key === 'Backspace') state.search = state.search.slice(0, -1);
    else if (e.key.length === 1) state.search += e.key;
    else if (e.key === 'Escape') state.search = '';
    renderCards();
    buildControls();
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  const s = Math.min(1, window.innerWidth / 1400);
  root.scale.set(s, s, 1);
});

function animateDelete(card, dt) {
  const a = card.userData.anim;
  if (!a) return;
  a.t += dt;
  const p = Math.min(1, a.t / a.dur);
  if (a.type === 'delete') {
    const scrunch = p < 0.42 ? p / 0.42 : 1;
    card.scale.set(1 - scrunch * 0.46, 1 - scrunch * 0.58, 1);
    card.rotation.z = -0.35 * scrunch;
    if (p > 0.42) {
      const q = (p - 0.42) / 0.58;
      card.position.x = THREE.MathUtils.lerp(a.from.x, 2.9, q);
      card.position.y = THREE.MathUtils.lerp(a.from.y, -2.5, q) + Math.sin(q * Math.PI) * 0.4;
      card.position.z = THREE.MathUtils.lerp(a.from.z, 0.35, q);
      card.rotation.z = THREE.MathUtils.lerp(-0.35, -1.4, q);
    }
    if (p >= 1) {
      const id = card.userData.emailId;
      const idx = emails.findIndex((x) => x.id === id);
      if (idx >= 0) emails.splice(idx, 1);
      state.selectedEmailId = null;
      card.userData.anim = null;
      renderCards();
      buildControls();
      buildBottomFilters();
    }
  } else if (a.type === 'undo') {
    const q = p;
    card.position.x = THREE.MathUtils.lerp(2.9, 0, q);
    card.position.y = THREE.MathUtils.lerp(-2.5, card.position.y, q) + Math.sin((1 - q) * Math.PI) * 0.2;
    card.scale.set(0.54 + q * 0.46, 0.42 + q * 0.58, 1);
    card.rotation.z = THREE.MathUtils.lerp(-1.4, 0, q);
    if (p >= 1) card.userData.anim = null;
  }
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.033);

  if (state.pendingClearUndo && state.undoPayload) {
    state.undoPayload = null;
    state.pendingClearUndo = false;
    buildControls();
  }

  ['A', 'B', 'C'].forEach((panel) => {
    let s = panelSprings[panel];
    [s.x, s.vx] = springStep(s.x, s.vx, s.target.x, dt);
    [s.y, s.vy] = springStep(s.y, s.vy, s.target.y, dt);
    [s.z, s.vz] = springStep(s.z, s.vz, s.target.z, dt);
    [s.s, s.vs] = springStep(s.s, s.vs, s.target.scale, dt, 260, 29);
    [s.r, s.vr] = springStep(s.r, s.vr, s.target.rotY, dt, 190, 24);

    panelGroups[panel].g.position.set(s.x, s.y, s.z);
    panelGroups[panel].g.scale.setScalar(s.s);
    panelGroups[panel].g.rotation.y = s.r;

    [state.panelScroll[panel], state.panelScrollTarget[panel]] = [
      THREE.MathUtils.lerp(state.panelScroll[panel], state.panelScrollTarget[panel], 0.18),
      state.panelScrollTarget[panel]
    ];
  });

  interaction.cardMeshes.forEach((card) => animateDelete(card, dt));
  renderCards();

  if (state.detailOpen) {
    const elapsed = performance.now() - detailWindow.userData.openAt;
    const p = Math.min(1, elapsed / 300);
    detailWindow.position.z = THREE.MathUtils.lerp(-0.2, 1.15, p);
    detailWindow.scale.setScalar(0.65 + 0.35 * p);
    if (state.detailEmailId) {
      state.typingCursor = !state.typingCursor;
      composeLabel.text = composeLabel.text.replace('|', '') + (state.typingCursor ? '|' : '');
      composeLabel.sync();
    }
  }

  const threadTarget = state.hoveredThreadArrow ? 1.7 : 3.6;
  [threadDrawerX, threadDrawerVel] = springStep(threadDrawerX, threadDrawerVel, threadTarget, dt, 240, 26);
  threadDrawer.position.x = threadDrawerX;

  const panelPos = panelSprings[state.focusPanel];
  controlsGroup.position.set(panelPos.x - PANEL_W * panelPos.s * 0.47, panelPos.y + PANEL_H * panelPos.s * 0.44, panelPos.z + 0.09);
  controlsGroup.rotation.y = panelPos.r;
  controlsGroup.scale.setScalar(panelPos.s);

  bottomBar.position.set(0, -2.9, -0.2);

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

updatePanelTargets();
buildControls();
buildBottomFilters();
renderCards();

const rs = Math.min(1, window.innerWidth / 1400);
root.scale.set(rs, rs, 1);

tick();
