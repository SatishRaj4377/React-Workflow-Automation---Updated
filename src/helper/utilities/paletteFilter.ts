import { PaletteCategory, PaletteCategoryLabel, PaletteFilterContext, PaletteFilterMode } from "../../types";

// Resolve the allowed sections for each palette mode
export function getAllowedSectionsByMode(mode: PaletteFilterMode): Set<PaletteCategoryLabel> {
  switch (mode) {
    case 'initial-add':
      // From any node port (except agent bottom) → only Core & Flow
      return new Set<PaletteCategoryLabel>(['Triggers']);
    case 'port-core-flow':
      // From any node port (except agent bottom) → only Core & Flow
      return new Set<PaletteCategoryLabel>(['Core', 'Flow']);
    case 'port-agent-bottom':
      // From AI Agent bottom ports → allow only Tools
      return new Set<PaletteCategoryLabel>(['Tools']);
    case 'connector-insert':
      // Inserting into an existing connector → only Core & Flow nodes
      return new Set<PaletteCategoryLabel>(['Core', 'Flow']);
    case 'default':
    default:
      // Show everything
      return new Set<PaletteCategoryLabel>(['Triggers', 'Core', 'Flow']);
  }
}

// Applies search and contextual filtering to categories and nodes
export function getFilteredCategories(
  categories: PaletteCategory[],
  searchTerm: string,
  context: PaletteFilterContext
): PaletteCategory[] {
  const term = (searchTerm || '').trim().toLowerCase();
  const allowedSections = getAllowedSectionsByMode(context.mode);

  return categories
    .filter((cat) => allowedSections.has(cat.name as PaletteCategoryLabel))
    .map((cat) => ({
      ...cat,
      nodes: cat.nodes.filter((node) =>
        term === ''
          ? true
          : node.name.toLowerCase().includes(term) ||
            (node.description || '').toLowerCase().includes(term)
      ),
    }))
    .filter((cat) => cat.nodes.length > 0);
}
