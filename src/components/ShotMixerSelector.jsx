function ShotMixerSelector({
    state,
    availableMixers,
    requiredMixers,
    isAddingProduct,
    onSelectMixer,
    onRemoveMixer,
    onConfirm,
    onCancel,
}) {
    if (!state.open) return null;

    return (
        <section
            style={{
                border: '1px solid #5f35a8',
                borderRadius: '8px',
                padding: '16px',
                marginBottom: '16px',
                background: '#1f1530',
            }}
        >
            <h2 style={{ marginTop: 0, marginBottom: '8px' }}>
                Seleccionar mixers para {state.shotProduct?.name}
            </h2>

            <div style={{ marginBottom: '12px', opacity: 0.9 }}>
                Elige {requiredMixers} mixer(s). Seleccionados:{' '}
                {state.selectedMixers.length} / {requiredMixers}
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: '10px',
                }}
            >
                {availableMixers.map((mixer) => {
                    const selectedCount = state.selectedMixers.filter(
                        (item) => item.id === mixer.id
                    ).length;

                    return (
                        <button
                            key={mixer.id}
                            type="button"
                            onClick={() => onSelectMixer(mixer)}
                            style={{
                                borderLeft: `6px solid ${selectedCount > 0 ? '#2e7d32' : '#777'}`,
                                borderRadius: '8px',
                                borderTop: '1px solid #444',
                                borderRight: '1px solid #444',
                                borderBottom: '1px solid #444',
                                background: selectedCount > 0 ? '#1f3a25' : '#222',
                                color: 'white',
                                padding: '14px',
                                textAlign: 'left',
                                cursor: 'pointer',
                            }}
                        >
                            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                                {mixer.name}
                            </div>
                            <div style={{ fontSize: '13px', opacity: 0.85, marginTop: '6px' }}>
                                Mixer gratis
                                {selectedCount > 0 ? ` • Seleccionado: ${selectedCount}` : ''}
                            </div>
                        </button>
                    );
                })}
            </div>

            {state.selectedMixers.length > 0 && (
                <div
                    style={{
                        marginTop: '14px',
                        padding: '12px',
                        borderRadius: '8px',
                        background: '#181818',
                        border: '1px solid #333',
                    }}
                >
                    <div style={{ marginBottom: '10px', fontWeight: 'bold' }}>
                        Mixers seleccionados
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {state.selectedMixers.map((mixer, index) => (
                            <button
                                key={`${mixer.id}-${index}`}
                                type="button"
                                onClick={() => onRemoveMixer(index)}
                                style={{
                                    padding: '8px 10px',
                                    borderRadius: '999px',
                                    border: '1px solid #555',
                                    background: '#222',
                                    color: 'white',
                                    cursor: 'pointer',
                                }}
                            >
                                {mixer.name} ×
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <div
                style={{
                    marginTop: '14px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '10px',
                }}
            >
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={
                        isAddingProduct ||
                        state.selectedMixers.length !== requiredMixers
                    }
                    style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: 'none',
                        background:
                            state.selectedMixers.length === requiredMixers
                                ? '#2e7d32'
                                : '#666',
                        color: 'white',
                        cursor:
                            state.selectedMixers.length === requiredMixers
                                ? 'pointer'
                                : 'not-allowed',
                        fontWeight: 'bold',
                    }}
                >
                    Confirmar shot
                </button>

                <button
                    type="button"
                    onClick={onCancel}
                    disabled={isAddingProduct}
                    style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: '1px solid #555',
                        background: '#222',
                        color: 'white',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                    }}
                >
                    Cancelar
                </button>
            </div>
        </section>
    );
}

export default ShotMixerSelector;