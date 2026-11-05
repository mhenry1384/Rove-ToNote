# Color schemes

Rove ToNote follows the operating system's light/dark setting
(`prefers-color-scheme`). There's no in-app switcher yet.

| OS mode | Scheme  | Source |
| ------- | ------- | ------ |
| Light   | Alucard | Dracula's official light variant, https://draculatheme.com/spec |
| Dark    | Dracula | https://draculatheme.com/spec |

## Where the colors live

Everything is in [src/App.css](../src/App.css):

1. **App tokens:** `:root` (Alucard) and the `@media (prefers-color-scheme: dark)` block
   right after it (Dracula). The whole UI uses these `--*` variables.
2. **Editor tokens:** the `.markdown-editor .milkdown` block (Alucard) and the dark-mode block
   after it (Dracula). These set Milkdown Crepe's `--crepe-color-*` variables.

These don't follow the scheme on purpose:

- **Colored notes** (`.note-editor--colored ...`) use translucent black text on the note's own
  background color, in both modes.
- **Note background colors**: [src/document/noteColors.ts](../src/document/noteColors.ts)
  (a Google Keep-style palette).
- **Priority colors**: [src/document/priorityColors.ts](../src/document/priorityColors.ts).
- Shadows and modal backdrops use plain `rgba(0, 0, 0, …)`.

## Token mapping

"Spec" means the value comes straight from the official palette. "Derived" means the value was
picked to fit, because the spec doesn't name that role.

### App tokens

| Token          | Alucard (light) | Dracula (dark) | Role in the palette |
| -------------- | --------------- | -------------- | ------------------- |
| `--bg`         | `#fffbeb`       | `#282a36`      | Background (spec) |
| `--bg-subtle`  | `#f4f0dc`       | `#21222c`      | Light: derived. Dark: Background Darker (spec) |
| `--bg-hover`   | `#ebe7d2`       | `#343746`      | Light: derived. Dark: Background Light (spec) |
| `--bg-selected`| `#cfcfde`       | `#44475a`      | Selection / Current Line (spec) |
| `--border`     | `#dedac6`       | `#191a21`      | Light: derived. Dark: Background Darkest (spec) |
| `--text`       | `#1f1f1f`       | `#f8f8f2`      | Foreground (spec) |
| `--text-muted` | `#6c664b`       | `#6272a4`      | Comment (spec) |
| `--accent`     | `#644ac9`       | `#bd93f9`      | Purple (spec) |
| `--danger`     | `#cb3a2a`       | `#ff5555`      | Red (spec) |
| `--warning`    | `#a34d14`       | `#ffb86c`      | Orange (spec) |
| `--warning-bg` | `#f6e3c6`       | `#483f3e`      | Derived (orange tint over the background) |

### Editor (Crepe) tokens

| Token                              | Alucard (light) | Dracula (dark) |
| ---------------------------------- | --------------- | -------------- |
| `--crepe-color-background`         | `transparent`   | `transparent`  |
| `--crepe-color-on-background`      | `#1f1f1f`       | `#f8f8f2`      |
| `--crepe-color-surface`            | `#fffbeb`       | `#282a36`      |
| `--crepe-color-surface-low`        | `#f4f0dc`       | `#21222c`      |
| `--crepe-color-on-surface`         | `#1f1f1f`       | `#f8f8f2`      |
| `--crepe-color-on-surface-variant` | `#4a4637`       | `#bcc2dc`      |
| `--crepe-color-outline`            | `#6c664b`       | `#6272a4`      |
| `--crepe-color-primary`            | `#644ac9`       | `#bd93f9`      |
| `--crepe-color-secondary`          | `#cfcfde`       | `#44475a`      |
| `--crepe-color-on-secondary`       | `#1f1f1f`       | `#f8f8f2`      |
| `--crepe-color-inverse`            | `#1f1f1f`       | `#f8f8f2`      |
| `--crepe-color-on-inverse`         | `#fffbeb`       | `#282a36`      |
| `--crepe-color-inline-code`        | `#14710a`       | `#50fa7b`      |
| `--crepe-color-error`              | `#cb3a2a`       | `#ff5555`      |
| `--crepe-color-hover`              | `#ebe7d2`       | `#343746`      |
| `--crepe-color-selected`           | `#cfcfde`       | `#44475a`      |
| `--crepe-color-inline-area`        | `#f4f0dc`       | `#21222c`      |

### Full palettes, for reference

| Name       | Alucard   | Dracula   |
| ---------- | --------- | --------- |
| Background | `#fffbeb` | `#282a36` |
| Selection  | `#cfcfde` | `#44475a` |
| Foreground | `#1f1f1f` | `#f8f8f2` |
| Comment    | `#6c664b` | `#6272a4` |
| Red        | `#cb3a2a` | `#ff5555` |
| Orange     | `#a34d14` | `#ffb86c` |
| Yellow     | `#846e15` | `#f1fa8c` |
| Green      | `#14710a` | `#50fa7b` |
| Cyan       | `#036a96` | `#8be9fd` |
| Purple     | `#644ac9` | `#bd93f9` |
| Pink       | `#a3144d` | `#ff79c6` |

## Adding a scheme switcher later

The app and editor tokens are the only places a scheme needs to set. One way to do it:

- Move each palette into a selector such as `:root[data-scheme="alucard"]` and
  `:root[data-scheme="dracula"]` (with the editor block nested the same way), and keep the
  `prefers-color-scheme` rules as the "System" default.
- Set `document.documentElement.dataset.scheme` from a saved setting.
- Add a row to the tables above for every new scheme.
