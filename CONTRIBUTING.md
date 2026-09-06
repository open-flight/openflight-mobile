# Contributing to OpenFlight Mobile

Thank you for contributing to the OpenFlight mobile companion app.

## Development setup

Requirements:

- Node.js version from `.node-version`
- npm
- an Expo SDK 54-compatible Expo Go, simulator, or development build
- a reachable OpenFlight server for end-to-end connection testing

Install dependencies from the committed lockfile:

```bash
npm ci
```

Start Metro:

```bash
npm start
```

See `README.md` for Expo Go, simulator, and OpenFlight server instructions.

## Architecture

Keep changes within the boundaries documented in `AGENTS.md`:

- routes and navigation in `app/`;
- reusable UI in `components/`;
- external I/O in `services/`;
- application state in `stores/`;
- persistence in `storage/`; and
- the mirrored server contract in `types.ts`.

The mobile app and Python server are separate repositories. Do not add a
build-time dependency on the server or web UI. When changing the wire contract,
coordinate the server and mobile changes explicitly and test compatible
versions.

## Pull-request requirements

Every PR must:

1. Address one coherent feature, fix, build concern, or documentation objective.
2. Explain why the change is required.
3. Include automated tests for changed behavior, or explain why tests genuinely
   do not apply.
4. Describe manual testing performed by a human, including the platform, device
   or simulator, build type, steps, and observed result.
5. Disclose substantive AI assistance and the contributor's personal review and
   validation.
6. Avoid unrelated formatting, policy changes, dependency churn, or generated
   artifacts.

Policy and governance documents must be changed in a dedicated PR rather than
mixed into a product feature.

Use a conventional PR title:

```text
<type>(optional scope): <description>
```

Allowed types are `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `perf`,
`build`, `ci`, `style`, and `revert`.

## Tests and validation

Run the checks relevant to the change:

```bash
npm ci
npx expo-doctor
npx tsc --noEmit
npm test -- --ci --runInBand
npx expo export --platform all
```

For UI changes, add React Native Testing Library coverage that performs the
interaction and verifies the resulting user-visible state. A snapshot alone is
not sufficient.

Manual testing should identify what was actually used, for example:

- iPhone model, iOS version, and Expo Go/development/release build;
- Android model or emulator, OS/API level, and build type; or
- web only, when the change is genuinely web-specific.

Changes to navigation, persistence, networking, permissions, or native modules
normally require validation on both iOS and Android before release, even when a
focused PR is initially exercised on only one platform.

## Dependencies

Use `npx expo install` for Expo and React Native packages. Commit both
`package.json` and `package-lock.json`. Keep dependency-only work in a separate
PR and do not combine an Expo SDK upgrade with a product feature.

## AI-assisted work

Read and follow `AI-POLICY.md`. Contributors are responsible for understanding
and validating every submitted line regardless of which tools helped produce
it.

## License

Contributions are licensed under the repository license identified in
`LICENSE`. Any change to that license or any app-store distribution exception
must be handled as a separate governance decision.
