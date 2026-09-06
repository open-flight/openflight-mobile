# AGENTS.md

This file contains mandatory guidance for coding agents and contributors working
in this repository. It applies to the entire repository unless a more specific
`AGENTS.md` adds rules for a subdirectory.

## Project overview

OpenFlight Mobile is an Expo/React Native companion for the OpenFlight launch
monitor. It connects to the Python server in
[`open-flight/openflight`](https://github.com/open-flight/openflight) over
Socket.IO and is intended to become a complete interface for headless OpenFlight
installations.

The mobile repository is intentionally self-contained. Its TypeScript types
mirror the server's wire contract; it does not import code from the server or
web-UI repositories at build time.

## Toolchain

- Use the Node.js version in `.node-version` and npm as the package manager.
- Use `npm ci` for clean validation and keep `package-lock.json` synchronized
  with `package.json`.
- The project targets Expo SDK 57. Read the
  [versioned Expo SDK 57 documentation](https://docs.expo.dev/versions/v57.0.0/)
  before changing Expo configuration or native dependencies.
- Install Expo and React Native packages with `npx expo install` so their
  versions remain compatible with the pinned SDK.
- Do not upgrade Expo, React, or React Native independently. An SDK upgrade must
  be a dedicated PR that explains the Expo Go/development-build and release
  implications.
- The project uses Expo Continuous Native Generation. Do not commit generated
  `ios/` or `android/` directories unless the repository explicitly changes its
  native-project policy.

## Architecture boundaries

- `app/` owns routes and navigation composition. Route components should remain
  thin.
- `components/` owns reusable presentation and interaction components.
- `services/` owns external I/O. `services/socket.ts` is the single owner of the
  Socket.IO client and server-event registration.
- `stores/` owns application state and state transitions. Components should read
  state through focused selectors.
- `storage/` owns persistence and its failure handling.
- `types.ts` mirrors the supported OpenFlight server payloads.

Do not create Socket.IO clients or register server listeners inside screens or
presentation components. Reconnects must not duplicate handlers, and disconnect
or retry flows must leave state recoverable.

Treat the Python server's emitted payload as the source of truth. When the wire
contract changes, update the mobile types, socket mapping, tests, and relevant
documentation together. Preserve units and nullability. Never fabricate a
measurement merely to make a component easier to render.

## Scope and reviewability

- Keep each change scoped to one feature, fix, build concern, or documentation
  objective.
- Make the smallest coherent diff that completely solves the requested problem.
- Do not mix unrelated formatting, dependency upgrades, generated files,
  renames, or opportunistic refactors into a change.
- Policy files such as `AGENTS.md`, `AI-POLICY.md`, `CONTRIBUTING.md`,
  `CODEOWNERS`, and the PR template belong in dedicated policy/governance PRs;
  do not mix them into product-feature PRs.
- Do not add speculative abstractions, compatibility layers, payload fields,
  screens, or dependencies for hypothetical future work.
- If the required scope expands during implementation, surface the added scope
  instead of silently broadening the PR.

## React Native and mobile behavior

- Support platform differences explicitly. Do not assume behavior observed on
  web or one simulator proves behavior on both native platforms.
- Account for safe areas, keyboard dismissal, touch targets, screen-reader
  labels, text scaling, and loading/error/empty states.
- Use virtualized lists such as `FlatList` for shot or session collections that
  can grow without a small fixed bound.
- Keep destructive operations such as deleting shots, clearing sessions, and
  shutting down a Pi behind an explicit confirmation and observable
  pending/success/error states.
- Store no secrets in `EXPO_PUBLIC_*` variables; those values are part of the
  client bundle.
- Do not solve LAN connectivity with unrestricted transport-security or
  cleartext exceptions. Any native network exception or local-network
  permission must be narrowly scoped, justified, and tested on a release build.

## Testing and validation

- New or changed behavior requires tests. A bug fix requires a regression test
  that fails before the fix and passes afterward.
- Test observable behavior and realistic failure paths. Prefer React Native
  Testing Library interactions over implementation-detail assertions.
- Snapshot, source-text, style-string, and mock-call-only tests do not prove a
  meaningful user flow by themselves.
- Socket and persistence changes must cover reconnects, cleanup, duplicate
  events, malformed or partial payloads when realistic, and unavailable storage.
- Stateful UI changes require component tests for the user interaction and
  resulting state, including retry/cancel/confirmation behavior where present.
- Do not weaken assertions or remove coverage merely to make an implementation
  pass.
- State exactly which simulator or physical devices and operating systems were
  tested. Expo Go, a simulator, a development build, and a release build are
  different forms of evidence; identify the one actually used.
- Never claim a command or manual check passed unless it was actually performed.
  Report skipped checks and why.

Run the checks relevant to the change before handoff:

```bash
npm ci
npx expo-doctor
npx tsc --noEmit
npm test -- --ci --runInBand
npx expo export --platform all
```

## Pull-request standards

- Follow `.github/pull_request_template.md` and `CONTRIBUTING.md`.
- Use a conventional PR title:
  `<type>(optional scope): <description>`.
- Preserve valid OpenFlight behavior when the phone disconnects, reconnects, or
  receives optional/partial measurements.
- Required checks must pass on the latest head commit. Older successful runs do
  not validate newer code.
- Review findings are classified by production likelihood and impact:
  - **P1 — blocking:** breaks a common supported workflow, violates an
    architectural or fallback invariant, creates material security/data-loss
    risk, or contains substantive AI slop such as invented APIs, fake tests,
    unsafe broad fallbacks, or large unrelated/generated scope.
  - **P2 — should fix:** very likely in normal or reasonably expected use, with
    meaningful user or operational impact.
  - **P3 and lower — non-blocking:** low-probability edge cases and polish that
    should not repeatedly move the merge bar.

## AI-assisted contributions

All contributors must follow `AI-POLICY.md`. AI assistance neither disqualifies
a contribution nor lowers its review bar. The contributor remains responsible
for every submitted line and must disclose substantive assistance.

Reject or request revision for generated-looking work that contains scope
inflation, invented APIs or payloads, duplicate helpers, speculative layers,
dead code, swallowed exceptions, fake cancellation, misleading tests, verbose
comments that restate code, or claims not grounded in this repository or
authoritative documentation.

## GitHub communication

- Write PR descriptions, comments, and reviews for humans. Lead with the point
  needed to make a decision.
- Keep claims specific and distinguish observed behavior from assumptions.
- Do not post comments, submit reviews, change labels, close PRs, or merge code
  unless the user explicitly requests that external action.
