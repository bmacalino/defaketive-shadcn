# DeFaketive (shadcn version)

A second face for DeFaketive, built with [shadcn-svelte](https://shadcn-svelte.com) (SvelteKit, Tailwind v4,
Lucide icons, the plain **neutral** look). The original app in `../Capstone-Version-Control-Version-1.1` is
not touched.

This app only draws the screens. Everything real still happens in the original Flask app: accounts, guest
scan limits, live scans, the review checker, and the exact wording of every verdict. The new app asks it
for data through `/api`, so both always agree.

## How it is connected

```
browser  ->  Vite (localhost:5173)  --/api-->  server.py (127.0.0.1:5000)  ->  defaketive.db
                                                 = the original Flask app          instance/accounts.db
                                                 + a few read-only routes
```

- **Backend.** In development Vite passes every `/api` call straight to port 5000 (`vite.config.ts`).
- **Databases.** Nothing here has a database of its own. The original app keeps using the same two SQLite files,
  so an account made in either version works in both:
  - `defaketive.db` in the original folder: analyzed products and their reviews.
  - `instance/accounts.db` in the original folder: accounts, scan history, wishlists, guest scan counts.
- **`server.py`.** The original only lists and opens products from the visitor's own session, so a product that is
  only in `defaketive.db` (for example one somebody else scanned) could not be browsed or opened. `server.py` imports
  the original app (it is not edited) and adds two read-only routes that read the same database:
  `GET /api/saved/products` (every analyzed listing, as cards), `GET /api/saved/detail?link=` (one product with
  all its reviews and its similar products) and `GET /api/saved/popular` (products saved by two or more accounts). The Products page, Ctrl+K search, name and link lookups on Analyze and wishlist suggestions
  all use them.
- **Who sees what.** There are two kinds of data, kept apart on purpose:

  | | Where it lives | Who sees it |
  | --- | --- | --- |
  | **The shared pool**: every product anyone has analyzed, with its reviews | `products` and `reviews` tables in `defaketive.db` | Everyone. The Products page, search, and the "similar products" suggestions are all picked from it. |
  | **A person's own library**: what they scanned, opened or saved | `user_activity` and `user_wishlist` in `accounts.db`, one set of rows per account (a guest's stays in their browser) | Only that person. Home, History and Wishlist show nothing else. |

  A product enters someone's library only when they scan it, open its report or save it. A finished scan is written
  to the shared pool (so it can be recommended to others) and to the library of whoever ran it. Signing out clears
  that account's history, wishlist and last-scan card from the screen, so the next person on the same browser starts
  empty. (The original app mixes this browser's session catalog into every history; this version does not.)
- **Without `server.py`** (the plain original app on port 5000) everything still works from the session catalog;
  Products just lists fewer products and a database-only report says it could not be opened.
- **One listing, one entry.** Shopee and Lazada links are matched by host and path. Temu gives every product the same
  path (`/goods.html`), so its `goods_id` is part of the match. (The original's own matching ignores it, which makes
  every Temu listing look like the same product.)

## Run it

1. In this folder run `npm install` (first time only), then `npm run dev`.
2. In another window start the server: `..\Capstone-Version-Control-Version-1.1\.venv\Scripts\python.exe server.py`
3. Open <http://localhost:5173>.

`start.cmd` does all of that for you.

If the server runs somewhere else, set `DEFAKETIVE_API` first, for example
`set DEFAKETIVE_API=http://127.0.0.1:8000`. If the original app lives somewhere else, set `DEFAKETIVE_ORIGINAL`
to its folder.

## Screens

| Address | Screen |
| --- | --- |
| `/` | Landing page, with a scan box, FAQ and team |
| `/scan` | **Guest screen**: check one product link without an account, with its own progress view |
| `/scan/report?link=…` | The same report as the app's, on the guest screen (no menu, no account features) |
| `/app/home` | Home, a dashboard: link box, latest scan, your numbers, **what needs a look** beside the overview, then recently checked |
| `/app/analyze` | "Check a product": paste a link or search by name, start a live scan |
| `/app/products` | Every product anyone has checked, with filters |
| `/app/report?link=…` | One product's report: verdict, checks, quotes, every review |
| `/app/history` | Scan history, grouped by day |
| `/app/wishlist` | Saved products, picks with no warning signs, most saved |
| `/app/settings` | Account, scan alerts, dark mode, clipboard fill, clear history, delete account |
| `/app/about`, `/app/faq` | About the project, questions, how verdicts work |

Sign-in and sign-up are pop-ups that open from anywhere.

**Guests and the main app.** A guest who pastes a link on the landing page, presses "Try it free" or chooses
"Continue as guest" goes to the guest screen (`/scan`), not into the main app. The scan runs there and the report opens
there. One shortcut: a link that was already checked opens its guest report straight from the landing page, with no
second press and no free scan used (a new link still stops on the guest screen, which asks first). Creating an account
from the guest report opens the same report in the app, and the guest's scans move into the
new account. A signed-in person who opens `/scan` is sent to the app. The public header (How it works, FAQ, About) and
the public footer only link to sections of the landing page and to the guest screen.

**The app is for signed-in people only.** Every `/app/...` page is locked (`src/routes/app/+layout.svelte`): nothing of
the app is drawn until the server says who is there, and a guest who types an app address, or follows an old link, is
sent to the public screen that does the same job (`guestDestination` in `src/lib/nav.ts`):

| A guest asks for | They get |
| --- | --- |
| `/app/report?link=…` | the same report on the guest screen |
| `/app/analyze` | the guest screen, with the link kept if there was one |
| `/app/about`, `/app/faq` | that section of the landing page |
| anything else (Home, Products, History, Wishlist, Settings) | the landing page with the sign-in pop-up; after signing in they land on the page they asked for |

Signing out or deleting the account goes to the landing page without that pop-up. For a guest, Ctrl+K lists only the
public pages and "/" jumps to the guest scan box. This lock is in the browser; what protects the data is still the
server, which only ever returns an account's history and wishlist to that account. The shared pool routes
(`/api/saved/...`) are open on purpose: they hold no personal data, and the guest screen needs them to recognise a
product that was already checked and to show its report.

## Wording rules (kept from the original)

- The server words every verdict and label. This app never writes its own verdict.
- A verdict says what reviewers **report**. It never says a product is safe or unsafe, and there is no score.
- **Three words, one meaning each.** You **check** a product (every button, menu item and page title says "Check").
  A **scan** is the work a check starts when the product is new: it collects fresh reviews, it is what runs, and it is
  what is counted ("3 free scans"). What you get is a **report**. The app does not say "analyze" for what a person
  does. (The original app's own progress messages and its "Not analyzed yet" headline still do; they are shown as sent.)
- **Four groups, one name each**, used everywhere a group is named: chips on cards, filters, numbers, charts and the
  legend. The names live in one place, `GROUP_NAMES` in `src/lib/product.ts`. The sentence under a chip (the verdict
  headline, such as "No warning signs found") is the server's and says why.
- Colour is never the only signal: every verdict chip also has an icon (a different shape for each group) and a word.
- The interface is plain black and white on purpose, so colour always means something. Four colours, used the same way
  in chips, banners, charts and dots:

  | Group | Colour | Icon | When |
  | --- | --- | --- | --- |
  | Safety reports | red | triangle with !  | The checker's serious level only: serious or repeated reports of fire, smoke, shocks or overheating |
  | Caution | orange | circle with !  | Fakes or defects reported more than usual, a milder safety verdict, **or any other safety mention, even one** |
  | No warnings | teal | tick in a circle | Enough reviews, no safety mention, nothing else at a warning level |
  | No verdict yet | grey | circle with ? | Too few reviews, reviews that may not be trustworthy, or not analyzed yet |

  The colour follows the level the checker decided (`chipFor` in `src/lib/product.ts`). Red is never used for a single
  or mild safety mention: that product is orange, its "Safety problem · 1" count is orange, and the report says in one
  line why it is shown as Caution. A safety mention is never hidden either: it always lifts a product out of
  "No warnings" and "No verdict yet". The words the check matched are highlighted in amber, not red. (The original app
  still shows any safety mention in red; the two versions differ here on purpose.)

  "No warnings" is teal, not bright green, so it never reads as an approval stamp. Words on a coloured tint are always
  the normal text colour (17:1), so nothing is brown or hard to read; the colour sits in the icon, the border, the tint
  and the charts. The colours are defined once, in `src/routes/layout.css` (`--destructive`, `--warning`, `--success`,
  `--unknown` and their `-soft` tints, plus the `.tone-*` classes). To change one, edit the token and run
  `npm run check:colors`: it tests contrast (3:1 or better for the strong colour, 7:1 for text on a tint) and that the
  four stay clearly apart for protan, deutan and tritan colour blindness.

## The report

One component draws it for the app and for the guest screen (`src/lib/components/report/report-view.svelte`).

1. **The verdict**, biggest thing on the page. If a product is orange only because one review mentions a safety
   concern, a one-line note right under the verdict says so.
2. **One next step** under it, chosen by the verdict: read the flagged reviews (and see similar products with no
   warnings, when there are any) for Caution and Safety reports; read the flagged, negative or all reviews for
   No warnings; read the flagged reviews, or the reviews we have, for No verdict yet. "What do these labels mean?"
   jumps to the legend.
3. **First tab:** the reviewers' own words first ("What reviewers reported", one block per kind of problem), then the
   sentiment and the short summary, and last the legend of the four groups.
4. The tabs are **Summary**, **Reviews** (every review, with filters) and **Similar products** (the count shows only
   when there are some).

Small wording rules on a report: sentiment is "Positive", "Negative" or "Mixed or unclear"; a label that is counted
but does not affect the verdict says "Doesn't change the verdict"; the button that leaves for the listing names where
it goes ("View on Lazada"); the line about the sample is a sentence ("We read 15 of this listing's 4,048 reviews.");
and when extra low-star reviews were read on purpose, the percentages are called "adjusted", with one sentence saying
why. The report date comes from when the report was last saved (`server.py` passes it along).

## When something fails

A failed load never looks like an empty list.

- **The server cannot be reached:** a grey banner at the top of every page says so and offers **Try again**
  (`components/app/offline-banner.svelte`). Nobody is sent to the sign-in pop-up because of it: not knowing who is
  here is not the same as being a guest (`auth.unreachable`).
- **Your history or wishlist did not load:** Home, History and Wishlist say "couldn't be loaded" with **Try again**
  (`library.error`).
- **The product list did not load:** Products says so, with **Try again** (`catalog.error`).
- **A report did not load:** "This report couldn't be loaded" with **Try again**. A report that simply does not exist
  says "We don't have a report for this product yet" and offers **Check this product**, with the link carried over.

`src/lib/boot.ts` is the start-up load. The first page load runs it once, and "Try again" runs it again.

## Touch screens

On a touch screen (`@media (pointer: coarse)`, at the end of `src/routes/layout.css`) every control is at least 40px
wide and tall: buttons, tabs, filter chips, select boxes, inputs, menu rows, and a larger invisible area around
checkboxes and switches. A mouse keeps the compact shadcn sizes. No shadcn component file is edited
for this; the rules go by each component's `data-slot`. Give a plain link or button of your own the class `tap` to
include it. The one exception is a link inside a sentence.

## Re-checking products saved by an older checker

A product that an older version of the checker analysed shows "Not analyzed yet". `scripts/recheck_products.py`
re-reads the reviews already stored for it and saves a verdict from the current checker. It uses the original app's
own functions, edits none of its code, and contacts no marketplace. Close both apps first, then run it with the
original's Python from this folder:

```
..\Capstone-Version-Control-Version-1.1\.venv\Scripts\python.exe scripts\recheck_products.py
..\Capstone-Version-Control-Version-1.1\.venv\Scripts\python.exe scripts\recheck_products.py --apply
```

- Without `--apply` it is a **dry run**: it lists what it would re-check and writes nothing.
- With `--apply` it first copies `defaketive.db` into `backups/` here and checks the copy, then analyses and saves.
  If the review model cannot load, it stops before writing anything.
- Products with no stored reviews are left as they are: there is nothing to re-read.
- **To undo:** close both apps and copy the backup file (its full path is printed at the end) back over
  `defaketive.db` in the original folder.

`scripts/remove_error_pages.py` works the same way (dry run by default, `--apply` backs up first). It removes saved
rows that are really a browser error page, such as "This site can't be reached", which a failed scrape once saved as
if it were a product. It only touches rows with that title and no reviews.

## Where this differs from stock shadcn-svelte

Only to keep text readable (WCAG AA, checked with axe on every page, in light and dark, plus the pop-ups):

- `--muted-foreground` is `oklch(0.5 0 0)` instead of `0.556` (4.3:1 on `muted` was just under AA).
- Red text on a pale red tint read 4.0:1, so `--destructive-ink` and `--destructive-soft` are used for the
  destructive Button, Badge and Alert and for the safety chips.
- `--warning`, `--success`, `--unknown` (and their `-soft` tints) are new, for the verdict colours above, and `--destructive` is a little darker than stock so red text on white passes with room to spare.

The dark theme, radius, Inter font and every other token are the shadcn-svelte defaults.

## Charts and motion

- Charts use shadcn-svelte's chart component (layerchart): the sentiment donut on a report, the verdict-group donut
  on Home, and scans per day on History. Each has a text version for screen readers. (Home used to compare
  marketplaces too. That chart is gone: a handful of checked products cannot support such a comparison.)
- Loading shows skeletons shaped like the real thing (cards, rows, number tiles, a whole report).
- Empty screens share one look (`empty-state.svelte` with a small line drawing from `empty-art.svelte`).
- Motion (all in `src/routes/layout.css`, all switched off for people who ask their device for less motion):
  cards rise in one after another (`.reveal`), numbers count up (`count-up.svelte`), page changes cross-fade
  (View Transitions, set up in `src/routes/+layout.svelte`), the live scan shows a stepper and a bar with a light sweep
  (`scan-progress.svelte`), and a report's verdict settles in step by step (`verdict-block.svelte`).

## Shortcuts, previews and phone touches

- **Ctrl+K** (Cmd+K on a Mac) opens a search pop-up from anywhere: jump to a page, open a product you checked, switch theme, sign in or out.
- **/** jumps to the link box (and opens "Check a product" first if the page has none).
- Resting the mouse on a product shows a short preview (verdict, counts, strongest quote). It is only an extra: the link works without it.
- Home rows are carousels with arrows (drag or swipe also works).
- On phones, filters on Products and on a report's Reviews tab open from the bottom.
- Saving or unsaving a product shows an **Undo** toast.
- Photos fade in over a soft colour wash, fall back to a calm "No photo" tile, and a report photo opens larger.

## How it is built

```
src/lib/api.ts                  fetch wrapper that keeps the server's own error messages
src/lib/boot.ts                 the start-up load; "Try again" buttons run it again
src/lib/product.ts              pure helpers: chips, filters, sentiment, highlighted quotes
src/lib/stores/*.svelte.ts      auth, saved history + wishlist, catalog, live scan, preferences, pop-ups
src/lib/components/ui/          shadcn-svelte components (added with the CLI, yours to edit)
src/lib/components/app/         DeFaketive pieces: sidebar, product card, scan form, sign-in pop-up
src/lib/components/report/      the parts of a product report
src/routes/                     pages
```

Add more shadcn components with `npx shadcn-svelte@latest add <name>`.

> **Careful with `--overwrite`:** it replaces the shadcn files you edited. DeFaketive edits to re-check afterwards: `ui/button`, `ui/badge`, `ui/alert` (the destructive look) and `ui/hover-card/hover-card-trigger.svelte` (keeps the link a link).

> SvelteKit 3 keeps its TypeScript settings out of `tsconfig.json`, and the shadcn-svelte CLI cannot read
> them. If `add` fails with `File '$app/tsconfig' not found`, temporarily replace `tsconfig.json` with
> `{ "compilerOptions": { "strict": true, "paths": { "#lib": ["./src/lib/index.js"], "#lib/*": ["./src/lib/*"] } }, "include": ["src", "vite.config.ts"] }`,
> run the command, then put the original back. Imports use the `#lib/…` alias **with** a file extension
> (`#lib/product.js`, `#lib/stores/auth.svelte.js`).

## Checks

```
npm run check         types and Svelte checks
npm run check:colors  verdict colours: contrast and colour-blind safety
npm run build     static build into build/
```
