// Add a new entry here whenever a new category is created in Supabase.
// Default color for any unrecognized category is #444.
const categoryColors = {
    'Cerveza':   '#1565c0',
    'Tequila':   '#ef6c00',
    'Whisky':    '#6d4c41',
    'Refresco':  '#2e7d32',
    'Promo':     '#8e24aa',
    'Comida':    '#c62828',
}

export function getCategoryColor(categoryName) {
    return categoryColors[categoryName] ?? '#444'
}
