import { Menu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import type { EditorView } from "@milkdown/kit/prose/view";
import { usePrefsStore } from "../../stores/usePrefsStore";
import { replaceMisspelling, type Misspelling } from "./spellCheckPlugin";
import { addCustomWords, getSpellingSuggestions, loadSpellChecker } from "./spellChecker";

let isSyncingCustomWords = false;

/** Loads the dictionary and keeps it in step with the saved custom words. */
export function startSpellChecker(): void {
  if (!isSyncingCustomWords) {
    isSyncingCustomWords = true;
    addCustomWords(usePrefsStore.getState().prefs.customDictionaryWords);
    usePrefsStore.subscribe((state) => addCustomWords(state.prefs.customDictionaryWords));
  }
  void loadSpellChecker();
}

// Closed when the next one opens, not after `popup()` returns, since the
// clicked item's action can arrive later.
let lastMenu: Menu | null = null;

export async function showSpellContextMenu(
  view: EditorView,
  misspelling: Misspelling,
): Promise<void> {
  const suggestions = getSpellingSuggestions(misspelling.word);
  const items: (MenuItem | PredefinedMenuItem)[] = await Promise.all(
    suggestions.map((suggestion) =>
      MenuItem.new({
        text: suggestion,
        action: () => replaceMisspelling(view, misspelling, suggestion),
      }),
    ),
  );
  if (items.length === 0) {
    items.push(await MenuItem.new({ text: "No suggestions", enabled: false }));
  }
  items.push(
    await PredefinedMenuItem.new({ item: "Separator" }),
    await MenuItem.new({
      text: `Add "${misspelling.word}" to Dictionary`,
      action: () => void usePrefsStore.getState().addCustomDictionaryWord(misspelling.word),
    }),
  );

  const menu = await Menu.new({ items });
  const previous = lastMenu;
  lastMenu = menu;
  if (previous) void previous.close();
  await menu.popup();
}
