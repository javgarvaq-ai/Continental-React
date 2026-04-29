import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';

function InventoryPage() {
    const navigate = useNavigate();

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [unitFilter, setUnitFilter] = useState('all');

    useEffect(() => {
        loadInventory();
    }, []);

    async function loadInventory() {
        setLoading(true);

        const { data, error } = await supabase
            .from('inventory_items')
            .select('*')
            .order('name', { ascending: true });

        if (!error) {
            setItems(data || []);
        }

        setLoading(false);
    }

    function formatStock(item) {
        const stock = Number(item.current_stock || 0);

        if (item.unit_type === 'oz') {
            const ml = stock * 29.5735;
            const capacityOz = Number(item.capacity_oz || 0);

            if (capacityOz > 0) {
                const bottles = stock / capacityOz;
                return `${stock.toFixed(2)} oz • ${ml.toFixed(0)} ml • ${bottles.toFixed(2)} bot`;
            }

            return `${stock.toFixed(2)} oz • ${ml.toFixed(0)} ml`;
        }

        return `${stock.toFixed(0)} pzas`;
    }

    function getStockStatus(item) {
        const stock = Number(item.current_stock || 0);

        if (stock <= 0) {
            return {
                label: 'Sin stock',
                bg: '#5c1f1f',
                color: '#ffd7d7',
                border: '#a33a3a',
            };
        }

        if (item.unit_type === 'unit') {
            if (stock <= 5) {
                return {
                    label: 'Bajo',
                    bg: '#5a4214',
                    color: '#ffe9b3',
                    border: '#b98924',
                };
            }

            return {
                label: 'OK',
                bg: '#183a25',
                color: '#cbf7d8',
                border: '#2e7d32',
            };
        }

        if (item.unit_type === 'oz') {
            const capacityOz = Number(item.capacity_oz || 0);

            if (capacityOz > 0) {
                const bottles = stock / capacityOz;

                if (bottles <= 0.25) {
                    return {
                        label: 'Muy bajo',
                        bg: '#5c1f1f',
                        color: '#ffd7d7',
                        border: '#a33a3a',
                    };
                }

                if (bottles <= 1) {
                    return {
                        label: 'Bajo',
                        bg: '#5a4214',
                        color: '#ffe9b3',
                        border: '#b98924',
                    };
                }
            }

            return {
                label: 'OK',
                bg: '#183a25',
                color: '#cbf7d8',
                border: '#2e7d32',
            };
        }

        return {
            label: 'OK',
            bg: '#183a25',
            color: '#cbf7d8',
            border: '#2e7d32',
        };
    }

    const filteredItems = useMemo(() => {
        const search = searchTerm.trim().toLowerCase();

        return items.filter((item) => {
            const matchesSearch =
                !search ||
                item.name?.toLowerCase().includes(search);

            const matchesUnit =
                unitFilter === 'all' || item.unit_type === unitFilter;

            return matchesSearch && matchesUnit;
        });
    }, [items, searchTerm, unitFilter]);


    const summary = useMemo(() => {
        const total = items.length;
        const unitCount = items.filter((item) => item.unit_type === 'unit').length;
        const ozCount = items.filter((item) => item.unit_type === 'oz').length;
        const noStock = items.filter((item) => Number(item.current_stock || 0) <= 0).length;

        return {
            total,
            unitCount,
            ozCount,
            noStock,
        };
    }, [items]);

    return (
        <div
            style={{
                minHeight: '100vh',
                background: '#111',
                color: 'white',
                padding: '24px',
                boxSizing: 'border-box',
            }}
        >
            <div
                style={{
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    marginBottom: '16px',
                }}
            >
                <button
                    onClick={() => navigate('/pos')}
                    style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid #555',
                        background: '#222',
                        color: 'white',
                        cursor: 'pointer',
                        fontWeight: 'bold',
                    }}
                >
                    ← Volver al POS
                </button>

                <button
                    onClick={loadInventory}
                    disabled={loading}
                    style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid #444',
                        background: loading ? '#2a2a2a' : '#1c1c1c',
                        color: 'white',
                        cursor: loading ? 'default' : 'pointer',
                        fontWeight: 'bold',
                    }}
                >
                    {loading ? 'Cargando...' : 'Recargar'}
                </button>
            </div>

            <div
                style={{
                    marginBottom: '18px',
                    padding: '18px',
                    background: '#181818',
                    border: '1px solid #2f2f2f',
                    borderRadius: '14px',
                }}
            >
                <div
                    style={{
                        fontSize: '28px',
                        fontWeight: 'bold',
                        marginBottom: '6px',
                    }}
                >
                    Inventario
                </div>

                <div
                    style={{
                        opacity: 0.8,
                        fontSize: '14px',
                    }}
                >
                    Vista rápida para revisar existencias y validar cambios durante pruebas.
                </div>
            </div>

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: '12px',
                    marginBottom: '18px',
                }}
            >
                <div
                    style={{
                        background: '#181818',
                        border: '1px solid #2f2f2f',
                        borderRadius: '12px',
                        padding: '14px',
                    }}
                >
                    <div style={{ opacity: 0.7, fontSize: '13px' }}>Items totales</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{summary.total}</div>
                </div>

                <div
                    style={{
                        background: '#181818',
                        border: '1px solid #2f2f2f',
                        borderRadius: '12px',
                        padding: '14px',
                    }}
                >
                    <div style={{ opacity: 0.7, fontSize: '13px' }}>Por piezas</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{summary.unitCount}</div>
                </div>

                <div
                    style={{
                        background: '#181818',
                        border: '1px solid #2f2f2f',
                        borderRadius: '12px',
                        padding: '14px',
                    }}
                >
                    <div style={{ opacity: 0.7, fontSize: '13px' }}>Por onzas</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{summary.ozCount}</div>
                </div>

                <div
                    style={{
                        background: '#181818',
                        border: '1px solid #2f2f2f',
                        borderRadius: '12px',
                        padding: '14px',
                    }}
                >
                    <div style={{ opacity: 0.7, fontSize: '13px' }}>Sin stock</div>
                    <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#ff8c8c' }}>
                        {summary.noStock}
                    </div>
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    gap: '12px',
                    flexWrap: 'wrap',
                    marginBottom: '18px',
                    padding: '16px',
                    background: '#181818',
                    border: '1px solid #2f2f2f',
                    borderRadius: '14px',
                }}
            >
                <input
                    type="text"
                    placeholder="Buscar inventario..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                        flex: '1 1 280px',
                        minWidth: '220px',
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: '1px solid #444',
                        background: '#111',
                        color: 'white',
                        outline: 'none',
                    }}
                />

                <select
                    value={unitFilter}
                    onChange={(e) => setUnitFilter(e.target.value)}
                    style={{
                        padding: '12px 14px',
                        borderRadius: '10px',
                        border: '1px solid #444',
                        background: '#111',
                        color: 'white',
                        minWidth: '180px',
                    }}
                >
                    <option value="all">Todos los tipos</option>
                    <option value="unit">Solo piezas</option>
                    <option value="oz">Solo onzas</option>
                </select>
            </div>

            {loading ? (
                <div style={{ padding: '12px 0' }}>Cargando inventario...</div>
            ) : filteredItems.length === 0 ? (
                <div
                    style={{
                        padding: '18px',
                        background: '#181818',
                        border: '1px solid #2f2f2f',
                        borderRadius: '14px',
                    }}
                >
                    No se encontraron items con ese filtro.
                </div>
            ) : (
                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
                        gap: '12px',
                    }}
                >
                    {filteredItems.map((item) => {
                        const status = getStockStatus(item);

                        return (
                            <div
                                key={item.id}
                                style={{
                                    background: '#181818',
                                    border: '1px solid #333',
                                    borderRadius: '14px',
                                    padding: '14px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'flex-start',
                                        gap: '10px',
                                    }}
                                >
                                    <div>
                                        <div
                                            style={{
                                                fontWeight: 'bold',
                                                fontSize: '16px',
                                                lineHeight: 1.2,
                                            }}
                                        >
                                            {item.name}
                                        </div>

                                        <div
                                            style={{
                                                marginTop: '6px',
                                                fontSize: '13px',
                                                opacity: 0.7,
                                            }}
                                        >
                                            Tipo: {item.unit_type === 'oz' ? 'Onzas' : 'Piezas'}
                                        </div>
                                    </div>

                                    <div
                                        style={{
                                            padding: '5px 9px',
                                            borderRadius: '999px',
                                            background: status.bg,
                                            color: status.color,
                                            border: `1px solid ${status.border}`,
                                            fontSize: '12px',
                                            fontWeight: 'bold',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {status.label}
                                    </div>
                                </div>

                                <div
                                    style={{
                                        padding: '12px',
                                        background: '#101010',
                                        border: '1px solid #2a2a2a',
                                        borderRadius: '10px',
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: '13px',
                                            opacity: 0.7,
                                            marginBottom: '4px',
                                        }}
                                    >
                                        Existencia actual
                                    </div>

                                    <div
                                        style={{
                                            fontSize: '18px',
                                            fontWeight: 'bold',
                                            lineHeight: 1.3,
                                        }}
                                    >
                                        {formatStock(item)}
                                    </div>
                                </div>

                                {item.unit_type === 'oz' && item.capacity_oz ? (
                                    <div
                                        style={{
                                            fontSize: '13px',
                                            opacity: 0.78,
                                        }}
                                    >
                                        Capacidad por botella: {Number(item.capacity_oz).toFixed(2)} oz
                                    </div>
                                ) : null}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default InventoryPage;