## What does this PR do?

<!-- Keep this PR scoped to one feature, fix, build concern, or documentation objective. -->

## Why was this required?

<!-- Describe the problem or need and the impact of leaving it unchanged. -->

## Automated tests

<!-- List tests added or updated, what behavior they prove, and commands run. -->

## Manual (human) testing

<!--
Describe what you personally tested. Include:
- iOS, Android, or web
- physical device or simulator/emulator and OS version
- Expo Go, development build, or release build
- steps performed and observed result

"Tests pass" is not manual testing.
-->

## Server/API contract impact

<!--
List any Socket.IO events, HTTP endpoints, payload fields, units, or nullability
affected. Write "None" when the server contract is unchanged.
-->

## AI assistance

<!--
State "None" or identify the tool's substantive role and what you personally
reviewed, changed, and validated.
-->

## Checklist

- [ ] This PR has one coherent objective and contains no unrelated changes
- [ ] New or changed behavior has automated tests, or I explained why none apply
- [ ] I documented manual human testing with the actual platform/build used
- [ ] I documented any OpenFlight server contract impact
- [ ] I disclosed substantive AI assistance and personally reviewed every change
- [ ] `npm ci` succeeds
- [ ] `npx expo-doctor` passes
- [ ] `npx tsc --noEmit` passes
- [ ] `npm test -- --ci --runInBand` passes
- [ ] `npx expo export --platform all` succeeds when application code changed
- [ ] Documentation was updated where required
- [ ] No policy documents are mixed into a product-feature PR
- [ ] No unrelated generated files, formatting, or dependency updates are included
