// Add a new entry here whenever a new category is created in Supabase.
// Default color for any unrecognized category is #444.
const categoryColors = {
    'A. Cerveza':            '#1565c0',
    'B. Tequilas':           '#ef6c00',
    'C. Whisky':             '#6d4c41',
    'D. Ron':                '#00897b',
    'E. Brandy':             '#9e9d24',
    'F. Mezcal':             '#d84315',
    'G. Cognac':             '#4527a0',
    'H. Ginebra':            '#00acc1',
    'I. Preparadas':         '#ad1457',
    'J. Shots':              '#fbc02d',
    'K. Promociones':        '#8e24aa',
    'L. Vodka':              '#5e35b1',
    'M. Membresias':         '#3949ab',
    'N. Bebidas sin alcohol':'#2e7d32',
    'O. Alimentos':          '#c62828',
}

export function getCategoryColor(categoryName) {
    return categoryColors[categoryName] ?? '#444'
}
