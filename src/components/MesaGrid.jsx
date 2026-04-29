function MesaGrid({ units, onUnitClick }) {
    return (
        <main>
            <h2>Mesas</h2>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    gap: '12px',
                    marginTop: '16px',
                }}
            >
                {units.map((unit) => (
                    <button
                        key={unit.id}
                        type="button"
                        onClick={() => onUnitClick(unit)}
                        style={{
                            backgroundColor: unit.bgColor,
                            color: 'white',
                            border: 'none',
                            borderRadius: '10px',
                            padding: '16px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            minHeight: '110px',
                        }}
                    >
                        <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '8px' }}>
                            {unit.name}
                        </div>
                        <div style={{ marginBottom: '6px' }}>{unit.statusLabel}</div>
                        {unit.customerName ? (
                            <div style={{ fontSize: '14px', opacity: 0.95 }}>
                                Cliente: {unit.customerName}
                            </div>
                        ) : null}
                    </button>
                ))}
            </div>
        </main>
    );
}

export default MesaGrid;