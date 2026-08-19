import { Search, X } from "lucide-react";
import { useTreeFilterStore } from "../../stores/useTreeFilterStore";

export function TreeFilterBox() {
  const query = useTreeFilterStore((s) => s.query);
  const setQuery = useTreeFilterStore((s) => s.setQuery);

  return (
    <div className="tree-filter">
      <Search size={14} className="tree-filter__icon" />
      <input
        type="text"
        className="tree-filter__input"
        placeholder="Filter notes"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query && (
        <button
          type="button"
          className="tree-filter__clear"
          title="Clear filter"
          onClick={() => setQuery("")}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
