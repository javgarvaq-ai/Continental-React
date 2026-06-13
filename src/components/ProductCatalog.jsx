import { useRef, useState, useEffect } from 'react';

// Approx height of the sticky category bar — used as scroll-margin so a jumped-to
// category header isn't hidden underneath the bar. Tune if the bar wraps lines.
const STICKY_BAR_OFFSET = 64;

function ProductCatalog({
    groupedProducts,
    currentComanda,
    isAddingProduct,
    isChangingCart,
    isUpdatingComandaStatus,
    shotSelectorState,
    onAddProduct,
    getCategoryColor,
    money,
}) {
    const categories = Object.keys(groupedProducts).sort((a, b) => a.localeCompare(b));

    // DOM node per category section — for scroll-to and the active-highlight observer.
    const sectionRefs = useRef({});
    const [activeCategory, setActiveCategory] = useState('');

    // Highlight the category currently in view (scroll-spy). Lightweight observer;
    // the nav works fine even if this never fires.
    useEffect(() => {
        const nodes = categories
            .map((c) => sectionRefs.current[c])
            .filter(Boolean);
        if (nodes.length === 0) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries.filter((e) => e.isIntersecting);
                if (visible.length === 0) return;
                // topmost visible section wins
                visible.sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
                const cat = visible[0].target.getAttribute('data-cat');
                if (cat) setActiveCategory(cat);
            },
            // become active when the section's top passes just under the sticky bar
            { rootMargin: `-${STICKY_BAR_OFFSET + 8}px 0px -65% 0px`, threshold: 0 },
        );

        nodes.forEach((n) => observer.observe(n));
        return () => observer.disconnect();
    }, [categories.join('|')]);

    function jumpToCategory(categoryName) {
        sectionRefs.current[categoryName]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveCategory(categoryName);
    }

    return (
        <section
            style={{
                border: '1px solid #444',
                borderRadius: '8px',
                padding: '16px',
                background: '#0f0f0f',
                color: '#e2e8f0',
            }}
        >
            <h2>Productos</h2>

            {/* Sticky category navigation bar */}
            {categories.length > 0 && (
                <div
                    style={{
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        background: '#0f0f0f',
                        borderBottom: '1px solid #2a2a2a',
                        padding: '8px 0',
                        marginBottom: '6px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px',
                    }}
                >
                    {categories.map((categoryName) => {
                        const color = getCategoryColor(categoryName);
                        const isActive = activeCategory === categoryName;
                        return (
                            <button
                                key={categoryName}
                                type="button"
                                onClick={() => jumpToCategory(categoryName)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid',
                                    borderColor: color,
                                    borderLeft: `4px solid ${color}`,
                                    background: isActive ? `${color}33` : '#181818',
                                    color: isActive ? '#fff' : '#cbd5e1',
                                    fontSize: '13px',
                                    fontWeight: isActive ? 700 : 500,
                                    cursor: 'pointer',
                                    whiteSpace: 'nowrap',
                                }}
                            >
                                {categoryName}
                            </button>
                        );
                    })}
                </div>
            )}

            {currentComanda?.status === 'pending_payment' ? (
                <div
                    style={{
                        marginBottom: '14px',
                        padding: '12px',
                        borderRadius: '8px',
                        background: '#2a1f12',
                        border: '1px solid #7a4b16',
                    }}
                >
                    Cuenta presentada. No se puede editar.
                </div>
            ) : null}

            {currentComanda?.status === 'processing_payment' ? (
                <div
                    style={{
                        marginBottom: '14px',
                        padding: '12px',
                        borderRadius: '8px',
                        background: '#1f1530',
                        border: '1px solid #5f35a8',
                    }}
                >
                    Cobro iniciado. Los productos ya no se pueden editar.
                </div>
            ) : null}

            {categories.map((categoryName) => (
                <div
                    key={categoryName}
                    data-cat={categoryName}
                    ref={(el) => { sectionRefs.current[categoryName] = el; }}
                    style={{ marginBottom: '18px', scrollMarginTop: `${STICKY_BAR_OFFSET}px` }}
                >
                    <div
                        style={{
                            margin: '10px 0 10px 0',
                            padding: '10px 12px',
                            background: '#181818',
                            borderLeft: `6px solid ${getCategoryColor(categoryName)}`,
                            borderRadius: '6px',
                            fontSize: '18px',
                            fontWeight: 'bold',
                        }}
                    >
                        {categoryName}
                    </div>

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                            gap: '10px',
                        }}
                    >
                        {groupedProducts[categoryName].map((product) => (
                            <button
                                key={product.id}
                                type="button"
                                onClick={() => onAddProduct(product)}
                                disabled={
                                    currentComanda?.status !== 'open' ||
                                    isAddingProduct ||
                                    isChangingCart ||
                                    isUpdatingComandaStatus ||
                                    shotSelectorState.open
                                }
                                style={{
                                    borderLeft: `6px solid ${getCategoryColor(categoryName)}`,
                                    borderRadius: '8px',
                                    borderTop: '1px solid #444',
                                    borderRight: '1px solid #444',
                                    borderBottom: '1px solid #444',
                                    background: '#222',
                                    color: 'white',
                                    padding: '14px',
                                    textAlign: 'left',
                                    cursor: 'pointer',
                                }}
                            >
                                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                                    {product.name}
                                </div>

                                <div style={{ fontSize: '13px', opacity: 0.85, marginTop: '6px' }}>
                                    {categoryName} • {money(product.price)}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </section>
    );
}

export default ProductCatalog;
