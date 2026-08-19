import { create } from "zustand";

interface TreeFilterState {
  query: string;
  setQuery: (query: string) => void;
}

export const useTreeFilterStore = create<TreeFilterState>((set) => ({
  query: "",
  setQuery: (query) => set({ query }),
}));
