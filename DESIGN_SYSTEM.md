# BLT Planner — Design System Reference

*Single source of truth for all visual design decisions.*

---

## Brand Colors

| Token | Light Mode | Dark Mode | Usage |
|-------|-----------|-----------|-------|
| `primary` | `#212121` | `#e5e5e5` | Text, headings, nav backgrounds, primary buttons |
| `accent` | `#FF3C00` | `#FF5722` | CTAs, AskMike buttons, error text, key highlights |
| `white` | `#FFFFFF` | `#1a1a1a` | Page backgrounds, body bg |
| `surface` | `#FFFFFF` | `#242424` | Cards, inputs, panels |
| `gray` | `#C6C6C6` | `#3a3a3a` | Borders, dividers, secondary text |

### Status Colors (Functional — Not Brand)

| Color | Hex | Usage |
|-------|-----|-------|
| Green | `#22c55e` (`green-500`) | On track, done, success |
| Yellow | `#eab308` (`yellow-400`) | At risk, warning |
| Red | `#ef4444` (`red-500`) | Off track, overdue, error |

### CSS Custom Properties

Defined in `src/app/globals.css`:
```css
:root {
  --color-primary: #212121;
  --color-accent: #FF3C00;
  --color-white: #FFFFFF;
  --color-gray: #C6C6C6;
  --color-surface: #FFFFFF;
}

.dark {
  --color-primary: #e5e5e5;
  --color-accent: #FF5722;
  --color-white: #1a1a1a;
  --color-gray: #3a3a3a;
  --color-surface: #242424;
}
```

### Tailwind Token Mapping

Defined in `tailwind.config.ts`:
```
primary   → var(--color-primary)
accent    → var(--color-accent)
brand-gray → var(--color-gray)
surface   → var(--color-surface)
```

### Rules
- **Never hardcode hex values** in components — always use Tailwind tokens
- **Accent is intentional** — `#FF3C00` is for CTAs and key actions only, never decorative
- **Status colors are separate** from the brand palette — only used on rocks/priorities
- **Sidebar and mobile top bar** use hardcoded `#212121` (not the CSS variable) so they stay dark in both themes

---

## Typography

### Font
**Montserrat** (Google Fonts), loaded in `globals.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800&display=swap');
```

### Weight Usage

| Weight | Class | Usage |
|--------|-------|-------|
| 800 | `font-extrabold` | App logo/brand name |
| 700 | `font-bold` | Page headings (`text-2xl`), card titles |
| 600 | `font-semibold` | Subheadings, labels, nav items, button text |
| 500 | `font-medium` | Secondary headings, emphasized body |
| 400 | `font-normal` | Body text, form inputs |
| 300 | `font-light` | Secondary/muted text, captions, loading states |

### Size Scale

| Size | Class | Usage |
|------|-------|-------|
| 24px | `text-2xl` | Page headings |
| 18px | `text-lg` | Loading messages |
| 14px | `text-sm` | Body text, form inputs, card content |
| 12px | `text-xs` | Labels, badges, secondary info, buttons |
| 10px | `text-[10px]` | Category badges, timestamps, field labels |
| 9px | `text-[9px]` | Type badges in search results |

### Text Colors

| Pattern | Usage |
|---------|-------|
| `text-primary` | Default text |
| `text-primary/70` | Secondary text |
| `text-primary/50` | Muted text, section headers |
| `text-primary/40` | Tertiary text, labels |
| `text-primary/30` | Placeholder-like text |
| `text-white` | Text on dark/colored backgrounds |
| `text-accent` | Error messages, overdue dates |

### Labels & Navigation
- Section labels and nav items use `uppercase` with `tracking-wider` (letter-spacing)
- Example: `text-xs font-semibold uppercase tracking-wider text-primary/40`

---

## Spacing

### Page Layout
| Context | Padding |
|---------|---------|
| Desktop | `px-8 py-12` (`lg:px-8 lg:py-12`) |
| Mobile | `px-4 py-6` |
| Max content width | `max-w-3xl` (most pages), `max-w-4xl` (dashboard) |

### Component Spacing
| Element | Spacing |
|---------|---------|
| Card padding | `p-3` to `p-5` |
| Section gap | `space-y-2` (cards), `mt-6` to `mt-8` (sections) |
| Form field gap | `gap-3` |
| Button internal | `px-4 py-2` (standard), `px-6 py-3` (large CTA), `px-3 py-1` (small) |
| Input internal | `px-3 py-2` |

---

## Border Radius

| Value | Class | Usage |
|-------|-------|-------|
| 4px | `rounded-[4px]` | Cards, inputs, buttons, panels |
| 2px | `rounded-[2px]` | Badges, tags, inline labels |
| Full | `rounded-full` | AskMike buttons (pill shape), notification badge, avatar circles |

**No gradients.** Flat palette only.

---

## Component Patterns

### Buttons

| Type | Classes | When to Use |
|------|---------|-------------|
| **Primary** | `bg-primary text-white uppercase font-semibold tracking-wider rounded-[4px]` | Main actions (Save, Add) |
| **Accent/CTA** | `bg-accent text-white uppercase font-semibold tracking-wider rounded-[4px]` | Add forms, destructive CTAs |
| **AskMike** | `bg-accent text-white uppercase font-semibold tracking-wider rounded-full shadow-md` | AI coaching buttons — always pill-shaped |
| **Ghost** | `border-[1.5px] border-primary bg-transparent text-primary uppercase font-semibold tracking-wider rounded-[4px] hover:bg-primary hover:text-white` | Secondary actions (Back, Cancel, Quick Links) |
| **Small/Inline** | `border border-brand-gray text-primary text-sm rounded-[4px] hover:bg-primary/5` | Undo/Redo, Export, Select mode |
| **Icon/Minimal** | `text-primary/50 hover:text-primary text-xs` | Delete (✕), Edit (✎), Expand (▼/▲) |

### Disabled State
All buttons: `disabled:opacity-50` or `disabled:opacity-40` or `disabled:opacity-30`

### Cards

```
rounded-[4px] border border-brand-gray bg-white shadow-sm
```

Expanded cards add a border-t divider:
```
border-t border-brand-gray px-4 pb-4 pt-3
```

Hover state on clickable cards:
```
transition hover:border-primary
```

### Form Inputs

```
w-full rounded-[4px] border border-brand-gray bg-white px-3 py-2 text-sm text-primary outline-none focus:border-primary
```

- No focus ring — uses `focus:border-primary` instead
- Numeric inputs use `type="text"` (no browser arrows)
- Date inputs use `type="date"`

### Select Dropdowns

```
rounded-[4px] border border-brand-gray bg-white px-3 py-1 text-sm font-semibold text-primary outline-none focus:border-primary
```

### Badges / Tags

```
rounded-[2px] px-2 py-0.5 text-[10px] font-semibold uppercase
```

Colors vary by type:
| Badge | Classes |
|-------|---------|
| Rock | `bg-primary text-white` |
| Priority | `bg-green-500 text-white` |
| WWW | `bg-blue-500 text-white` |
| Issue | `bg-red-500 text-white` |
| Core Value | `bg-purple-500 text-white` |
| Function | `bg-teal-500 text-white` |
| Scorecard | `bg-orange-500 text-white` |
| Plan | `bg-primary text-white` |

### Status Dots

```html
<span className="h-2.5 w-2.5 rounded-full bg-green-500" />
```

### User Avatars

Colored circle with initials, consistent color per name (hash-based). Component: `src/components/UserAvatar.tsx`
- Size `"sm"`: 24px
- Size `"md"`: 32px

### Progress Bars

Background track + colored fill:
```
<!-- Track -->
<div className="h-2 flex-1 rounded-full bg-brand-gray/30">
  <!-- Fill -->
  <div className="h-2 rounded-full bg-green-500" style={{ width: '75%' }} />
</div>
```

### Loading States

```html
<p className="animate-pulse text-lg font-light text-primary/70">Loading...</p>
```

Spinner (for search/notifications):
```html
<div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
```

---

## Layout Patterns

### Sidebar
- Fixed width: `w-56` (224px)
- Always dark: hardcoded `#212121` background
- Navigation uses `uppercase tracking-wider` text
- Active state: `bg-white/10 text-white`
- Inactive: `text-white/60 hover:bg-white/5`

### Mobile
- Below `lg` (1024px): sidebar becomes a slide-out drawer
- Mobile top bar: `h-14` fixed, dark background, hamburger + title + notification bell
- One Page Plan: tab-based column switching

### Desktop Header
- Search bar + notification bell
- `border-b border-brand-gray/50 bg-white px-6 py-2`

### Expandable Cards
- Collapsed: shows summary row with expand button (▼)
- Expanded: reveals edit form below a `border-t` divider
- Keyboard: Escape to collapse, Ctrl+Enter to save

### Drag & Drop
- Handle: six-dot grip icon (⠿) on the left of reorderable cards
- Uses @dnd-kit library
- Component: `src/components/SortableList.tsx`

---

## Notification Bell

- SVG bell icon, `h-5 w-5`
- Unread badge: `bg-accent` circle with count, positioned top-right
- Dropdown: `w-80 lg:w-96`, max-height scrollable
- Unread items: `bg-blue-50/50` background tint
- Unread dot: `h-2 w-2 rounded-full bg-accent`

---

## Charts (Dashboard)

Library: **Recharts**

| Chart | Type | Colors |
|-------|------|--------|
| Rock Status by Quarter | Stacked Bar | Green/Yellow/Red |
| Priority Status | Donut (Pie) | Green/Yellow/Red |
| WWW Activity | Line | Blue (created) / Green (completed) |

- Axis text: `fontSize: 10, fill: "#9ca3af"`
- Tooltip: `fontSize: 12, borderRadius: 4, border: "1px solid #e5e7eb"`
- Legend text: `fontSize: 11, color: "#6b7280"`

---

## Dark Mode Implementation

- Strategy: `darkMode: "class"` in Tailwind config
- Toggle: `.dark` class on `<html>` element
- Managed by `src/contexts/ThemeContext.tsx`
- Persisted in `localStorage` key `"blt-theme"`
- Auto-detects OS preference on first visit
- Global CSS overrides handle `bg-white`, inputs, scrollbars
- Sidebar/mobile-bar exempt (stay dark always)

---

## File Reference

| File | Purpose |
|------|---------|
| `src/app/globals.css` | CSS custom properties, dark mode overrides, font import |
| `tailwind.config.ts` | Color tokens, font family, dark mode strategy |
| `src/contexts/ThemeContext.tsx` | Theme state, toggle, persistence |
| `src/components/UserAvatar.tsx` | Avatar component with hash-based colors |
| `src/components/SortableList.tsx` | Drag-and-drop reorderable list |
| `src/components/askmike/AskMikeButton.tsx` | Pill-shaped AI coaching button |
| `src/components/NotificationBell.tsx` | Bell icon with dropdown |
| `src/components/DashboardCharts.tsx` | Recharts visualizations |
