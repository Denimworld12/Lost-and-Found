# UI_SPEC.md — Design system, pages and flows

Build every screen to this spec. The visual language is **the Axelar style reference only** ("signal lights through dark lattice"): a dark command-center interface, depth from tonal surface steps, one orange action color, and small colored node dots for status. If something is missing, choose the option most consistent with what is here and log it in `docs/DECISIONS.md`.

## Design direction

**Theme:** dark-first. Near-black canvas (`#04070a`), cards one tonal step lighter, nav one step lighter again. No shadows, no gradients on cards or panels.

**How it maps to our product:** the blockchain is a network, and every lost item is a node on it. Item status is shown the way a network rack shows status: a small colored light next to a DM Mono label. Signal Orange is reserved for the thing the user should do next.

**Hero visual:** a diamond-lattice SVG (rhombus outlines in Charcoal on Abyss) on the right half of the home hero. Small node dots sit on lattice intersections; each dot is one real Open item (up to 24), colored by category, and hovering a dot shows that item's title and reward. One diamond carries the system's only gradient glow (magenta → orange), placed behind the newest item. This is the single decorative moment in the app.

**Motion:** none except responses to user actions (dialogs opening, TxPanel step changes) and a 2 s slow pulse on the newest-item node dot in the hero. Respect `prefers-reduced-motion` (no pulse).

## Design tokens

Put these in `src/app/globals.css` under Tailwind v4 `@theme`, using the exact names below.

### Color

| Token | Value | Use in this app |
| --- | --- | --- |
| `--color-signal-orange` | `#ff6314` | Primary buttons, active nav item, focus ring, reward amount highlight. Nothing else |
| `--color-node-green` | `#33ffac` | Status dot: Completed. Announcement bar background |
| `--color-node-violet` | `#5b76ff` | Status dot: Claimed |
| `--color-node-magenta` | `#ff2ad4` | Status dot: Disputed. Error dot, 1 px error border on inputs |
| `--color-node-cyan` | `#16c4ff` | Status dot: Open. Info dot |
| `--color-abyss` | `#04070a` | Page canvas, hero, text on orange buttons |
| `--color-void` | `#000000` | SVG icon fills only, image letterboxing |
| `--color-carbon` | `#090c0f` | Cards, panels, dialogs |
| `--color-obsidian` | `#0f1214` | Nav bar, inputs, hover backgrounds, table header rows |
| `--color-charcoal` | `#1a1d1f` | Borders and dividers on dark surfaces, lattice lines, skeleton blocks |
| `--color-steel` | `#676f7a` | Secondary borders, badge outlines, placeholder text, large (≥ 19 px) muted text only |
| `--color-cloud` | `#c6ced7` | Muted body text, captions, helper text (use this, not Steel, for small text) |
| `--color-mist` | `#e1e6eb` | Borders on light sections |
| `--color-snow` | `#f0f5fa` | Secondary text, nav links, body copy on dark |
| `--color-white` | `#ffffff` | Headings, primary text, icon strokes |

Status mapping (always dot + DM Mono label, never color alone):

| Status | Dot | Label |
| --- | --- | --- |
| Open | Node Cyan | `OPEN` |
| Claimed | Node Violet | `CLAIMED` |
| Disputed | Node Magenta | `DISPUTED` |
| Completed | Node Green | `RETURNED` |
| Cancelled | Steel | `CANCELLED` |

Category mapping (dots in the browse filters and on cards): Electronics = Cyan, ID & cards = Violet, Keys = Orange, Bags = Magenta, Books & notes = Green, Clothing / Bottles / Other = Steel.

### Surface stack (depth without shadows)

| Level | Token | Value | Used for |
| --- | --- | --- | --- |
| 0 | Abyss | `#04070a` | Canvas |
| 1 | Carbon | `#090c0f` | Cards, dialogs, panels |
| 2 | Obsidian | `#0f1214` | Nav, inputs, hover states |
| 3 | Charcoal | `#1a1d1f` | Borders, dividers |

Never use `#000000` as a page background. Never add `box-shadow` for elevation; the only shadows allowed are the inset hairlines below.

### Type

| Family | Role | Weights | Loading |
| --- | --- | --- | --- |
| **Clash Grotesk** | Headings, nav, buttons, links | 500, 600 | Free from Fontshare. Download the woff2 files into `apps/web/src/fonts/` and load with `next/font/local` (variable `--font-clashgrotesk`). Fallback: Space Grotesk |
| **Inter** | Body, descriptions, form text | 400, 600 | `next/font/google` (`--font-inter`) |
| **DM Mono** | Status labels, category tags, addresses, tx hashes, ETH amounts in metadata, badge text | 400, 500 | `next/font/google` (`--font-dm-mono`) |

Clash Grotesk uses letter-spacing `0.033em` at every size. Never use it for paragraphs longer than two lines.

| Role | Size / line height | Family | Token |
| --- | --- | --- | --- |
| caption | 12 / 1.33 | DM Mono or Inter | `--text-caption` |
| body-sm | 14 / 1.25 | Inter | `--text-body-sm` |
| body | 16 / 1.5 | Inter | `--text-body` |
| body-lg | 19 / 1.5 | Inter | `--text-body-lg` |
| subheading | 21 / 1.25 | Clash 500 | `--text-subheading` |
| heading-sm | 28 / 1.25 | Clash 500 | `--text-heading-sm` |
| heading | 37 / 1.25 | Clash 500 | `--text-heading` |
| heading-lg | 56 / 1.15 | Clash 600 | `--text-heading-lg` |
| display | 74 / 1.0 | Clash 600 | `--text-display` (home hero only; 44 px on mobile) |

Buttons, nav links, DM Mono labels and the announcement bar are **uppercase** via `text-transform: uppercase`; keep the source text in sentence case so screen readers read it normally. Headings and body stay in normal case. Numbers use `tabular-nums`.

### Space, shape, layout

- Spacing tokens: 4, 5, 7, 9, 12, 14, 16, 19, 20, 24, 28, 32, 42, 48, 64 px (`--spacing-*`). Default element gap 24, card padding 24, section gap 64.
- Page max-width 1280 px, centered, 24 px side padding (16 px under 640 px).
- Radius: buttons and inputs **24 px** (pill); cards and dialogs **8 px**; badges **100 px**; small inline elements (copy buttons, code chips) **4 px**. Never mix others in.
- Hairlines: `--shadow-subtle: inset 0 0 0 1px #ffffff` for ghost buttons; `--shadow-subtle-2: inset 0 0 0 1px #e1e6eb` for inputs on light sections.
- Focus ring: 2 px Signal Orange outline, 2 px offset, on every interactive element.
- Breakpoints: `sm` 640, `md` 768, `lg` 1024, `xl` 1280. Build mobile first at 360 px.

### Light sections

Used only for the "How a return works" band on Home and for the How it works page body. Flip the stack: canvas `#ffffff`, headings `#04070a`, body `#04070a` at 80% opacity, borders Mist `#e1e6eb`. Orange step cards stay orange.

## Components

### Buttons

| Variant | Look | Used for |
| --- | --- | --- |
| Primary | Pill 24 px, bg Signal Orange, text **Abyss** `#04070a`, Clash 500 14–16 px, uppercase, padding 12 × 24, no border, no shadow. Hover: bg `#ff7a38`. Disabled: bg Charcoal, text Steel | The one main action per screen or panel |
| Ghost | Pill, transparent, `--shadow-subtle` white hairline, white text, uppercase. Hover: bg Obsidian | Secondary actions |
| Quiet | No border, Snow text, uppercase, Obsidian on hover | Tertiary (Back, View on Etherscan) |
| Danger | Ghost pill with a Magenta dot before the label | Reject claim, Cancel listing, Pause |

The style reference shows white text on orange. White on `#ff6314` measures about 3:1 contrast, below the WCAG AA minimum for button text, so we use Abyss text on orange (about 7:1). Log this in `DECISIONS.md`.

At most **one** Primary button visible per view region. If two actions compete (Confirm vs Reject), Confirm is Primary and Reject is Danger.

### `ItemCard` (Dark item card)

```
┌──────────────────────────────────────────┐   bg Carbon, 1 px Charcoal border, radius 8, padding 24
│ ● ELECTRONICS                 ● OPEN      │   DM Mono 12 px labels with node dots (category left, status right)
│ ┌──────────────────────────────────────┐ │
│ │                photo                 │ │   4:3, radius 4, Void letterbox, lazy, alt = title
│ └──────────────────────────────────────┘ │
│ Casio fx-991 calculator                   │   Clash 500, 21 px, white, 2 lines max
│ Library, 2nd floor                        │   Inter 14 px, Cloud
│ ──────────────────────────────────────── │   Charcoal divider
│ REWARD  0.01 ETH          LOST 2D AGO     │   DM Mono 12 px Cloud labels; reward value Signal Orange, DM Mono 16 px
└──────────────────────────────────────────┘
```

- Whole card is one link; hover: border becomes Steel, bg Obsidian. No lift, no shadow.
- Completed: status dot green `RETURNED`, photo at 70% opacity. Cancelled: whole card 50% opacity.
- Skeleton: same frame with Charcoal blocks, no pulse when reduced motion is on.
- Grid cells separate with 24 px gaps (not shared borders), so each card reads as its own node.

### Other components

| Component | Spec |
| --- | --- |
| `StatusBadge` | Pill 100 px radius, bg Obsidian, 1 px Steel border, 8 px node dot + DM Mono 12 px uppercase label, padding 4 × 12 |
| `StatusPanel` (item page) | Carbon card: large status label (Clash 500, 28 px) with a 10 px node dot, then a one-line explanation in Inter Cloud ("Waiting for the owner to confirm the return.") |
| `RewardAmount` | DM Mono, Signal Orange for the number, Cloud for "ETH"; tooltip with exact wei |
| `AddressChip` | DM Mono 14 px Snow, `0x12…ab`, 4 px-radius copy button, link icon to Etherscan; shows "YOU" pill when it's the viewer |
| `WalletButton` | Ghost pill in nav. States: "Install MetaMask" · "Connect wallet" · "Switch to Sepolia" (Magenta dot) · "Wrong wallet" (Magenta dot) · connected: Green dot + `0x12…ab` + balance in DM Mono |
| `AnnouncementBar` | Full-width, 40 px, bg Node Green, Abyss text Clash 500 14 px uppercase, dismiss ×. Text: "Runs on the Sepolia test network. Rewards use test ETH with no real value." Dismissal remembered in localStorage |
| `NetworkGuard` | Carbon bar under the nav with Magenta dot, explanation in Inter, and the fix as a Primary button |
| `TxPanel` | Carbon card replacing the action buttons while a write runs. Steps as rows: dot (Steel pending → Orange active → Green done / Magenta failed) + DM Mono step name: CHECKING · CONFIRM IN METAMASK · PENDING · DONE. Tx hash as AddressChip-style link |
| `Countdown` | DM Mono, Node Violet dot, "2D 04H LEFT TO RESPOND"; under 1 h shows minutes; uses chain time |
| `ActionBar` | Row of buttons per the matrix; sticky to bottom on mobile on an Obsidian bar with Charcoal top border |
| `StepCard` (orange) | bg Signal Orange, radius 8, padding 24; step number in a white circle (Abyss numeral); DM Mono 12 px tag at 70% opacity; Clash 500 28 px heading in Abyss; Inter 16 px body in Abyss at 80% |
| `Input` | Pill 24 px radius, bg Obsidian, 1 px Charcoal border, Inter 16 px Snow, placeholder Steel, padding 12 × 24. Focus: orange ring. Error: 1 px Magenta border + Magenta dot + message in Snow below. Textarea uses radius 8 |
| `Select`, `Tabs`, `Dialog` | shadcn/ui restyled: Obsidian triggers, Carbon content, Charcoal borders, active tab = white text with a 2 px orange underline |
| `EmptyState` | Small lattice fragment SVG (3 diamonds, one Steel dot), Clash 21 px line, one Primary or Ghost button |
| `Toast` (sonner) | Carbon, Charcoal border, node dot by result (Green success, Magenta error, Steel cancelled), past-tense message |
| `Table` (admin) | Obsidian header row with DM Mono 12 px uppercase Cloud headings, Carbon rows, Charcoal row dividers |

## Voice and vocabulary

Plain verbs, short sentences, errors explain the fix. Buttons render uppercase but are written in sentence case. One name per action, everywhere:

| Action | Button | Success toast |
| --- | --- | --- |
| Post an item | Report lost item | Item posted |
| Claim | I found this | Claim sent |
| Owner confirms | Confirm it's returned | Return confirmed |
| Owner rejects | Reject claim | Claim rejected |
| Dispute | Open a dispute | Dispute opened |
| Finder after timeout | Collect reward | Reward collected |
| Owner cancels | Cancel listing | Listing cancelled |
| Withdraw | Withdraw {amount} | Withdrawn to your wallet |
| Arbiter | Pay the finder / Return to owner | Dispute resolved |

Use "deposit" for the finder's stake in UI copy, and "test ETH" when explaining money to newcomers.

## App shell

```
┌────────────────────────────────────────────────────────────────────────┐
│ RUNS ON THE SEPOLIA TEST NETWORK. REWARDS USE TEST ETH…           [×]  │  AnnouncementBar (Node Green)
├────────────────────────────────────────────────────────────────────────┤
│ [logo] MILGAYA   BROWSE  HOW IT WORKS  TRANSPARENCY        │  Nav: Obsidian, 60 px, sticky
│                         ( ● 0x12…AB  0.08 ETH )  [REPORT LOST ITEM] (av)│  Ghost wallet pill + orange CTA + Clerk avatar
├────────────────────────────────────────────────────────────────────────┤
│ NetworkGuard (only when needed)                                         │
├────────────────────────────────────────────────────────────────────────┤
│                 page content on Abyss, max-width 1280                   │
├────────────────────────────────────────────────────────────────────────┤
│ footer (Abyss, Charcoal top border): contract address chip, verified    │
│ source link, DM Mono 12 px Cloud trust strip:                           │
│ ● REWARDS HELD IN ESCROW   ● SOURCE VERIFIED   ● NO PERSONAL DATA ON-CHAIN│
└────────────────────────────────────────────────────────────────────────┘

Mobile (< 768): nav shows logo, avatar, menu button (Sheet from right, Carbon).
Bottom nav: Obsidian, 56 px, Charcoal top border, DM Mono 12 px labels with icons:
BROWSE · REPORT (orange icon) · ME · MORE; safe-area padding.
```

- Logo: a single rhombus outline in white with an orange node dot at its top vertex, then the wordmark in Clash 600.
- Active nav link: white text with a 2 px Signal Orange underline. Inactive: Snow.
- Logged out: "Sign in" Ghost pill + "Report lost item" Primary (goes to sign-in, then back).
- Signed in but not verified: Carbon strip under the nav with a Cyan dot: "Finish setting up to post or claim" + Quiet "Continue setup" button.

## Site map and access

| Route | Page | Access |
| --- | --- | --- |
| `/` | Home | Public |
| `/items` | Browse | Public |
| `/items/[id]` | Item detail | Public (actions need verified student) |
| `/post` | Report lost item wizard | Verified student |
| `/me` | My dashboard | Verified student |
| `/onboarding` | Account setup | Signed in |
| `/sign-in`, `/sign-up` | Clerk pages | Public |
| `/not-eligible` | Wrong email domain | Signed in |
| `/admin` | Admin console | Admin / arbiter |
| `/how-it-works` | Explainer | Public |
| `/transparency` | Contract facts and totals | Public |
| `not-found`, `error` | 404 / error boundary | Public |

## Pages

### Home `/`

Job: show that lost items get returned here, and get people to browse or report.

```
┌──────────────────────────────────────────────────────────────────┐  Abyss
│  Lost something                          ◇ ◇ ◇ ◇ ◇ ◇              │
│  on campus?                             ◇ ●◇ ◇ ◇●◇ ◇             │  diamond lattice,
│  Post it with a reward. The reward      ◇ ◇ ◇ ◈ ◇ ◇ ◇            │  ● = live Open items
│  stays locked until you get it back.     ◇ ◇●◇ ◇ ◇ ◇              │  ◈ = newest item glow
│  [REPORT LOST ITEM]  (BROWSE ITEMS)                                │
│  ● ESCROW ON SEPOLIA  ● 23 RETURNED  ● 0.41 ETH PAID               │  DM Mono trust strip
├──────────────────────────────────────────────────────────────────┤  64 px gap
│  Recently lost                                     (SEE ALL ITEMS)│  Abyss
│  [card] [card] [card] [card]   4 newest Open; horizontal scroll   │
│                                 on mobile                         │
├──────────────────────────────────────────────────────────────────┤  LIGHT SECTION (white)
│  How a return works                                               │
│  [1 orange StepCard] [2 StepCard] [3 StepCard]                    │
│  1 Post and lock a reward · 2 A student claims and meets you ·    │
│  3 Confirm, and the finder is paid                                │
├──────────────────────────────────────────────────────────────────┤  Abyss
│  Every payment is public.                                         │
│  Carbon card: contract address chip, verified source link,        │
│  (VIEW THE CONTRACT)                                              │
└──────────────────────────────────────────────────────────────────┘
```

Hero headline: Clash 600 display size, white, left-aligned in the left half (max-width 600 px); body Inter 19 px Snow. On mobile the lattice sits below the text at 240 px tall and shows at most 12 dots. The trust strip numbers come from the subgraph `Stats`. No photography in the hero.

### Browse `/items`

```
┌──────────────────────────────────────────────────────────────────┐
│ Lost items                                                       │
│ [Search title…        ] [Status: Open ▾] [Category ▾] [Sort ▾]   │
│ 12 items                                                         │
│ [card] [card] [card]                                             │
│ [card] [card] [card]        grid: 1 col <640, 2 col ≥640,        │
│                              3 col ≥1024                         │
│ [Load more]                                                      │
└──────────────────────────────────────────────────────────────────┘
```

- Filters live in the URL (`?status=Open&category=Electronics&sort=newest`) so links are shareable.
- Status filter defaults to Open. Sort: newest, highest reward.
- Search matches title client-side after metadata loads (subgraph has no titles).
- Empty: "No open items right now. Lost something?" + [Report lost item].
- Subgraph down: small notice "Showing the latest 50 items directly from the blockchain."

### Item detail `/items/[id]`

```
┌──────────────────────────────────────────────────────────────────┐
│ ← Back to items                                                  │
│ ┌──────────────────────────┐  Casio fx-991 calculator            │
│ │                          │  [StatusPanel: ● CLAIMED]           │
│ │          photo           │  Reward 0.01 ETH   Deposit 0.0005   │
│ │                          │  Lost at Library, 2nd floor         │
│ └──────────────────────────┘  Lost on 2 Oct 2026                 │
│                               Black, name sticker on the back    │
│                               Posted by 0x4b…91af                │
│                               Claimed by 0x9c…2210 (You)         │
│                               ⏱ 2 days 4 hours left to respond   │
│ ┌──────────── ActionBar (role + status based) ─────────────────┐ │
│ │ [Confirm it's returned]  [Reject claim]  [Open a dispute]    │ │
│ └──────────────────────────────────────────────────────────────┘ │
│ Contact: finder's college email (owner/finder only, after claim) │
├──────────────────────────────────────────────────────────────────┤
│ History (from ItemEvent, newest first)                           │
│ Claimed by 0x9c…2210        3 Oct, 10:42   View on Etherscan     │
│ Posted with 0.01 ETH        2 Oct, 18:05   View on Etherscan     │
└──────────────────────────────────────────────────────────────────┘
Mobile: photo full width, details below, ActionBar sticky at bottom.
```

ActionBar matrix (viewer × status):

| Status | Owner | Finder | Other verified student | Not verified / logged out | Arbiter |
| --- | --- | --- | --- | --- | --- |
| Open | Cancel listing | — | I found this | "Sign in to claim" / "Finish setup to claim" | — |
| Claimed, in window | Confirm it's returned · Reject claim · Open a dispute | Open a dispute · countdown | "Someone has claimed this" | same note | — |
| Claimed, window passed | Confirm it's returned | Collect reward | note | note | — |
| Disputed | "Waiting for the security office" | same | note | note | Resolve (opens dispute panel) |
| Completed | RETURNED status; Withdraw if balance | Withdraw if balance | RETURNED status | RETURNED status | — |
| Cancelled | Withdraw if balance | — | "Listing cancelled" | same | — |

The "I found this" dialog says: "You'll lock a 0.0005 ETH deposit. You get it back with the reward when the owner confirms. If the owner rejects your claim, the deposit goes to them." Buttons: [Cancel] [I found this].

Item not found → 404 page. Metadata fails to load → show on-chain facts with "Photo and details unavailable right now."

### Report lost item `/post` (4-step wizard)

```
 Step 1 Details   Step 2 Photo   Step 3 Reward   Step 4 Review
┌──────────────────────────────────────────────────────────────────┐
│ 1 What did you lose?                                             │
│ Title*            [Casio fx-991 calculator        ] 60 chars max │
│ Category*         [Electronics ▾]  (Electronics, ID & cards,     │
│                   Keys, Bags, Books & notes, Clothing,           │
│                   Bottles, Other)                                │
│ Where*            [Library, 2nd floor             ]              │
│ When*             [date picker, not in the future]               │
│ Description       [Black, sticker on the back     ] 280 max      │
│ ⚠ Don't include your name, phone or roll number. Everything      │
│   here is public and permanent.                                  │
│                                      [Back]  [Continue]          │
└──────────────────────────────────────────────────────────────────┘
 Step 2: drag-and-drop or camera capture (`accept="image/*" capture`),
         preview, client-side compress to ≤ 2 MB; optional but encouraged
 Step 3: reward input with ETH suffix, min shown, wallet balance shown,
         quick picks 0.001 / 0.005 / 0.01; explains "Locked until you
         confirm the return or cancel the listing"
 Step 4: preview as a real ItemCard + summary; [Post and lock reward]
         → TxPanel: Uploading photo → Confirm in MetaMask → Pending → Done
         → redirect to the new item page
```

- Validation inline on blur and on Continue (zod schema shared with the API).
- Form state kept in memory across steps and after a failed transaction.
- Leaving with unsaved input shows the browser's leave confirmation.

### Sign in / Sign up (Clerk)

- Centered Clerk `<SignIn />` / `<SignUp />` inside our shell, with a left panel on desktop: "Use your college Google account. Only @{domain} addresses can join."
- Methods: "Continue with Google" first, email code second. No passwords.
- Themed via `appearance` (see "Clerk theming").

### Onboarding `/onboarding`

```
┌──────────────────────────────────────────────────────────────────┐
│ Set up your account                       Takes about 2 minutes  │
│ ✓ 1 College account        riya@yourcollege.edu.in               │
│ ● 2 Connect MetaMask       [Connect MetaMask]                    │
│                            No MetaMask? [Install it] · On a      │
│                            phone? [Open in MetaMask app]         │
│ ○ 3 Link wallet to account  Sign a free message to prove it's    │
│                             yours. No gas, no transaction.       │
│ ○ 4 Get test ETH            Balance 0.000 ETH. [Open faucet]     │
│                             [Check again]                        │
│ ○ 5 Activate                We add your wallet to the student    │
│                             list on the blockchain.              │
│                             [Activate my account]                │
└──────────────────────────────────────────────────────────────────┘
Done state: "You're all set." [Report lost item] [Browse items]
```

- Only the current step is expanded; completed steps collapse to one line with a check.
- Errors in place: "This wallet is already linked to another account. Use a different MetaMask account."
- Activation pending shows the Etherscan link and keeps polling `/api/onboarding/status` every 4 s.

### Not eligible `/not-eligible`

"Only @{domain} accounts can use MilGaya. You signed in as {email}." [Sign out and try another account]

### My dashboard `/me`

```
┌──────────────────────────────────────────────────────────────────┐
│ Hi Riya                         ┌ Available to withdraw ───────┐ │
│                                 │ 0.0105 ETH  [Withdraw]        │ │
│                                 └───────────────────────────────┘ │
│ [Needs your action (2)] [Items I lost] [Items I found] [History] │
│  ─ tab content: compact card rows with the one relevant button ─  │
│  "Arjun claimed your calculator. 2 days left to respond."        │
│      [Confirm it's returned] [View item]                         │
└──────────────────────────────────────────────────────────────────┘
```

- "Needs your action" items: Claimed items you own (respond), your claims past the window (collect), anything with a balance (withdraw), disputes involving you (status only).
- Header badge on "Me" shows the count of items needing action.
- Empty tabs have an EmptyState with the obvious next step.

### Admin `/admin`

Left tabs on desktop, top tabs on mobile: Overview · Students · Disputes · Settings · Audit log (arbiters see Disputes only).

```
Disputes
┌──────────────────────────────────────────────────────────────────┐
│ #14 Blue water bottle   Reward 0.005 ETH   Disputed 3 Oct 11:20  │
│ Owner  riya@…  0x4b…91af        Finder arjun@…  0x9c…2210        │
│ History  Posted · Claimed · Dispute opened by owner              │
│ Note (required) [Checked CCTV at library desk…              ]    │
│ [Pay the finder]   [Return to owner]                             │
└──────────────────────────────────────────────────────────────────┘
```

- Settings shows current value, allowed range and a preview sentence ("Finders will have to lock 0.0005 ETH").
- Pause requires typing PAUSE. Paused state shows a red banner across the whole admin area.

### How it works `/how-it-works`

Light section with orange StepCards for owner and finder (two columns on desktop), a short FAQ (Is this real money? What if the owner never confirms? What if someone lies? Who can see my email?), and the state diagram as a simple SVG.

### Transparency `/transparency`

Contract address with copy + Etherscan link, "Source code verified" check, current config, totals from `Stats`, current escrow balance (`totalEscrowed`), list of admin/arbiter/verifier addresses, and the latest 20 contract events.

### 404 and error

404: "We couldn't find that page. It may have been moved, or the link is wrong." [Browse items]. Error boundary: "Something went wrong loading this page." [Try again], and the error is sent to Sentry.

## User flows

### First-time student (happy path)

```
Landing → Report lost item → Sign in (Google, college account)
  → Onboarding: connect → link wallet (signature) → faucet → activate (tx by verifier)
  → /post wizard → MetaMask confirm → item page (status Open)
```

### Finder

```
Browse → item → I found this → dialog → MetaMask (deposit) → Claimed
  → item page shows owner's college email → meet → wait for owner
  → owner confirms → "Withdraw" appears → Withdraw → funds in wallet
  (or) window passes → Collect reward → Withdraw
```

### Owner responding

```
/me "Needs your action" → item → Confirm it's returned → Completed (RETURNED)
                                → Reject claim → Open again (deposit credited to owner)
                                → Open a dispute → Disputed → arbiter decides
```

### Arbiter

```
/admin Disputes → read history + contact both students off-platform
  → note → Pay the finder | Return to owner → Dispute resolved toast → audit log entry
```

### Edge flows to handle

- Visitor without MetaMask on desktop → Install MetaMask link, browse still works.
- Phone in a normal browser → "Open in MetaMask app" deep link on every write action.
- Wrong network → NetworkGuard with "Switch to Sepolia".
- Connected wallet ≠ linked wallet → writes blocked, banner names the linked address.
- Item status changes while viewing (another user acted) → live update + toast "This item was just claimed."
- Transaction pending and the user closes the tab → on return, item page reflects the final state from chain; no stuck spinners.

## Clerk theming

Dark only. Pass to `<ClerkProvider appearance={...}>` with `baseTheme: dark` from `@clerk/themes`:

```ts
appearance: {
  baseTheme: dark,
  variables: {
    colorPrimary: '#ff6314',
    colorTextOnPrimaryBackground: '#04070a',
    colorBackground: '#090c0f',
    colorInputBackground: '#0f1214',
    colorInputText: '#f0f5fa',
    colorText: '#ffffff',
    colorTextSecondary: '#c6ced7',
    colorDanger: '#ff2ad4',
    colorSuccess: '#33ffac',
    colorNeutral: '#f0f5fa',
    borderRadius: '8px',
    fontFamily: 'var(--font-inter)',
  },
  elements: {
    card: 'bg-[#090c0f] border border-[#1a1d1f] shadow-none',
    headerTitle: 'font-[family-name:var(--font-clashgrotesk)] tracking-[0.033em]',
    formButtonPrimary: 'rounded-[24px] uppercase font-[family-name:var(--font-clashgrotesk)] tracking-[0.033em] shadow-none',
    socialButtonsBlockButton: 'rounded-[24px] border border-[#676f7a] bg-transparent',
    formFieldInput: 'rounded-[24px] border border-[#1a1d1f]',
    footer: 'bg-[#090c0f]',
  },
}
```

Clerk's variable names change between SDK versions; check the current `appearance` docs and keep the same values.

The sign-in page sits on Abyss with a small lattice fragment behind the left panel text: "Use your college Google account. Only @{domain} addresses can join."

## Accessibility and quality floor

- WCAG 2.2 AA contrast for all text. Use Cloud, not Steel, for small muted text; Abyss, not white, on orange buttons and step cards.
- Every icon-only button has an `aria-label`; status is never conveyed by color alone.
- Dialogs trap focus and return it to the trigger; Escape closes them.
- `TxPanel` progress announced via `aria-live="polite"`.
- Hit targets ≥ 44 px on touch. Bottom nav respects `env(safe-area-inset-bottom)`.
- `prefers-reduced-motion`: no hero dot pulse, no skeleton pulse.
- Images have meaningful alt text; the hero lattice is `aria-hidden` except its dots, which are links with item titles as labels.
- Uppercase is applied with CSS only, so assistive tech reads normal case.
- Page titles: "{Item title} — MilGaya", etc. Open Graph image per item using its photo.
