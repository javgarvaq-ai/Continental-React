function MesaGrid({ units, onUnitClick }) {
    return (
        <main>
            <p style={{
                margin: '0 0 14px 0',
                fontSize: '11px',
                fontWeight: 600,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#94a3b8',
            }}>
                Mesas
            </p>
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                    gap: '10px',
                }}
            >
                {units.map((unit) => (
                    <button
                        key={unit.id}
                        type="button"
                        onClick={() => onUnitClick(unit)}
                        style={{
                            backgroundColor: '#161616',
                            color: '#e2e2e2',
                            border: '1px solid #2a2a2a',
                            borderLeft: `3px solid ${unit.statusColor}`,
                            borderRadius: '8px',
                            padding: '14px 14px 14px 12px',
                            textAlign: 'left',
                            cursor: 'pointer',
                            minHeight: '100px',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                        }}
                    >
                        <div style={{ fontSize: '17px', fontWeight: '600', marginBottom: '10px' }}>
                            {unit.name}
                        </div>
                        <div>
                            <span style={{
                                display: 'inline-block',
                                padding: '2px 8px',
                                borderRadius: '4px',
                                background: `${unit.statusColor}1a`,
                                color: unit.statusColor,
                                fontSize: '12px',
                                fontWeight: '600',
                                letterSpacing: '0.04em',
                            }}>
                                {unit.statusLabel}
                            </span>
                            {unit.customerName ? (
                                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '6px' }}>
                                    {unit.customerName}
                                </div>
                            ) : null}
                        </div>
                    </button>
                ))}
            </div>
        </main>
    )
}

export default MesaGrid
