# Mobile App Roadmap — Touchscreen-Optional, Phone-Capable-as-Sole-Interface

The goal is to bring the Expo mobile app to a sensible subset of web-UI parity, and
specifically to make it a **complete standalone interface** so a builder can skip the
kiosk touchscreen for cost/space reasons and run the Pi headless.

The mobile app stays **self-contained** in this repo — no workspaces, and the `Shot`
type / socket event names are deliberately mirrored from the Python wire contract
rather than shared with the web `ui/`. The real source of truth is
`src/openflight/server.py`'s `shot_to_dict()` payload and its SocketIO events in
[open-flight/openflight](https://github.com/open-flight/openflight).

**Status legend:** ✅ shipped · 🟡 partly shipped · ⬜ not started.
Status reflects `main` at `9b5de01`. Each claim was checked against the code rather than
against the title of the PR that delivered it.

## Locked decisions

- **Scope:** Tier 1 (core golfer parity) + a foundation phase, plus the three
  sole-interface items (graceful shutdown, connection bootstrapping, device/status view).
- **Control:** **Full control** — a sole interface must do everything the touchscreen
  could. Destructive actions (**delete shot, clear session, stop the server**) are guarded
  by **confirm dialogs**; the footgun is UI-level, not a network-trust problem.
- **Navigation:** **Bottom tab bar** (Live / Shots / Stats / Device) via **expo-router**
  (file-based routing).
- **Topology:** one app works in all three setups — phone-only (headless Pi),
  phone + kiosk touchscreen, and phone + passive `/display` monitor. Same server, same app.

## Non-goals (explicitly deferred)

Camera feed, radar-config editing, trigger-diagnostic deep dive, Launch Daddy easter egg,
sim-shot badges, swing-speed mode (Tier 2), and the `/display` TV route (a web concern).
None are needed for a complete headless golfer experience; each can be added later without
rework.

---

## Phase 0 — Foundation ✅

**Goal:** restructure so features are cheap to add. Little new user-facing behavior.

Delivered by #1, with connection recovery in #13 and the Expo SDK 54 → 57 upgrade in #10.

| Work item | Status | Detail |
|---|---|---|
| Navigation shell | ✅ #1 | Bottom tabs via expo-router (Live / Shots / Stats / Device). `app/` |
| Socket service | ✅ #1 | Singleton mirroring the web UI's `src/services/socketService.ts` — one place mapping every server event → store. `services/socket.ts` |
| State store | ✅ #1 | zustand stores shared across tabs. `stores/` |
| Connection persistence | ✅ #1, #13 | Server URL persisted via AsyncStorage; Socket.IO's own backoff handles reconnects. A failed or mistyped address is recoverable (#13). The default is still `192.168.1.100:8080`; switching it to the AP address `192.168.4.1:8080` waits on Phase 3. Auto-discovery is Phase 2 item 3. |
| Wire-contract expansion | ✅ #1, then per feature | `types.ts` covers `session_state` extras, `shot_processing`, `club_changed`, `profiles`, `trigger_status`, `power_status`, `debug_status`, `debug_toggled`. `radar_config` is not typed yet. Types land with the feature that consumes them, per `AGENTS.md`'s no-speculative-payloads rule — so a declared type does not by itself mean the feature ships. |
| Test infra | ✅ #1 | `jest-expo` + `@testing-library/react-native`, enforced by CI (#3). |

---

## Phase 1 — Core golfer parity (Tier 1)

**Goal:** the phone is a genuinely useful launch-monitor client.

| # | Feature | Status | Emits / consumes | Notes |
|---|---|---|---|---|
| 1 | Shot history list | ✅ #16, #17 | — | Shots tab, kept on the device in SQLite. Swing-speed sessions fixed in #17. |
| 1b | Delete a shot | ⬜ | `delete_shot` → `session_state`, or `delete_shot_error` | Not started; `delete_shot` is emitted nowhere. Behind a confirm. Note the server answers a miss with `delete_shot_error`, not `session_cleared`. |
| 2 | Session stats | 🟡 #16, #20 | — (computed on the device) | The Shots tab shows the summary tiles. `utils/sessionStats.ts` computes them from the local shot list using a hand-mirrored port of the kiosk's `computeStats` (#20) — `session_state` carries no `stats` field to read instead. The Stats tab itself is still a placeholder; a real one is the remaining work. |
| 2b | Clear the session | ⬜ | `clear_session` → `session_cleared` | Not started. **Profile-scoped:** the payload is `{profile_id}`, defaulting to the active profile, and `session_cleared` returns `{profile_id, shots}` where `shots` is the whole remaining session. Behind a confirm. |
| 3 | Club selection | ✅ #19, #25 | `set_club` / `club_changed` | Canonical club list mirrored in #19; the picker in #25 reflects server-pushed changes from any client. |
| 3b | On-connect club prompt | ⬜ | — | The kiosk's club-select-on-first-connect screen has no mobile equivalent yet. |
| 4 | Profile selection | 🟡 #21 | `get_profiles`, `set_active_profile`, `add_profile`, `rename_profile`, `remove_profile` → `profiles` | Data layer shipped in #21; the picker UI is still to land. **This replaces what this roadmap previously called "player selection"** — see the contract note below. |
| 5 | Unit toggle (imperial/metric) | 🟡 #18 | client-side | #18 ported only the kiosk's conversion helpers (`utils/units.ts`), and nothing imports them yet. `CurrentShotView` and the Shots list still hardcode mph/yds, and there is no toggle or persisted preference. Remaining: a control, persistence, and routing the displays through the helpers. |
| 6 | Live polish | ⬜ | `shot_processing` | `ShotProcessingState` is typed but no handler consumes it. Capturing/calculating states and a shot-arrival flash are still to do. |

---

## Phase 2 — Sole-interface completeness

**Goal:** a no-touchscreen build is fully operable and diagnosable from the phone.

| # | Feature | Status | Mechanism | Notes |
|---|---|---|---|---|
| 1 | Stop the server gracefully | ✅ #26 | `POST /api/shutdown` | Confirm → pending/success/error. **Corrected:** this stops the OpenFlight **server process** (`_shutdown_process_after_delay` calls `os._exit(0)`). It does **not** power the Pi down, and neither `server.py` nor `start-kiosk.sh` has a poweroff path. Earlier revisions of this roadmap described it as preventing a power-yank on a live Pi, which invites the opposite reading; the UI is worded as stopping OpenFlight for that reason. |
| 2 | Device/Status view | ✅ #26 | `trigger_status`, `power_status`, `get_debug_status` / `debug_status`, `toggle_debug` / `debug_toggled` | Device tab: radar/trigger health, battery when a provider is present, and debug recording. The read-only `radar_config` view has not been started: nothing sends `get_radar_config`, and there is no type for it. |
| 3 | Connection bootstrapping | ⬜ | mDNS discovery and/or AP default | Not started — no discovery code or dependency is present. "Just tap Connect" without reading an IP off a screen you removed. |

**Test story:** shutdown state machine (confirm→pending→success/error) as a component
test; status view across present/absent hardware; discovery logic mockable. Risk: mDNS on
RN can be fiddly (may need a development build, not Expo Go) — ship AP-default first,
treat mDNS as a stretch. Confirm the development-build story against the Expo SDK 57
constraint in `AGENTS.md` before adding native deps.

---

## Phase 3 — Deployment track (ops, parallel — not app code) ⬜

**Goal:** make the headless + AP topology real on the Pi. Independent of the app.

| Work item | Detail |
|---|---|
| Pi access-point setup | `hostapd` + `dnsmasq` setup script alongside `scripts/setup/` in [open-flight/openflight](https://github.com/open-flight/openflight). Fixed AP IP the app defaults to. Optional — a builder opts in. |
| Headless start | A flag/variant of `start-kiosk.sh` (server repo) that runs the server without launching Chromium (the browser step already no-ops without a display; make it intentional + documented). |

**Size: S–M.** Risk: low; fully decoupled from the mobile phases.

---

## Sequencing & dependencies

```
Phase 0 (foundation) ──► Phase 1 (parity) ──► Phase 2 (sole-interface)

Phase 3 (Pi AP + headless) ── independent, any time ──┘
```

Phase 0 gates everything and is complete. Phases 1 and 2 are each internally incremental
(ship item-by-item) and are being worked in parallel. Phase 3 is parallelizable.

## Cross-cutting principles

- **DRY within this app**, but not across the web `ui/` ↔ mobile — the duplicated `Shot` type and
  event names are deliberate; keep them mirrored, not shared.
- **Confirm dialogs** on every destructive action (delete shot / clear session / stop the server).
- **Tests land with each feature**, not after; Phase 0 exists partly to make that possible.
- **Explicit over clever:** a plain socket-service + store, mirroring the web app's
  already-proven shape.

## Server-side contract reference

Checked against `src/openflight/server.py` and `src/openflight/profiles.py`.

Shipped and planned are listed separately. A name under "planned" exists on the server but
has no caller or handler in this app yet, so it states an intention, not the current wiring.

**Client → server, shipped** — all in `services/socket.ts`: `get_session`,
`get_trigger_status`, `get_debug_status` and `get_profiles` on connect; `simulate_shot`,
`set_club`, `toggle_debug`, `set_active_profile`, `add_profile`, `rename_profile` and
`remove_profile` on user action. Plus `POST /api/shutdown`, which is HTTP rather than
socket traffic.

**Client → server, planned:** `delete_shot` (item 1b), `clear_session` (item 2b).

**Server → client, handlers registered:** `session_state`, `shot`, `shot_update`,
`club_changed`, `profiles`, `trigger_status`, `power_status`, `debug_status` and
`debug_toggled` — plus the transport's own `connect` / `disconnect` / `connect_error`.

**Server → client, no handler yet:** `shot_processing` (item 6), `session_cleared`
(item 2b), `delete_shot_error` (item 1b).

`get_radar_config` / `radar_config` are in neither list. Radar-config editing is an explicit
non-goal above, and nothing in the app emits, types or consumes either name.

### Profiles replaced players

**`set_player` and `player_changed` do not exist on the server.** Earlier revisions of this
roadmap listed them for Phase 1 item 4 and in the reference above, so anyone implementing
from the doc would have built against an API that was never there. The server models this
as **profiles**, and every shot carries `profile_id` / `profile_name`.

Behaviour worth knowing before building against it:

- Every mutation is answered with one full `profiles` snapshot — **including a mutation the
  server refuses.** There is no error event and no ack, so a rejected request is
  indistinguishable from an accepted one except by diffing the snapshot that follows.
- `add_profile` also makes the new profile active. A client must not follow it with
  `set_active_profile`.
- `remove_profile` is refused if the profile is active, is the last one, or still has
  session rows.
- The roster is never empty and `active_profile_id` is never empty: the server seeds a
  profile when its file holds none. There is no empty-roster state to design for.
- `MAX_PROFILES` (12) and `MAX_NAME_LENGTH` (40) are both enforced server-side and neither
  is sent on the wire, so a client has to know them. They do **not** fail the same way:
  - **At 12 profiles the add is rejected** — `ProfileStore.add()` returns `None` and no
    profile is created. With only a snapshot in reply, that reads as a silent no-op, so a
    client should disable the control at 12 rather than let the request disappear.
  - **An overlength name is accepted and silently truncated** to its first 40 characters by
    `clean_profile_name`, for `add_profile` and `rename_profile` alike. The mutation
    succeeds; the profile simply comes back renamed. Cap the input at 40 so the server does
    not quietly rewrite what the user typed.
  - A name that is empty or whitespace-only is rejected outright by both calls — a third
    outcome, and again answered with an unchanged snapshot.
- Names are neither unique nor a key — `id` is. A rename preserves the id, which is why
  `shot.profile_name` is a capture-time snapshot and goes stale.
