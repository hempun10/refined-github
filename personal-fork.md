# Personal Refined GitHub fork

This fork adds five independent page features, extends PR shortcuts, and adds a settings sidebar to upstream Refined GitHub. It keeps the upstream build, feature manager, and settings storage. These page features and shortcuts do not read a personal access token or call the GitHub API. The settings sidebar uses the additional `sidePanel` permission and reuses upstream token management.

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

In Helium and other browsers with the Chromium side-panel API, click the Refined GitHub toolbar icon to open settings beside your page instead of opening GitHub. The browser controls which side hosts the panel. Features opens first; search for a feature ID and tick its checkbox. Changes save automatically. Reload GitHub to apply them. The added options default to enabled except `dashboard-infinite-scroll`, which defaults to disabled.

The sidebar also has Personal token, Toggle all features, and Open full settings controls. Token fields stay masked, including while focused, unless you explicitly choose Show token. The existing token storage and GitHub validation stay unchanged. Disabling all configurable features does not disable CSS-only refinements; use the browser's Extensions page to turn off the whole extension. Browsers without side-panel support keep the upstream toolbar behavior and full Options page. If opening a supported sidebar fails, the toolbar opens full settings instead.

| Option | Behavior | Limits |
| --- | --- | --- |
| `image-lightbox` | Opens an eligible linked image in rendered Markdown in a native modal dialog. Escape, Close, and clicking outside dismiss it. The original image link remains available. | The link must point to the displayed image or its canonical source. Images smaller than 96 by 64 displayed pixels, avatar/emoji/icon classes, interactive controls, and links to unrelated destinations keep their normal behavior. Ctrl/Cmd-click and other modified clicks keep their normal behavior. A file-view link is not treated as an image URL. |
| `pdf-preview` | Opens linked PDF attachments in descriptions, comments, and READMEs in a modal. Adds a Preview eye button beside PDF file links in repository lists, file views, and PR diff headers with native file links. | Requires the browser's built-in PDF viewer. Only GitHub attachment/file URLs and raw.githubusercontent.com PDFs qualify. Files larger than 50 MB are rejected before buffering beyond that limit. The original link stays available. It does not send documents to an external viewer service. |
| `pr-file-preview` | Adds an eye button to each file header in a PR’s Files changed tab. It opens the whole file, at the PR’s revision, in a modal with line numbers and syntax colors that use GitHub’s own light/dark palette. | Uses the file’s GitHub `/raw/` link with your existing session; no token or extra permission. Text files up to 1 MB only; binary and larger files show a message and an Open file link. PDFs keep the `pdf-preview` eye. Ctrl/Cmd/Shift-click opens the file normally. The bundled highlight.js loads only on the first preview; files over 200 KB or with unknown extensions stay plain. Only GitHub’s classic Files changed view is supported. |
| `copy-pr-url` | Adds "Copy PR URL" to React and legacy PR headers. Copies the PR's main URL without a tab suffix, query, or fragment. Announces success or failure. | Skips a header with a visible native copy-link action. Clipboard access can fail because of browser settings. |
| `pr-bulk-actions` | Adds selection checkboxes to repository and global PR lists. A floating toolbar appears when rows are selected. It can copy URLs, open selected PRs in background tabs, or clear selection. | Reuses native input checkboxes. Leaves non-input native selection controls alone. It never merges, closes, labels, or edits a PR. The existing "Open all" action respects this selection. Opening 10 or more tabs asks for confirmation through the upstream tab helper. |
| `dashboard-infinite-scroll` | When enabled, loads the home activity feed at `/dashboard` and `/` by triggering GitHub's native "More" control near the viewport. On global `/issues` and `/pulls` dashboards, it follows next-page links, preserves filters and sorting, deduplicates results, and cancels work on navigation. | The home feed needs its native "More" control; GitHub keeps its cards, loading state, and manual fallback. Issue/PR dashboards need the current React list markup and a next-page link. Added issue/PR rows contain titles, links, and text metadata, not copied React controls or live status widgets. Failed issue/PR requests offer Retry. Repository lists, empty results, and single-page dashboards keep native behavior. |

The existing `pull-request-hotkeys` option adds two key sequences. Press `g`, then `f` to open Files changed. Press `g`, then `l` on the Conversation tab to scroll to and focus the merge-information region. It does not click Merge, Ready for review, or any other action. Existing numbered and adjacent-tab shortcuts remain available; typing in an editor keeps its normal behavior.

PDF previews open an extension-owned frame that validates the selected GitHub file URL, fetches it using the current GitHub session, and checks its signature and size before opening the browser's PDF viewer. Before the first preview, choose Allow PDF file access to request optional access to `objects.githubusercontent.com` and `raw.githubusercontent.com`. This grant is reused for later previews and can be removed in the browser's extension settings. Denying it leaves the original-file link available. The feature does not fetch arbitrary URLs or read tokens. This avoids GitHub's restrictions on direct PDF frames. Closing the modal or navigating away cancels loading and releases the preview. Native PDF controls remain available. Escape closes the modal while focus is outside the embedded PDF. When the PDF viewer has focus, use Close; its key events do not reach the parent dialog. Ctrl/Cmd/Shift-click preserves the original link action. A browser configured not to preview PDFs keeps its original links.

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

Resolve conflicts in feature imports, README metadata, generated feature snapshots, or option defaults before continuing. Review snapshot changes rather than accepting unrelated changes. Test the added options and PR shortcuts on GitHub with the rebuilt extension, then commit any merge fixes and push:

```sh
git push origin feat/personal-github-enhancements
```

Reload the unpacked extension and existing GitHub tabs. Keep `dashboard-infinite-scroll` off unless you want to test it against GitHub's current markup.

## Changed code

Each feature has its own `source/features/<id>.tsx` registration. The image preview, bulk toolbar, and infinite-scroll rows have matching CSS files imported by those features. `source/helpers/dashboard-pagination.ts` validates pagination links and extracts text-only results.

`source/refined-github.ts` imports the five added page features. `source/options-storage.ts` sets the infinite-scroll default. `source/features/open-all-conversations.tsx` recognizes the custom PR selection. `readme.md` and the generated JSON files under `build/__snapshots__` provide the feature descriptions and options metadata. Focused tests are under `source/helpers`.

`source/features/pull-request-hotkeys.tsx` adds the PR key sequences. PDF URL validation, bounded fetching, and byte validation live in `source/helpers/pdf-preview.ts`. The modal sends a validated GitHub file URL to `source/pdf-preview.html` and `source/pdf-preview.ts`, a separate build entry that handles optional file-host access, fetching, and the browser-native viewer. `source/content-script.ts` skips GitHub's file hosts so those grants do not initialize GitHub page features on binary-file pages. The Safari packaging script keeps these two explicit optional hosts while removing the wildcard Enterprise grant.

`source/helpers/toolbar-action.ts` opens the native sidebar and handles its full-settings fallback. `source/manifest.json` registers the existing options page as the panel and adds the `sidePanel` permission. Sidebar layout and controls reuse `source/options/options.svelte` and `source/options.css`. `source/options/token-input.svelte` masks tokens until the user chooses Show token.

## Verification

The fork was tested on real github.com in Helium with an unpacked build and an isolated logged-in profile. The screenshots linked in the README come from those runs. No browser profile or verification screenshot is committed to this repository.

The final checks passed: `npm run format`, `npm run format:check`, `npm run lint`, `npm run vitest`, and `npm run build`. The test suite also covers home-feed loading, replacement controls, disabled controls, manual fallback, and navigation cleanup. The build reported no TypeScript or Svelte errors.

The Helium runs exercised image opening and dismissal, keyboard and modified-click behavior, clipboard contents on PR conversation/files pages, navigation without duplicate controls, PR selection and clearing, two actual background tabs, and loading real issue/PR dashboard pages. An offline issue/PR request failed with a Retry action and loaded successfully after the connection returned. A separate run on `https://github.com/dashboard` verified automatic feed growth through two batches, one automatic request per native More control, manual retry after an offline failure, and no automatic loading when the option was disabled. The dashboard option was disabled again after testing.

A separate sidebar run exercised the built toolbar handler from a trusted click and opened the native right panel beside the real GitHub dashboard. The 360-pixel-wide panel had no horizontal overflow in light or dark mode. A feature toggle persisted after reloading the panel; enabling infinite scroll there grew the real feed from 7 to 30 cards after scrolling. Token masking, explicit Show/Hide, bulk feature toggles, settings restoration, and the full-settings link passed. macOS accessibility access was unavailable, so the physical browser-toolbar icon click was not automated.

Unit tests cover toolbar routing and the full-settings fallback, image eligibility and cleanup, canonical clipboard URLs and failures, copy-action deduplication, custom/native checkbox behavior, dynamic row selection, pagination URL validation, text-only extraction, request serialization, deduplication, retry, end-of-results handling, and navigation cancellation. A regression test uses the real selector observer to check retained DOM nodes across navigation. These tests supplement browser checks; they do not replace them.

Chrome, Edge, Firefox, Safari, GitHub Enterprise, and every GitHub theme or feature-flagged layout have not been independently verified. GitHub DOM changes can require selector updates. The upstream extension has its own token-using features; the added page features do not change their token access. PDF previews request the two optional file hosts only after an explicit Allow click, using the existing optional-host declaration.
