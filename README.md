# Symphony — 3D Skeuomorphic Inbox (Three.js)

## Run locally

```bash
python3 -m http.server 5173
```

Then open `http://localhost:5173`.

## Controls

- Hover any panel to bring it forward into focus (A/B/C focus swap).
- Mouse wheel scrolls the list inside the hovered (or focused) panel.
- Click an email card to select it.
- Double-click a selected card to open detail/compose foreground window.
- Focused panel top controls:
  - `New` opens compose
  - `Delete` runs scrunch + toss animation
  - `Undo` appears after delete and reverses the animation
  - `Archive` moves selected mail to archive mailbox
  - `Reply` / `Forward` appear when an email is selected
  - `Search` then type to filter; `Backspace` deletes; `Esc` clears
- Bottom bar toggles:
  - `Sent` / `Archive` switch mailbox mode with full spatial reorganization
  - Function toggles (`Marketing`, `Engineering`, `Sales`, `Strategy`, `Governance`) can be combined

## Scene graph overview

- `root`
  - `panelGroups[A|B|C]`
    - panel mesh + edge plane
    - title text
    - custom transparent scrollbar + thumb
    - card layer (email cards as planes + SDF text + optional avatar + AI glow)
  - `controlsGroup` (top controls for focused panel)
  - `detailWindow` (foreground message/compose window)
    - thread arrow trigger
    - slide-in `threadDrawer` history panel (list or tree style)
  - `bottomBar` (mailbox + functional filters)
  - `nebula` (tiny remote dots for filtered-out emails)
