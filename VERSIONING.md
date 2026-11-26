# Versioning and compatibility

This repository is a library in the SearSuite organization.

## Current status

Versions in `package.json` describe the current source baseline; they do not by themselves indicate an npm release or a support commitment. Packages below 1.0.0 are experimental. Breaking changes may occur before 1.0.0 and must be called out in the changelog when released.

## Release policy

- The initial `0.0.1` package versions are the release baseline. For subsequent releases, contributors add a Changesets file with the affected packages, version bumps, and user-facing summary using `pnpm changeset`. Changesets updates affected manifests, internal dependency ranges, and per-package changelogs with `pnpm changeset:version`.
- A maintainer reviews and commits the version changes, runs `pnpm release:check`, then runs `pnpm release:stage`. This builds and packs every public package, checks the archive contents, and stages unpublished versions on npm in dependency order. `pnpm release:stage:plan` previews the current staged state without uploading. After npm rate limiting or an interrupted run, `pnpm release:stage:resume` safely skips matching staged versions; run the full build command again if source files changed.
- Staged versions are not released. A maintainer reviews them in npm Staged Packages and approves the complete batch with two-factor authentication. Only after all intended versions are live should the maintainer run `pnpm changeset tag` and push the tags. Do not run `changeset publish`, which bypasses this staged approval workflow.
- The root `CHANGELOG.md` records the initial source baseline; Changesets maintains package-specific changelogs for later releases. No release is automatic.
- After 1.0.0, follow SemVer: major for incompatible public API changes, minor for backward-compatible features, patch for backward-compatible fixes. Before 1.0.0, read each changelog entry for compatibility impact.
- A release is supported only while its declared dependency and runtime ranges remain satisfied; maintenance of older releases is handled case by case.

## Compatibility

- Source checkouts in this organization are developed together. For cross-repository integrations, use a set of revisions validated together; a matching package version alone does not imply cross-repository compatibility.
- Node.js 22 or newer is the supported development baseline. Existing narrower or broader per-package `engines` declarations remain authoritative for that package. pnpm workspaces use the `packageManager` version in the root manifest; npm-based workspaces use their documented npm commands.
- Public API compatibility is based on documented package entry points and exported types.
