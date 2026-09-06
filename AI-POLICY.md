# OpenFlight Mobile Generative AI Policy

OpenFlight Mobile accepts thoughtful contributions made with or without
generative AI. This policy applies to code, documentation, issues, pull
requests, reviews, and other project communication created with large language
models, code assistants, or similar tools ("AI tools").

## Guiding principle

**AI assistance does not transfer responsibility.**

The person submitting a contribution is accountable for its correctness,
security, licensing, scope, and clarity. AI-generated work must meet the same
standards as any other contribution. A contributor must understand the entire
change, personally review it, and be able to explain and defend it during
review.

## Acceptable use

AI tools may be used to:

- learn how an existing part of the project works;
- brainstorm focused implementation approaches;
- complete small routines or repetitive boilerplate;
- draft tests that the contributor reviews, strengthens, and runs;
- refactor or reformat content within the requested scope; and
- proofread or analyze a contributor's own work.

These uses are acceptable only when the contributor:

- remains involved from investigation through validation;
- reviews every changed line and removes speculative or unnecessary output;
- verifies assumptions against this repository, the OpenFlight server, or
  authoritative platform documentation;
- runs appropriate automated and manual tests and reports the results honestly;
- keeps the contribution to one coherent objective;
- follows `AGENTS.md`, `CONTRIBUTING.md`, and licensing and security
  requirements; and
- discloses substantive AI assistance as described below.

## Unacceptable use

Do not use AI tools to:

- submit code or documentation that has not been carefully reviewed and edited
  by the contributor;
- generate broad rewrites, speculative features, unrelated cleanup, or changes
  beyond the stated task;
- invent Socket.IO events, payload fields, Expo APIs, platform behavior, test
  results, or manual-device observations;
- rely on generated output as the sole basis for architectural or security
  decisions;
- claim tests, builds, benchmarks, or manual verification that were not
  performed;
- submit a change the contributor cannot explain and justify;
- flood issues, PRs, reviews, or discussions with generated reports or
  repetitive comments;
- reproduce third-party work without compatible licensing and attribution; or
- send credentials, tokens, private sessions, device identifiers, or other
  non-public information to an AI service that is not approved to receive it.

## Transparency

Disclose substantive AI assistance in the pull request. A concise disclosure
should identify the tool's role and the human review and validation performed.
For example: "AI assistance drafted the test scaffolding; I revised every case
and ran the complete test suite."

Disclosure is not required for spelling corrections, search, or small
autocomplete suggestions that did not materially shape the contribution.

## Licensing

By contributing, you represent that you have the right to submit the work under
the repository license identified in `LICENSE`. AI tools may produce material
derived from unidentified sources. If you cannot establish that generated
material can be contributed under the project's license, do not submit it.

This policy does not change the repository license or add an exception for app
store distribution. Any such decision must be reviewed and recorded separately.

## Review and enforcement

Maintainers may ask for a contribution to be reduced, rewritten, tested, or
explained by the contributor. Unreviewed, undisclosed, misleading, or
low-quality AI-assisted submissions may be closed or rejected. Repeated
low-quality or automated submissions may result in contribution restrictions.

This policy is adapted from the OpenFlight server repository's generative AI
policy.
