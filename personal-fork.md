# Personal Refined GitHub fork

This fork adds four independent page features and a settings sidebar to upstream Refined GitHub. It keeps the upstream build, feature manager, and settings storage. The four page features do not read a personal access token or call the GitHub API. The settings sidebar uses the additional `sidePanel` permission and reuses upstream token management.

## Install an unpacked build

Use Node.js 24 or newer and npm. Build from the feature branch:

```sh
git clone --branch feat/personal-github-enhancements https://github.com/hempun10/refined-github.git
cd refined-github
npm ci
npm run build
```

In Helium, Chrome, or Edge:

1. Open the browser's Extensions management page.
2. Turn on Developer mode.
3. Choose "Load unpacked" and select this checkout's `distribution` directory, not `source`.
4. Disable another installed Refined GitHub copy to avoid loading two copies.
5. Reload GitHub tabs that were already open.

After rebuilding, click Reload on the extension's card and reload GitHub tabs. Keep the checkout in place, because the browser loads its unpacked files from that directory. The store release does not contain these fork-only features.

The build checks TypeScript and Svelte and creates the extension bundle. The installation can report upstream dependency vulnerabilities. This fork does not upgrade unrelated dependencies.

## Options and behavior

In Helium and other browsers with the Chromium side-panel API, click the Refined GitHub toolbar icon to open settings beside your page instead of opening GitHub. The browser controls which side hosts the panel. Features opens first; search for a feature ID and tick its checkbox. Changes save automatically. Reload GitHub to apply them. The first three options default to enabled. `dashboard-infinite-scroll` defaults to disabled.

The sidebar also has Personal token, Toggle all features, and Open full settings controls. Token fields stay masked, including while focused, unless you explicitly choose Show token. The existing token storage and GitHub validation stay unchanged. Disabling all configurable features does not disable CSS-only refinements; use the browser's Extensions page to turn off the whole extension. Browsers without side-panel support keep the upstream toolbar behavior and full Options page. If opening a supported sidebar fails, the toolbar opens full settings instead.

| Option | Behavior | Limits |
| --- | --- | --- |
| `image-lightbox` | Opens an eligible linked image in rendered Markdown in a native modal dialog. Escape, Close, and clicking outside dismiss it. The original image link remains available. | The link must point to the displayed image or its canonical source. Images smaller than 96 by 64 displayed pixels, avatar/emoji/icon classes, interactive controls, and links to unrelated destinations keep their normal behavior. Ctrl/Cmd-click and other modified clicks keep their normal behavior. A file-view link is not treated as an image URL. |
| `copy-pr-url` | Adds "Copy PR URL" to React and legacy PR headers. Copies the PR's main URL without a tab suffix, query, or fragment. Announces success or failure. | Skips a header with a visible native copy-link action. Clipboard access can fail because of browser settings. |
| `pr-bulk-actions` | Adds selection checkboxes to repository and global PR lists. A floating toolbar appears when rows are selected. It can copy URLs, open selected PRs in background tabs, or clear selection. | Reuses native input checkboxes. Leaves non-input native selection controls alone. It never merges, closes, labels, or edits a PR. The existing "Open all" action respects this selection. Opening 10 or more tabs asks for confirmation through the upstream tab helper. |
| `dashboard-infinite-scroll` | When enabled, loads the home activity feed at `/dashboard` and `/` by triggering GitHub's native "More" control near the viewport. On global `/issues` and `/pulls` dashboards, it follows next-page links, preserves filters and sorting, deduplicates results, and cancels work on navigation. | The home feed needs its native "More" control; GitHub keeps its cards, loading state, and manual fallback. Issue/PR dashboards need the current React list markup and a next-page link. Added issue/PR rows contain titles, links, and text metadata, not copied React controls or live status widgets. Failed issue/PR requests offer Retry. Repository lists, empty results, and single-page dashboards keep native behavior. |

The home-feed observer activates each native "More" control at most once and observes its replacement after GitHub loads the next batch. It does not hide the control or start its own feed requests. If loading fails, use GitHub's manual control rather than an automatic retry loop.

Issue/PR infinite scroll uses the current GitHub session to fetch HTML from the same origin. It rejects different paths/origins and redirects. It does not save responses or credentials. Query results can change between requests, so deduplication can omit an item that moves between pages. Reload or use native pagination for a fresh list.

The options use the upstream synchronization behavior. An explicit setting can carry across installations; a fresh installation starts with infinite scroll off.

## Update from upstream

Commit or stash local work before merging. Add the upstream remote once:

```sh
git remote add upstream https://github.com/refined-github/refined-github.git
```

Then update the custom branch without rewriting its history:

```sh
git switch feat/personal-github-enhancements
git pull --ff-only origin feat/personal-github-enhancements
git fetch upstream
git merge upstream/main
npm ci
npm run vitest -- build/readme-parser.test.ts --update
npm run format:check
npm run lint
npm run vitest
npm run build
```

Resolve conflicts in feature imports, README metadata, generated feature snapshots, or option defaults before continuing. Review snapshot changes rather than accepting unrelated changes. Test the four options on GitHub with the rebuilt extension, then commit any merge fixes and push:

```sh
git push origin feat/personal-github-enhancements
```

Reload the unpacked extension and existing GitHub tabs. Keep `dashboard-infinite-scroll` off unless you want to test it against GitHub's current markup.

## Changed code

Each feature has its own `source/features/<id>.tsx` registration. The image preview, bulk toolbar, and infinite-scroll rows have matching CSS files imported by those features. `source/helpers/dashboard-pagination.ts` validates pagination links and extracts text-only results.

`source/refined-github.ts` imports the four features. `source/options-storage.ts` sets the infinite-scroll default. `source/features/open-all-conversations.tsx` recognizes the custom PR selection. `readme.md` and the generated JSON files under `build/__snapshots__` provide the feature descriptions and options metadata. Focused tests are under `source/helpers`.

`source/helpers/toolbar-action.ts` opens the native sidebar and handles its full-settings fallback. `source/manifest.json` registers the existing options page as the panel and adds the `sidePanel` permission. Sidebar layout and controls reuse `source/options/options.svelte` and `source/options.css`. `source/options/token-input.svelte` masks tokens until the user chooses Show token.

## Verification

The fork was tested on real github.com in Helium with an unpacked build and an isolated logged-in profile. The screenshots linked in the README come from those runs. No browser profile or verification screenshot is committed to this repository.

The final checks passed: `npm run format`, `npm run format:check`, `npm run lint`, `npm run vitest`, and `npm run build`. The test suite also covers home-feed loading, replacement controls, disabled controls, manual fallback, and navigation cleanup. The build reported no TypeScript or Svelte errors.

The Helium runs exercised image opening and dismissal, keyboard and modified-click behavior, clipboard contents on PR conversation/files pages, navigation without duplicate controls, PR selection and clearing, two actual background tabs, and loading real issue/PR dashboard pages. An offline issue/PR request failed with a Retry action and loaded successfully after the connection returned. A separate run on `https://github.com/dashboard` verified automatic feed growth through two batches, one automatic request per native More control, manual retry after an offline failure, and no automatic loading when the option was disabled. The dashboard option was disabled again after testing.

A separate sidebar run exercised the built toolbar handler from a trusted click and opened the native right panel beside the real GitHub dashboard. The 360-pixel-wide panel had no horizontal overflow in light or dark mode. A feature toggle persisted after reloading the panel; enabling infinite scroll there grew the real feed from 7 to 30 cards after scrolling. Token masking, explicit Show/Hide, bulk feature toggles, settings restoration, and the full-settings link passed. macOS accessibility access was unavailable, so the physical browser-toolbar icon click was not automated.

Unit tests cover toolbar routing and the full-settings fallback, image eligibility and cleanup, canonical clipboard URLs and failures, copy-action deduplication, custom/native checkbox behavior, dynamic row selection, pagination URL validation, text-only extraction, request serialization, deduplication, retry, end-of-results handling, and navigation cancellation. A regression test uses the real selector observer to check retained DOM nodes across navigation. These tests supplement browser checks; they do not replace them.

Chrome, Edge, Firefox, Safari, GitHub Enterprise, and every GitHub theme or feature-flagged layout have not been independently verified. GitHub DOM changes can require selector updates. The upstream extension has its own token-using features; the four additions do not change them or their permissions.
