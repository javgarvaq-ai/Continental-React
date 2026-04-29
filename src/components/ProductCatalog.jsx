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
    return (
        <section
            style={{
                border: '1px solid #444',
                borderRadius: '8px',
                padding: '16px',
            }}
        >
            <h2>Productos</h2>

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

            {Object.keys(groupedProducts)
                .sort((a, b) => a.localeCompare(b))
                .map((categoryName) => (
                    <div key={categoryName} style={{ marginBottom: '18px' }}>
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