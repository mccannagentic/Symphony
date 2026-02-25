import * as THREE from 'https://unpkg.com/three@0.170.0/build/three.module.js';

/*
 * Symphony 3D Inbox — full rebuild
 * Architecture:
 * - Data model: emails, filters, panel state
 * - Rendering: panel shells, cards, controls, detail window, drawer, bottom filters, nebula
 * - Interaction: raycasting, click/double-click, wheel scroll, search text mode
 * - Animation: spring integrator + bounded procedural animations
 */

const app = document.getElementById('app');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = false;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x03050d);
scene.fog = new THREE.Fog(0x03050d, 7, 24);

const camera = new THREE.PerspectiveCamera(43, window.innerWidth / window.innerHeight, 0.1, 120);
camera.position.set(0, 0.15, 7.4);

const root = new THREE.Group();
scene.add(root);

const ambient = new THREE.AmbientLight(0xaec8ff, 0.7);
const keyLight = new THREE.DirectionalLight(0x89a8ff, 1.1);
const rimLight = new THREE.DirectionalLight(0x8a62ff, 0.25);
keyLight.position.set(2.5, 3.2, 5.5);
rimLight.position.set(-3.2, 1.2, -2.5);
scene.add(ambient, keyLight, rimLight);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(-20, -20);
const clock = new THREE.Clock();

// -----------------------------------------------------------------------------
// Visual constants
// -----------------------------------------------------------------------------
const PANEL_W = 4.35;
const PANEL_H = 5.65;
const CARD_W = 3.78;
const CARD_H = 0.82;
const CARD_GAP = 0.91;
const LIST_TOP = 1.92;
const LIST_BOTTOM = -2.18;
const OPEN_DURATION = 0.28; // <= 300ms
const DELETE_DURATION = 0.36; // 250-450ms

const COLORS = {
  bg: new THREE.Color(0x03050d),
  panelA: new THREE.Color(0x0f1629),
  panelB: new THREE.Color(0x0d1425),
  panelC: new THREE.Color(0x0b1220),
  panelEdge: new THREE.Color(0x283d63),
  title: new THREE.Color(0xc8d9ff),
  titleMuted: new THREE.Color(0x8fa3cb),
  control: new THREE.Color(0x1d3254),
  controlActive: new THREE.Color(0x355e96),
  controlText: new THREE.Color(0xe1ecff),
  unread: new THREE.Color(0x1e3358),
  read: new THREE.Color(0x161f35),
  spam: new THREE.Color(0x2a2e37),
  selected: new THREE.Color(0x3e6cae),
  sender: new THREE.Color(0xeaf2ff),
  senderRead: new THREE.Color(0xb8c8e9),
  preview: new THREE.Color(0x8ea1c6),
  recipient: new THREE.Color(0x768ab3),
  aiGlow: new THREE.Color(0x8d5eff),
  scrollbar: new THREE.Color(0x8aa7d9),
  threadBg: new THREE.Color(0x121c33),
  detailBg: new THREE.Color(0x0f1729),
  detailText: new THREE.Color(0xd3e2ff),
  detailMuted: new THREE.Color(0x8fa2c8),
  bottomBar: new THREE.Color(0x0a1021),
  filterOff: new THREE.Color(0x193055),
  filterOn: new THREE.Color(0x2e588f),
  nebula: new THREE.Color(0x7b90bc)
};

const sharedGeometry = {
  panel: new THREE.PlaneGeometry(PANEL_W, PANEL_H),
  panelBorder: new THREE.PlaneGeometry(PANEL_W + 0.04, PANEL_H + 0.04),
  card: new THREE.PlaneGeometry(CARD_W, CARD_H),
  cardBorder: new THREE.PlaneGeometry(CARD_W + 0.025, CARD_H + 0.025),
  control: new THREE.PlaneGeometry(0.74, 0.28),
  search: new THREE.PlaneGeometry(1.82, 0.28),
  bottomButton: new THREE.PlaneGeometry(1.08, 0.28),
  detail: new THREE.PlaneGeometry(5.52, 3.84),
  drawer: new THREE.PlaneGeometry(2.36, 3.84),
  avatar: new THREE.CircleGeometry(0.13, 22),
  scrollTrack: new THREE.PlaneGeometry(0.042, 4.55),
  scrollThumb: new THREE.PlaneGeometry(0.042, 0.95),
  composeArea: new THREE.PlaneGeometry(4.95, 1.15),
  threadArrow: new THREE.PlaneGeometry(0.21, 0.48),
  nebulaDot: new THREE.SphereGeometry(0.016, 8, 8)
};

// -----------------------------------------------------------------------------
// Utility functions
// -----------------------------------------------------------------------------
function makeSpring(value = 0) {
  return { value, velocity: 0, target: value };
}

function stepSpring(s, dt, stiffness = 220, damping = 26) {
  const force = (s.target - s.value) * stiffness;
  s.velocity += force * dt;
  s.velocity *= Math.exp(-damping * dt);
  s.value += s.velocity * dt;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function buildCanvasLabel({
  text = '',
  width = 1,
  height = 0.18,
  fontSize = 34,
  color = '#d9e4ff',
  align = 'left',
  lineClamp = 1,
  opacity = 1,
  letterSpacing = 0
} = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 512;

  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;

  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(width, height, 1);

  const state = {
    text,
    fontSize,
    color,
    align,
    lineClamp,
    letterSpacing,
    width,
    height
  };

  function truncateText(line, maxWidth) {
    let out = line;
    if (ctx.measureText(out).width <= maxWidth) return out;
    while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) out = out.slice(0, -1);
    return `${out}…`;
  }

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = `600 ${state.fontSize}px Inter, -apple-system, Segoe UI, Arial, sans-serif`;
    ctx.fillStyle = state.color;
    ctx.textBaseline = 'middle';
    ctx.textAlign = state.align === 'center' ? 'center' : 'left';

    const paddingX = 34;
    const drawWidth = canvas.width - paddingX * 2;
    const x = state.align === 'center' ? canvas.width / 2 : paddingX;

    const lines = String(state.text).split('\n');
    const visible = lines.slice(0, state.lineClamp);
    if (lines.length > state.lineClamp) visible[state.lineClamp - 1] = `${visible[state.lineClamp - 1]}…`;

    const lineHeight = state.fontSize * 1.14;
    const totalHeight = visible.length * lineHeight;
    const startY = canvas.height / 2 - totalHeight / 2 + lineHeight / 2;

    visible.forEach((raw, i) => {
      const line = truncateText(raw, drawWidth);
      if (state.letterSpacing === 0 || state.align === 'center') {
        ctx.fillText(line, x, startY + i * lineHeight);
      } else {
        let cursor = x;
        for (const ch of line) {
          ctx.fillText(ch, cursor, startY + i * lineHeight);
          cursor += ctx.measureText(ch).width + state.letterSpacing;
        }
      }
    });

    tex.needsUpdate = true;
  }

  sprite.userData.label = {
    setText(v) {
      state.text = v;
      draw();
    },
    setColor(v) {
      state.color = v;
      draw();
    },
    setFontSize(v) {
      state.fontSize = v;
      draw();
    },
    setOpacity(v) {
      mat.opacity = v;
    },
    setScale(w, h) {
      state.width = w;
      state.height = h;
      sprite.scale.set(w, h, 1);
      draw();
    }
  };

  draw();
  return sprite;
}

function setPointerFromEvent(e) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
}

function intersects(objects) {
  raycaster.setFromCamera(pointer, camera);
  return raycaster.intersectObjects(objects.filter(Boolean), false);
}

// -----------------------------------------------------------------------------
// Data model
// -----------------------------------------------------------------------------
function email(id, config) {
  return {
    id,
    sender: 'Unknown',
    recipients: [],
    subject: 'Untitled',
    preview: 'Message preview',
    body: 'Body',
    panel: 'A',
    mailbox: 'inbox',
    unread: false,
    important: false,
    spam: false,
    ai: false,
    avatarColor: null,
    tags: ['Strategy'],
    threadId: `thread-${id}`,
    groupOutOfSeq: false,
    ...config
  };
}

const emails = [
  email(1, {
    sender: 'Ari Chen',
    recipients: ['Board Ops'],
    subject: 'Q3 strategy pivots',
    preview: 'Need your sign-off before board pack freeze.',
    body: 'Hi — revised scenarios include constrained and accelerated paths. Please annotate before 2 PM.',
    panel: 'A',
    unread: true,
    important: true,
    avatarColor: 0x66c5ff,
    tags: ['Strategy'],
    threadId: 'thread-strategy'
  }),
  email(2, {
    sender: 'Build Agent Sigma',
    subject: 'Nightly quality summary',
    preview: '2 regressions detected in checkout journey.',
    body: 'Automated QA run found two visual diffs and one flaky test. Suggested patch sequence attached.',
    panel: 'A',
    unread: true,
    important: true,
    ai: true,
    tags: ['Engineering'],
    threadId: 'thread-qa'
  }),
  email(3, {
    sender: 'Tessa',
    recipients: ['CFO', 'Legal'],
    subject: 'Re: acquisition model',
    preview: 'Added sensitivity bands to tab 4 and assumptions list.',
    body: 'Inserted legal caveats and scenario deltas requested in steering call.',
    panel: 'A',
    unread: false,
    tags: ['Governance'],
    threadId: 'thread-acq'
  }),
  email(4, {
    sender: 'Marketing Ops',
    subject: 'Launch campaign budget',
    preview: 'Need revised spend by region.',
    body: 'LATAM +12%, APAC flat, North America -4%.',
    panel: 'B',
    unread: true,
    avatarColor: 0xffb17a,
    tags: ['Marketing'],
    threadId: 'thread-campaign'
  }),
  email(5, {
    sender: 'Sales Pod 4',
    recipients: ['RevOps'],
    subject: 'Deal room activity',
    preview: 'New stakeholder joined thread and asked for SOC docs.',
    body: 'Need compliance packet by Friday to keep procurement moving.',
    panel: 'B',
    unread: false,
    tags: ['Sales'],
    threadId: 'thread-sales'
  }),
  email(6, {
    sender: 'Infra Chat',
    recipients: ['SRE', 'Platform', 'QA'],
    subject: 'Incident follow-up',
    preview: 'Thread branched and replies are out of sequence.',
    body: 'Postmortem draft in progress; branches represent alternate remediation proposals.',
    panel: 'B',
    unread: true,
    tags: ['Engineering'],
    threadId: 'thread-incident',
    groupOutOfSeq: true
  }),
  email(7, {
    sender: 'AdBlast',
    subject: 'You won 4000 leads',
    preview: 'Claim now with one click.',
    body: 'Spam message.',
    panel: 'C',
    unread: false,
    spam: true,
    tags: ['Marketing']
  }),
  email(8, {
    sender: 'Unknown Promo',
    subject: 'Crypto treasury multiplier',
    preview: 'Guaranteed 10x this quarter.',
    body: 'Spam message.',
    panel: 'C',
    unread: false,
    spam: true,
    tags: ['Sales']
  }),
  email(9, {
    sender: 'Governance Desk',
    subject: 'Policy refresh reminder',
    preview: 'Archived compliance memo updated.',
    body: 'Archive-only policy notes.',
    panel: 'B',
    mailbox: 'archive',
    unread: false,
    tags: ['Governance'],
    threadId: 'thread-gov'
  }),
  email(10, {
    sender: 'Sent: Mira',
    subject: 'Draft sent to legal',
    preview: 'Sent mailbox copy.',
    body: 'Outbound update was delivered.',
    panel: 'A',
    mailbox: 'sent',
    unread: false,
    tags: ['Strategy'],
    threadId: 'thread-sent'
  }),
  email(11, {
    sender: 'Atlas Agent',
    subject: 'Forecast anomaly summary',
    preview: 'Detected variance in East region by 6.4%.',
    body: 'AI assistant surfaced spend anomaly and root-cause candidates.',
    panel: 'A',
    unread: true,
    ai: true,
    important: true,
    tags: ['Sales'],
    threadId: 'thread-atlas'
  }),
  email(12, {
    sender: 'People Ops',
    subject: 'Quarterly all-hands agenda',
    preview: 'Proposed topics attached for review.',
    body: 'Agenda includes hiring plan, product milestones, and security update.',
    panel: 'C',
    unread: false,
    tags: ['Strategy'],
    threadId: 'thread-allhands'
  })
];

const threadHistory = {
  'thread-strategy': [
    { time: '11:03', who: 'Ari Chen', text: 'Shared first draft for board.' },
    { time: '10:42', who: 'You', text: 'Need risk flags and alternate budget.' },
    { time: '09:58', who: 'Ari Chen', text: 'Adding appendix now.' }
  ],
  'thread-incident': [
    { time: '12:05', who: 'QA', text: 'Candidate root cause B has stronger evidence.' },
    { time: '11:48', who: 'SRE', text: 'Rollback complete in us-east.' },
    { time: '11:41', who: 'Platform', text: 'Patch A canary metrics stable.' }
  ],
  'thread-qa': [
    { time: '08:31', who: 'Build Agent Sigma', text: 'Generated remediation hints.' },
    { time: '07:56', who: 'You', text: 'Tag critical issues for morning triage.' }
  ],
  'thread-sales': [
    { time: '14:12', who: 'Sales Pod 4', text: 'Procurement requests SOC2 and DPA.' },
    { time: '13:34', who: 'RevOps', text: 'Legal response ETA tomorrow.' }
  ]
};

const appState = {
  focusPanel: 'A',
  hoveredPanel: null,
  hoveredThreadArrow: false,
  selectedEmailId: null,
  searchQuery: '',
  searchActive: false,
  mailboxMode: 'inbox', // inbox | sent | archive
  functionFilters: new Set(),
  undoPayload: null,
  clearUndoOnNextAction: false,
  detailOpen: false,
  detailEmailId: null,
  detailComposeMode: false,
  detailOpenStart: 0,
  cursorBlinkTime: 0,
  cursorVisible: true,
  panelScroll: { A: 0, B: 0, C: 0 },
  panelScrollTarget: { A: 0, B: 0, C: 0 },
  lastClickEmailId: null,
  lastClickTime: 0,
  dirtyLayout: true,
  dirtyControls: true,
  dirtyBottom: true,
  dirtyNebula: true,
  dirtyThreadDrawer: true
};

// -----------------------------------------------------------------------------
// Panels and layout springs
// -----------------------------------------------------------------------------
const panelRest = {
  A: { x: -2.72, y: 0.06, z: 0.0, s: 1.0, ry: 0.10 },
  B: { x: 0.08, y: -0.07, z: -1.35, s: 0.91, ry: 0.02 },
  C: { x: 2.84, y: -0.18, z: -2.5, s: 0.83, ry: -0.09 }
};

const panelViews = {};
const panelSprings = {};
const cardViewsById = new Map();
const interactive = {
  panels: [],
  cards: [],
  controls: [],
  bottomFilters: [],
  threadArrow: null
};

function createPanel(panelId, titleText, panelColor) {
  const g = new THREE.Group();

  const panelBorder = new THREE.Mesh(
    sharedGeometry.panelBorder,
    new THREE.MeshBasicMaterial({ color: COLORS.panelEdge, transparent: true, opacity: 0.18 })
  );
  panelBorder.position.z = -0.01;

  const panelBody = new THREE.Mesh(
    sharedGeometry.panel,
    new THREE.MeshStandardMaterial({ color: panelColor, metalness: 0.2, roughness: 0.58, transparent: true, opacity: 0.97 })
  );

  const title = buildCanvasLabel({
    text: titleText,
    width: 1.78,
    height: 0.23,
    fontSize: 68,
    color: '#a7badf',
    align: 'left',
    lineClamp: 1
  });
  title.position.set(-1.93, 2.54, 0.032);

  const scrollTrack = new THREE.Mesh(
    sharedGeometry.scrollTrack,
    new THREE.MeshBasicMaterial({ color: COLORS.scrollbar, transparent: true, opacity: 0.1 })
  );
  scrollTrack.position.set(2.06, -0.17, 0.032);

  const scrollThumb = new THREE.Mesh(
    sharedGeometry.scrollThumb,
    new THREE.MeshBasicMaterial({ color: COLORS.scrollbar, transparent: true, opacity: 0.35 })
  );
  scrollThumb.position.set(2.06, 1.63, 0.038);

  const cardsLayer = new THREE.Group();
  g.add(panelBorder, panelBody, title, scrollTrack, scrollThumb, cardsLayer);

  panelBody.userData = { type: 'panel', panelId };
  interactive.panels.push(panelBody);

  root.add(g);

  panelViews[panelId] = {
    id: panelId,
    group: g,
    panelBody,
    title,
    scrollThumb,
    cardsLayer,
    visibleEmailIds: []
  };

  panelSprings[panelId] = {
    x: makeSpring(panelRest[panelId].x),
    y: makeSpring(panelRest[panelId].y),
    z: makeSpring(panelRest[panelId].z),
    s: makeSpring(panelRest[panelId].s),
    ry: makeSpring(panelRest[panelId].ry)
  };
}

createPanel('A', 'Panel A — Focused', COLORS.panelA);
createPanel('B', 'Panel B — Less Urgent', COLORS.panelB);
createPanel('C', 'Panel C — Background', COLORS.panelC);

function applyPanelTargets() {
  const order = ['A', 'B', 'C'];
  if (appState.focusPanel !== 'A') {
    const idx = order.indexOf(appState.focusPanel);
    [order[0], order[idx]] = [order[idx], order[0]];
  }

  const mailboxNudge = appState.mailboxMode === 'inbox' ? 0 : appState.mailboxMode === 'sent' ? -0.24 : -0.34;
  const tiltNudge = appState.mailboxMode === 'sent' ? -0.025 : appState.mailboxMode === 'archive' ? 0.03 : 0;

  order.forEach((panelId, i) => {
    const src = i === 0 ? panelRest.A : i === 1 ? panelRest.B : panelRest.C;
    panelSprings[panelId].x.target = src.x;
    panelSprings[panelId].y.target = src.y;
    panelSprings[panelId].z.target = src.z + i * mailboxNudge;
    panelSprings[panelId].s.target = src.s;
    panelSprings[panelId].ry.target = src.ry + tiltNudge;
  });
}

applyPanelTargets();

// -----------------------------------------------------------------------------
// Card views
// -----------------------------------------------------------------------------
function createCardView(emailData) {
  const g = new THREE.Group();

  const border = new THREE.Mesh(
    sharedGeometry.cardBorder,
    new THREE.MeshBasicMaterial({ color: 0x466392, transparent: true, opacity: 0.2 })
  );
  border.position.z = -0.008;

  const bg = new THREE.Mesh(
    sharedGeometry.card,
    new THREE.MeshStandardMaterial({ color: COLORS.unread, metalness: 0.08, roughness: 0.63, transparent: true, opacity: 0.94 })
  );

  const aiGlow = new THREE.Mesh(
    sharedGeometry.cardBorder,
    new THREE.MeshBasicMaterial({ color: COLORS.aiGlow, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending })
  );
  aiGlow.position.z = -0.015;

  const sender = buildCanvasLabel({ text: '', width: 2.2, height: 0.24, fontSize: 72, color: '#eaf2ff', align: 'left' });
  sender.position.set(-1.68, 0.23, 0.03);

  const recipients = buildCanvasLabel({ text: '', width: 1.82, height: 0.17, fontSize: 49, color: '#7186af', align: 'left' });
  recipients.position.set(-1.68, 0.35, 0.03);

  const subjectPreview = buildCanvasLabel({ text: '', width: 3.05, height: 0.20, fontSize: 53, color: '#8ea1c6', align: 'left', lineClamp: 2 });
  subjectPreview.position.set(-1.68, -0.09, 0.03);

  const avatar = new THREE.Mesh(
    sharedGeometry.avatar,
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
  );
  avatar.position.set(1.55, 0.02, 0.034);

  g.add(border, aiGlow, bg, sender, recipients, subjectPreview, avatar);

  bg.userData = { type: 'card', emailId: emailData.id };
  interactive.cards.push(bg);

  const view = {
    emailId: emailData.id,
    group: g,
    bg,
    border,
    aiGlow,
    sender,
    recipients,
    subjectPreview,
    avatar,
    stableY: 0,
    stableZ: 0.05,
    visiblePanel: emailData.panel,
    anim: null
  };

  styleCardView(view, emailData);
  return view;
}

function styleCardView(view, emailData) {
  const isSelected = appState.selectedEmailId === emailData.id;

  let color = COLORS.unread;
  let opacity = 0.92;
  let zOffset = 0.06;

  if (emailData.spam) {
    color = COLORS.spam;
    opacity = 0.46;
    zOffset = -0.17;
  } else if (!emailData.unread) {
    color = COLORS.read;
    opacity = 0.67;
    zOffset = -0.07;
  }

  if (isSelected) {
    color = COLORS.selected;
    opacity = 0.98;
  }

  view.bg.material.color.copy(color);
  view.bg.material.opacity = opacity;
  view.border.material.opacity = isSelected ? 0.42 : 0.2;
  view.stableZ = zOffset;

  view.aiGlow.visible = Boolean(emailData.ai);

  view.sender.userData.label.setText(emailData.sender);
  view.sender.userData.label.setColor((emailData.unread ? '#eef5ff' : '#b7c6e5'));
  view.sender.userData.label.setFontSize(emailData.important ? 76 : 70);

  view.recipients.visible = emailData.recipients.length > 0;
  view.recipients.userData.label.setText(emailData.recipients.join(', '));

  const preview = emailData.unread
    ? `${emailData.subject}\n${emailData.preview}`
    : `${emailData.subject}`;
  view.subjectPreview.userData.label.setText(preview);
  view.subjectPreview.userData.label.setScale(3.05, emailData.unread ? 0.28 : 0.19);

  view.avatar.visible = Boolean(emailData.avatarColor);
  if (emailData.avatarColor) view.avatar.material.color.set(emailData.avatarColor);
}

function ensureCardViews() {
  const ids = new Set(emails.map((e) => e.id));

  for (const [id, view] of cardViewsById.entries()) {
    if (!ids.has(id)) {
      view.group.removeFromParent();
      cardViewsById.delete(id);
      const i = interactive.cards.indexOf(view.bg);
      if (i >= 0) interactive.cards.splice(i, 1);
    }
  }

  emails.forEach((e) => {
    if (!cardViewsById.has(e.id)) cardViewsById.set(e.id, createCardView(e));
  });
}

// -----------------------------------------------------------------------------
// Filtering & visibility
// -----------------------------------------------------------------------------
function mailboxMatches(e) {
  if (appState.mailboxMode === 'sent') return e.mailbox === 'sent';
  if (appState.mailboxMode === 'archive') return e.mailbox === 'archive';
  return e.mailbox === 'inbox';
}

function functionMatches(e) {
  if (appState.functionFilters.size === 0) return true;
  return e.tags.some((t) => appState.functionFilters.has(t));
}

function searchMatches(e) {
  if (!appState.searchQuery.trim()) return true;
  const blob = `${e.sender} ${e.subject} ${e.preview} ${e.body}`.toLowerCase();
  return blob.includes(appState.searchQuery.toLowerCase());
}

function visibleInPanel(e, panelId) {
  return e.panel === panelId && mailboxMatches(e) && functionMatches(e) && searchMatches(e);
}

function hiddenToNebula(e) {
  if (!mailboxMatches(e)) return false;
  return !functionMatches(e) || !searchMatches(e);
}

// -----------------------------------------------------------------------------
// Controls (top bar)
// -----------------------------------------------------------------------------
const controlsGroup = new THREE.Group();
root.add(controlsGroup);

function createControlButton(label, action) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(
    sharedGeometry.control,
    new THREE.MeshBasicMaterial({ color: COLORS.control, transparent: true, opacity: 0.8 })
  );
  bg.userData = { type: 'control', action };

  const text = buildCanvasLabel({
    text: label,
    width: 0.58,
    height: 0.16,
    fontSize: 54,
    color: '#e5efff',
    align: 'center'
  });
  text.position.set(0, 0.005, 0.02);

  g.add(bg, text);
  g.userData = { bg, text, action };
  interactive.controls.push(bg);
  return g;
}

function createSearchControl() {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(
    sharedGeometry.search,
    new THREE.MeshBasicMaterial({ color: 0x162949, transparent: true, opacity: 0.88 })
  );
  bg.userData = { type: 'control', action: 'Search' };

  const text = buildCanvasLabel({
    text: 'Search…',
    width: 1.56,
    height: 0.16,
    fontSize: 50,
    color: '#9fb2d8',
    align: 'left'
  });
  text.position.set(-0.7, 0.002, 0.02);

  g.add(bg, text);
  g.userData = { bg, text };
  interactive.controls.push(bg);
  return g;
}

function clearControlGroup() {
  while (controlsGroup.children.length > 0) controlsGroup.remove(controlsGroup.children[0]);
  interactive.controls.length = 0;
}

function rebuildControls() {
  clearControlGroup();

  const actions = [
    { label: 'New', action: 'New' },
    { label: 'Delete', action: 'Delete' },
    { label: 'Archive', action: 'Archive' },
    { label: 'Filter', action: 'Filter' }
  ];

  if (appState.selectedEmailId) {
    actions.push({ label: 'Reply', action: 'Reply' });
    actions.push({ label: 'Forward', action: 'Forward' });
  }

  if (appState.undoPayload) actions.push({ label: 'Undo', action: 'Undo' });

  actions.forEach((meta, idx) => {
    const btn = createControlButton(meta.label, meta.action);
    btn.position.set(idx * 0.82, 0, 0);
    controlsGroup.add(btn);

    if (meta.action === 'Undo') {
      btn.userData.bg.material.color.copy(COLORS.controlActive);
      btn.userData.bg.material.opacity = 0.95;
    }
  });

  const search = createSearchControl();
  search.position.set(actions.length * 0.82 + 0.94, 0, 0);
  controlsGroup.add(search);

  let searchLabel = appState.searchQuery || (appState.searchActive ? 'Type to search…' : 'Search…');
  if (appState.searchActive && appState.cursorVisible) searchLabel += '|';
  search.userData.text.userData.label.setText(searchLabel);
  search.userData.text.userData.label.setColor(appState.searchActive ? '#dcebff' : '#9fb2d8');
}

// -----------------------------------------------------------------------------
// Detail window + thread drawer
// -----------------------------------------------------------------------------
const detailGroup = new THREE.Group();
root.add(detailGroup);
detailGroup.visible = false;

detailGroup.position.set(0, 0, -0.5);
detailGroup.scale.set(0.6, 0.6, 0.6);

const detailBg = new THREE.Mesh(
  sharedGeometry.detail,
  new THREE.MeshStandardMaterial({ color: COLORS.detailBg, metalness: 0.2, roughness: 0.5, transparent: true, opacity: 0.98 })
);
const detailTitle = buildCanvasLabel({ text: '', width: 4.95, height: 0.32, fontSize: 74, color: '#e4edff', align: 'left' });
detailTitle.position.set(-2.38, 1.48, 0.034);
const detailBody = buildCanvasLabel({ text: '', width: 4.95, height: 1.6, fontSize: 48, color: '#a9bada', align: 'left', lineClamp: 6 });
detailBody.position.set(-2.38, 0.29, 0.034);

const composeAreaBg = new THREE.Mesh(
  sharedGeometry.composeArea,
  new THREE.MeshBasicMaterial({ color: 0x132341, transparent: true, opacity: 0.86 })
);
composeAreaBg.position.set(0, -1.25, 0.03);
const composeLabel = buildCanvasLabel({ text: 'Compose…|', width: 4.62, height: 0.42, fontSize: 58, color: '#cfddff', align: 'left' });
composeLabel.position.set(-2.26, -1.25, 0.04);

detailGroup.add(detailBg, detailTitle, detailBody, composeAreaBg, composeLabel);

const threadArrow = new THREE.Mesh(
  sharedGeometry.threadArrow,
  new THREE.MeshBasicMaterial({ color: 0xc4d3f8, transparent: true, opacity: 0.46 })
);
threadArrow.position.set(2.58, 0.25, 0.05);
threadArrow.userData = { type: 'threadArrow' };
detailGroup.add(threadArrow);
interactive.threadArrow = threadArrow;

const threadDrawer = new THREE.Group();
const threadDrawerBg = new THREE.Mesh(
  sharedGeometry.drawer,
  new THREE.MeshStandardMaterial({ color: COLORS.threadBg, metalness: 0.15, roughness: 0.56, transparent: true, opacity: 0.96 })
);
threadDrawer.add(threadDrawerBg);
threadDrawer.position.set(3.8, 0, 0.03);
detailGroup.add(threadDrawer);

const drawerSpring = makeSpring(3.8);

function clearThreadDrawer() {
  while (threadDrawer.children.length > 1) threadDrawer.remove(threadDrawer.children[threadDrawer.children.length - 1]);
}

function rebuildThreadDrawer(emailData) {
  clearThreadDrawer();

  const list = threadHistory[emailData.threadId] || [];
  if (!list.length) {
    const empty = buildCanvasLabel({
      text: 'No prior thread history',
      width: 1.9,
      height: 0.2,
      fontSize: 48,
      color: '#8ba0c8',
      align: 'left'
    });
    empty.position.set(-1.06, 1.32, 0.04);
    threadDrawer.add(empty);
    return;
  }

  if (emailData.groupOutOfSeq) {
    const title = buildCanvasLabel({ text: 'Thread Tree', width: 1.8, height: 0.22, fontSize: 64, color: '#dae7ff', align: 'left' });
    title.position.set(-1.05, 1.45, 0.04);
    threadDrawer.add(title);

    list.forEach((item, idx) => {
      const level = idx % 2 === 0 ? 0 : 1;
      const x = -0.95 + level * 0.3;
      const y = 1.04 - idx * 0.54;

      const bubble = new THREE.Mesh(
        new THREE.PlaneGeometry(1.56 - level * 0.16, 0.34),
        new THREE.MeshBasicMaterial({ color: 0x1c2d4e, transparent: true, opacity: 0.88 })
      );
      bubble.position.set(x + 0.35, y, 0.03);
      threadDrawer.add(bubble);

      const line = buildCanvasLabel({
        text: `${item.who}: ${item.text}`,
        width: 1.36 - level * 0.16,
        height: 0.22,
        fontSize: 43,
        color: '#b7c8ea',
        align: 'left',
        lineClamp: 2
      });
      line.position.set(x, y, 0.04);
      threadDrawer.add(line);

      if (idx < list.length - 1) {
        const connector = new THREE.Mesh(
          new THREE.PlaneGeometry(0.014, 0.42),
          new THREE.MeshBasicMaterial({ color: 0x5f79a8, transparent: true, opacity: 0.36 })
        );
        connector.position.set(-1.01 + level * 0.3, y - 0.28, 0.03);
        threadDrawer.add(connector);
      }
    });
  } else {
    const title = buildCanvasLabel({ text: 'Thread History', width: 1.9, height: 0.22, fontSize: 64, color: '#dae7ff', align: 'left' });
    title.position.set(-1.05, 1.45, 0.04);
    threadDrawer.add(title);

    list.forEach((item, idx) => {
      const y = 1.0 - idx * 0.56;
      const heading = buildCanvasLabel({
        text: `${item.time}  ${item.who}`,
        width: 1.8,
        height: 0.16,
        fontSize: 42,
        color: '#b8caee',
        align: 'left'
      });
      heading.position.set(-0.98, y + 0.14, 0.04);
      threadDrawer.add(heading);

      const body = buildCanvasLabel({
        text: item.text,
        width: 1.8,
        height: 0.2,
        fontSize: 40,
        color: '#94a8d0',
        align: 'left',
        lineClamp: 2
      });
      body.position.set(-0.98, y - 0.03, 0.04);
      threadDrawer.add(body);
    });
  }
}

function openDetail(emailId, composeMode = false) {
  const e = emails.find((it) => it.id === emailId);
  const fallback = { sender: 'New message', subject: 'Compose', body: '', threadId: '', groupOutOfSeq: false };
  const target = e || fallback;

  detailTitle.userData.label.setText(`${target.sender} — ${target.subject}`);
  detailBody.userData.label.setText(target.body);
  composeLabel.userData.label.setText(composeMode ? 'Compose…|' : 'Reply draft…|');

  rebuildThreadDrawer(target);

  appState.detailOpen = true;
  appState.detailEmailId = emailId;
  appState.detailComposeMode = composeMode;
  appState.detailOpenStart = performance.now();
  appState.cursorBlinkTime = 0;
  appState.cursorVisible = true;
  appState.dirtyControls = true;
  detailGroup.visible = true;
  detailGroup.position.set(0, 0, -0.5);
  detailGroup.scale.setScalar(0.6);
}

function closeDetail() {
  appState.detailOpen = false;
  appState.detailEmailId = null;
  appState.detailComposeMode = false;
  detailGroup.visible = false;
}

// -----------------------------------------------------------------------------
// Bottom filter bar
// -----------------------------------------------------------------------------
const bottomBar = new THREE.Group();
root.add(bottomBar);

const bottomBarBg = new THREE.Mesh(
  new THREE.PlaneGeometry(9.5, 0.54),
  new THREE.MeshBasicMaterial({ color: COLORS.bottomBar, transparent: true, opacity: 0.72 })
);
bottomBar.add(bottomBarBg);

function clearBottomFilters() {
  while (bottomBar.children.length > 1) bottomBar.remove(bottomBar.children[bottomBar.children.length - 1]);
  interactive.bottomFilters.length = 0;
}

function isBottomFilterActive(tag) {
  if (tag === 'Sent') return appState.mailboxMode === 'sent';
  if (tag === 'Archive') return appState.mailboxMode === 'archive';
  return appState.functionFilters.has(tag);
}

function rebuildBottomFilters() {
  clearBottomFilters();

  const tags = ['Sent', 'Archive', 'Marketing', 'Engineering', 'Sales', 'Strategy', 'Governance'];

  tags.forEach((tag, idx) => {
    const active = isBottomFilterActive(tag);
    const g = new THREE.Group();

    const bg = new THREE.Mesh(
      sharedGeometry.bottomButton,
      new THREE.MeshBasicMaterial({ color: active ? COLORS.filterOn : COLORS.filterOff, transparent: true, opacity: active ? 0.95 : 0.62 })
    );
    bg.userData = { type: 'bottomFilter', tag };

    const label = buildCanvasLabel({
      text: tag,
      width: 0.88,
      height: 0.15,
      fontSize: 48,
      color: active ? '#eaf2ff' : '#99add3',
      align: 'center'
    });
    label.position.set(0, 0.003, 0.02);

    const dot = new THREE.Mesh(
      new THREE.CircleGeometry(0.033, 12),
      new THREE.MeshBasicMaterial({ color: active ? 0x9dc0ff : 0x6179a4, transparent: true, opacity: 0.75 })
    );
    dot.position.set(-0.45, 0, 0.02);

    g.add(bg, label, dot);
    g.position.set(-4.06 + idx * 1.28, 0, 0.02);
    bottomBar.add(g);
    interactive.bottomFilters.push(bg);
  });
}

// -----------------------------------------------------------------------------
// Nebula dots
// -----------------------------------------------------------------------------
const nebulaGroup = new THREE.Group();
root.add(nebulaGroup);

function rebuildNebula() {
  while (nebulaGroup.children.length > 0) nebulaGroup.remove(nebulaGroup.children[nebulaGroup.children.length - 1]);

  const hidden = emails.filter(hiddenToNebula);
  const material = new THREE.MeshBasicMaterial({ color: COLORS.nebula, transparent: true, opacity: 0.22 });

  hidden.forEach((_, i) => {
    const dot = new THREE.Mesh(sharedGeometry.nebulaDot, material);
    dot.position.set(
      -3.7 + (i % 16) * 0.5,
      -2.2 + Math.floor(i / 16) * 0.08,
      -7.2 - (i % 5) * 0.34
    );
    nebulaGroup.add(dot);
  });
}

// -----------------------------------------------------------------------------
// Layout update
// -----------------------------------------------------------------------------
function layoutCardsAndScrollbars() {
  ensureCardViews();
  interactive.cards.length = 0;

  ['A', 'B', 'C'].forEach((panelId) => {
    const panel = panelViews[panelId];
    while (panel.cardsLayer.children.length > 0) panel.cardsLayer.remove(panel.cardsLayer.children[panel.cardsLayer.children.length - 1]);
    panel.visibleEmailIds = [];

    const visible = emails.filter((e) => visibleInPanel(e, panelId));

    visible.forEach((e, idx) => {
      const view = cardViewsById.get(e.id);
      styleCardView(view, e);

      const y = LIST_TOP - idx * CARD_GAP + appState.panelScroll[panelId];
      view.stableY = y;
      view.visiblePanel = panelId;

      if (!view.anim) {
        view.group.position.set(0, y, view.stableZ);
        view.group.rotation.z = 0;
        view.group.scale.set(1, 1, 1);
      }

      panel.cardsLayer.add(view.group);
      panel.visibleEmailIds.push(e.id);
      interactive.cards.push(view.bg);
    });

    const mailboxCount = emails.filter((e) => e.panel === panelId && mailboxMatches(e)).length;
    const shownCount = visible.length;
    const thumbRatio = shownCount <= 0 ? 1 : clamp(shownCount / Math.max(mailboxCount, 1), 0.15, 1);
    panel.scrollThumb.scale.y = thumbRatio;

    const maxScroll = Math.max(0, shownCount * CARD_GAP - (LIST_TOP - LIST_BOTTOM));
    const scrollNorm = maxScroll <= 0 ? 0 : clamp((-appState.panelScroll[panelId]) / maxScroll, 0, 1);
    panel.scrollThumb.position.y = 1.88 - scrollNorm * 3.68;
  });
}

function refreshUI() {
  if (appState.dirtyLayout) {
    layoutCardsAndScrollbars();
    appState.dirtyLayout = false;
  }
  if (appState.dirtyControls) {
    rebuildControls();
    appState.dirtyControls = false;
  }
  if (appState.dirtyBottom) {
    rebuildBottomFilters();
    appState.dirtyBottom = false;
  }
  if (appState.dirtyNebula) {
    rebuildNebula();
    appState.dirtyNebula = false;
  }
}

// -----------------------------------------------------------------------------
// Actions
// -----------------------------------------------------------------------------
function clearUndoOnAction() {
  if (!appState.clearUndoOnNextAction || !appState.undoPayload) return;
  appState.undoPayload = null;
  appState.clearUndoOnNextAction = false;
  appState.dirtyControls = true;
}

function setFocusPanel(panelId) {
  if (!panelId || panelId === appState.focusPanel) return;
  appState.focusPanel = panelId;
  applyPanelTargets();
  appState.dirtyControls = true;
}

function selectEmail(emailId) {
  appState.selectedEmailId = emailId;
  appState.dirtyLayout = true;
  appState.dirtyControls = true;
}

function deleteSelectedEmail() {
  if (!appState.selectedEmailId) return;
  const id = appState.selectedEmailId;
  const eIndex = emails.findIndex((e) => e.id === id);
  if (eIndex < 0) return;

  const view = cardViewsById.get(id);
  if (!view) return;

  appState.undoPayload = {
    email: { ...emails[eIndex] },
    index: eIndex,
    panel: emails[eIndex].panel
  };
  appState.clearUndoOnNextAction = true;
  appState.dirtyControls = true;

  view.anim = {
    type: 'delete',
    t: 0,
    duration: DELETE_DURATION,
    from: view.group.position.clone(),
    fromScale: new THREE.Vector3(1, 1, 1),
    fromRotation: view.group.rotation.z
  };
}

function undoDelete() {
  if (!appState.undoPayload) return;

  const payload = appState.undoPayload;
  const already = emails.some((e) => e.id === payload.email.id);
  if (!already) emails.splice(Math.min(payload.index, emails.length), 0, payload.email);

  appState.selectedEmailId = payload.email.id;
  appState.undoPayload = null;
  appState.clearUndoOnNextAction = false;

  ensureCardViews();
  appState.dirtyLayout = true;
  appState.dirtyControls = true;
  appState.dirtyBottom = true;
  appState.dirtyNebula = true;

  const view = cardViewsById.get(payload.email.id);
  if (view) {
    view.group.position.set(2.9, -2.7, 0.34);
    view.group.rotation.z = -1.42;
    view.group.scale.set(0.52, 0.42, 1);
    view.anim = {
      type: 'undo',
      t: 0,
      duration: DELETE_DURATION,
      toY: 0,
      toZ: 0.04
    };
  }
}

function handleControlAction(action) {
  if (action !== 'Undo' && action !== 'Delete') clearUndoOnAction();

  switch (action) {
    case 'New':
      openDetail(Date.now(), true);
      break;
    case 'Delete':
      deleteSelectedEmail();
      break;
    case 'Archive': {
      if (!appState.selectedEmailId) break;
      const e = emails.find((it) => it.id === appState.selectedEmailId);
      if (e) e.mailbox = 'archive';
      appState.selectedEmailId = null;
      appState.dirtyLayout = true;
      appState.dirtyControls = true;
      appState.dirtyBottom = true;
      appState.dirtyNebula = true;
      break;
    }
    case 'Reply':
    case 'Forward': {
      if (appState.selectedEmailId) openDetail(appState.selectedEmailId, false);
      break;
    }
    case 'Filter':
      appState.functionFilters.clear();
      appState.dirtyLayout = true;
      appState.dirtyBottom = true;
      appState.dirtyNebula = true;
      break;
    case 'Undo':
      undoDelete();
      break;
    case 'Search':
      appState.searchActive = true;
      appState.cursorVisible = true;
      appState.cursorBlinkTime = 0;
      appState.dirtyControls = true;
      break;
    default:
      break;
  }
}

function handleBottomFilter(tag) {
  clearUndoOnAction();

  if (tag === 'Sent') {
    appState.mailboxMode = appState.mailboxMode === 'sent' ? 'inbox' : 'sent';
    if (appState.mailboxMode === 'sent') appState.mailboxMode = 'sent';
  } else if (tag === 'Archive') {
    appState.mailboxMode = appState.mailboxMode === 'archive' ? 'inbox' : 'archive';
    if (appState.mailboxMode === 'archive') appState.mailboxMode = 'archive';
  } else if (appState.functionFilters.has(tag)) {
    appState.functionFilters.delete(tag);
  } else {
    appState.functionFilters.add(tag);
  }

  // Sent and Archive are exclusive mailbox modes
  if (tag === 'Sent' && appState.mailboxMode === 'sent') {
    // nothing else needed
  }
  if (tag === 'Archive' && appState.mailboxMode === 'archive') {
    // nothing else needed
  }

  applyPanelTargets();
  appState.dirtyLayout = true;
  appState.dirtyBottom = true;
  appState.dirtyNebula = true;
}

function getCurrentDetailEmail() {
  if (!appState.detailEmailId) return null;
  return emails.find((e) => e.id === appState.detailEmailId) || null;
}

// -----------------------------------------------------------------------------
// Input
// -----------------------------------------------------------------------------
renderer.domElement.addEventListener('pointermove', (e) => {
  setPointerFromEvent(e);

  const hit = intersects([
    ...interactive.panels,
    ...interactive.controls,
    ...interactive.cards,
    ...interactive.bottomFilters,
    interactive.threadArrow
  ])[0]?.object;

  appState.hoveredPanel = null;
  appState.hoveredThreadArrow = false;

  if (!hit) return;
  if (hit.userData.type === 'panel') {
    appState.hoveredPanel = hit.userData.panelId;
    setFocusPanel(appState.hoveredPanel);
  }
  if (hit.userData.type === 'threadArrow') {
    appState.hoveredThreadArrow = true;
  }
});

renderer.domElement.addEventListener('wheel', (e) => {
  const panelId = appState.hoveredPanel || appState.focusPanel;
  const currentVisible = panelViews[panelId]?.visibleEmailIds.length || 0;
  const maxScroll = Math.max(0, currentVisible * CARD_GAP - (LIST_TOP - LIST_BOTTOM));
  appState.panelScrollTarget[panelId] += e.deltaY * -0.0017;
  appState.panelScrollTarget[panelId] = clamp(appState.panelScrollTarget[panelId], -maxScroll - 0.1, 0.36);
  appState.dirtyLayout = true;
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  setPointerFromEvent(e);
  const hits = intersects([
    ...interactive.controls,
    ...interactive.cards,
    ...interactive.bottomFilters,
    interactive.threadArrow
  ]);

  if (!hits.length) {
    clearUndoOnAction();
    appState.searchActive = false;
    appState.dirtyControls = true;
    return;
  }

  const target = hits[0].object;

  if (target.userData.type === 'control') {
    handleControlAction(target.userData.action);
    return;
  }

  if (target.userData.type === 'bottomFilter') {
    handleBottomFilter(target.userData.tag);
    return;
  }

  if (target.userData.type === 'threadArrow') {
    appState.hoveredThreadArrow = !appState.hoveredThreadArrow;
    return;
  }

  if (target.userData.type === 'card') {
    clearUndoOnAction();
    const id = target.userData.emailId;
    const now = performance.now();

    if (appState.lastClickEmailId === id && now - appState.lastClickTime < 295) {
      openDetail(id, false);
    } else {
      selectEmail(id);
    }

    appState.lastClickEmailId = id;
    appState.lastClickTime = now;
  }
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (appState.detailOpen) {
      closeDetail();
      return;
    }
    appState.searchActive = false;
    appState.searchQuery = '';
    appState.dirtyLayout = true;
    appState.dirtyControls = true;
    appState.dirtyNebula = true;
    return;
  }

  if (!appState.searchActive && e.key !== '/') return;

  if (e.key === '/') {
    appState.searchActive = true;
    appState.dirtyControls = true;
    return;
  }

  if (e.key === 'Backspace') {
    appState.searchQuery = appState.searchQuery.slice(0, -1);
  } else if (e.key === 'Enter') {
    appState.searchActive = false;
  } else if (e.key.length === 1) {
    appState.searchQuery += e.key;
  }

  appState.dirtyLayout = true;
  appState.dirtyControls = true;
  appState.dirtyNebula = true;
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);

  const uiScale = clamp(window.innerWidth / 1620, 0.68, 1.0);
  root.scale.set(uiScale, uiScale, 1);
});

// -----------------------------------------------------------------------------
// Animation update
// -----------------------------------------------------------------------------
function animateCardProcedural(view, dt) {
  if (!view.anim) return;

  view.anim.t += dt;
  const p = clamp(view.anim.t / view.anim.duration, 0, 1);

  if (view.anim.type === 'delete') {
    const scrunchPhase = 0.43;
    if (p <= scrunchPhase) {
      const sp = p / scrunchPhase;
      const wobble = Math.sin(sp * Math.PI * 2.2) * 0.04;
      view.group.scale.set(1 - sp * 0.5, 1 - sp * 0.6 + wobble, 1);
      view.group.rotation.z = -0.38 * sp;
    } else {
      const q = (p - scrunchPhase) / (1 - scrunchPhase);
      const arc = Math.sin(q * Math.PI) * 0.42;
      view.group.position.x = THREE.MathUtils.lerp(view.anim.from.x, 3.15, q);
      view.group.position.y = THREE.MathUtils.lerp(view.anim.from.y, -2.65, q) + arc;
      view.group.position.z = THREE.MathUtils.lerp(view.anim.from.z, 0.35, q);
      view.group.rotation.z = THREE.MathUtils.lerp(-0.38, -1.5, q);
      view.group.scale.set(0.5 - q * 0.08, 0.4 - q * 0.06, 1);
    }

    if (p >= 1) {
      const id = view.emailId;
      const idx = emails.findIndex((e) => e.id === id);
      if (idx >= 0) emails.splice(idx, 1);

      appState.selectedEmailId = null;
      view.anim = null;
      appState.dirtyLayout = true;
      appState.dirtyControls = true;
      appState.dirtyBottom = true;
      appState.dirtyNebula = true;
    }
  }

  if (view.anim && view.anim.type === 'undo') {
    const q = p;
    view.group.position.x = THREE.MathUtils.lerp(2.9, 0, q);
    view.group.position.y = THREE.MathUtils.lerp(-2.7, view.stableY, q) + Math.sin((1 - q) * Math.PI) * 0.22;
    view.group.position.z = THREE.MathUtils.lerp(0.34, view.stableZ, q);
    view.group.rotation.z = THREE.MathUtils.lerp(-1.42, 0, q);
    view.group.scale.set(0.52 + q * 0.48, 0.42 + q * 0.58, 1);

    if (q >= 1) view.anim = null;
  }
}

function updatePanelMotion(dt) {
  ['A', 'B', 'C'].forEach((panelId) => {
    const springs = panelSprings[panelId];

    stepSpring(springs.x, dt, 250, 30);
    stepSpring(springs.y, dt, 240, 28);
    stepSpring(springs.z, dt, 245, 29);
    stepSpring(springs.s, dt, 280, 33);
    stepSpring(springs.ry, dt, 220, 26);

    const panel = panelViews[panelId];
    panel.group.position.set(springs.x.value, springs.y.value, springs.z.value);
    panel.group.scale.setScalar(springs.s.value);
    panel.group.rotation.y = springs.ry.value;

    const oldScroll = appState.panelScroll[panelId];
    appState.panelScroll[panelId] = THREE.MathUtils.lerp(oldScroll, appState.panelScrollTarget[panelId], 0.2);
    if (Math.abs(appState.panelScroll[panelId] - oldScroll) > 0.0002) appState.dirtyLayout = true;
  });

  // subtle global parallax for mode transitions
  const targetY = appState.mailboxMode === 'inbox' ? 0 : appState.mailboxMode === 'sent' ? -0.03 : 0.05;
  root.position.y = THREE.MathUtils.lerp(root.position.y, targetY, 0.08);
}

function updateDetailWindow(dt) {
  if (!appState.detailOpen) return;

  const elapsed = (performance.now() - appState.detailOpenStart) / 1000;
  const t = clamp(elapsed / OPEN_DURATION, 0, 1);
  const eased = easeOutCubic(t);

  detailGroup.position.z = THREE.MathUtils.lerp(-0.5, 1.25, eased);
  detailGroup.scale.setScalar(0.6 + 0.4 * eased);

  appState.cursorBlinkTime += dt;
  if (appState.cursorBlinkTime > 0.45) {
    appState.cursorBlinkTime = 0;
    appState.cursorVisible = !appState.cursorVisible;
    appState.dirtyControls = true;

    const base = appState.detailComposeMode ? 'Compose…' : 'Reply draft…';
    composeLabel.userData.label.setText(appState.cursorVisible ? `${base}|` : base);
  }

  drawerSpring.target = appState.hoveredThreadArrow ? 1.95 : 3.8;
  stepSpring(drawerSpring, dt, 250, 30);
  threadDrawer.position.x = drawerSpring.value;
}

function updateControlsAnchor() {
  const focus = panelSprings[appState.focusPanel];
  controlsGroup.position.set(
    focus.x.value - PANEL_W * focus.s.value * 0.46,
    focus.y.value + PANEL_H * focus.s.value * 0.44,
    focus.z.value + 0.1
  );
  controlsGroup.rotation.y = focus.ry.value;
  controlsGroup.scale.setScalar(focus.s.value);

  bottomBar.position.set(0, -3.05, -0.26);
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);

  updatePanelMotion(dt);

  for (const view of cardViewsById.values()) {
    animateCardProcedural(view, dt);
  }

  updateDetailWindow(dt);
  updateControlsAnchor();

  if (appState.searchActive) {
    appState.cursorBlinkTime += dt;
    if (appState.cursorBlinkTime > 0.45) {
      appState.cursorBlinkTime = 0;
      appState.cursorVisible = !appState.cursorVisible;
      appState.dirtyControls = true;
    }
  }

  refreshUI();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// -----------------------------------------------------------------------------
// Init
// -----------------------------------------------------------------------------
applyPanelTargets();
refreshUI();
root.scale.set(clamp(window.innerWidth / 1620, 0.68, 1), clamp(window.innerWidth / 1620, 0.68, 1), 1);
animate();
