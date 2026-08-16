import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAllInventoryItems, adjustInventoryStock } from '../services/inventoryAdmin';
import { useAuthStore } from '../store/authStore';
import {
    buildReceiptNote,
    formatStock,
    receiptAmount,
    referenceSizeMl,
    sizeOptionsFor,
    unitLabel,
    usesBottles,
} from '../utils/inventoryUnits';

const CUSTOM_SIZE = 'custom';

const CARD = {
    background: '#181818',
    border: '1px solid #2f2f2f',
    borderRadius: '14px',
};

const INPUT = {
    padding: '12px 14px',
    borderRadius: '10px',
    border: '1px solid #444',
    background: '#111',
    color: 'white',
    outline: 'none',
    fontSize: '15px',
};

const emptyForm = { bottles: '', sizeMl: '', customMl: '', amount: '', note: '' };

function InventoryPage() {
    const navigate = useNavigate();
    const currentUser = useAuthStore(state => state.user);

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState('');
    const [status, setStatus] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const [receivingId, setReceivingId] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [isSaving, setIsSaving] = useState(false);

    const loadInventory = useCallback(async () => {
        setLoading(true);
        setLoadError('');

        const { data, error } = await getAllInventoryItems();

        if (error) {
            setLoadError(`Error cargando inventario: ${error.message}`);
        } else {
            setItems(data || []);
        }

        setLoading(false);
    }, []);

    useEffect(() => {
        loadInventory();
    }, [loadInventory]);

    // Solo insumos activos, en orden alfabético. El orden se aplica aquí y no en
    // getAllInventoryItems porque ese servicio lo comparte InventoryItemsAdminPage.
    const activeItems = useMemo(() => {
        return (items || [])
            .filter(item => item.active)
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'));
    }, [items]);

    const filteredItems = useMemo(() => {
        const search = searchTerm.trim().toLowerCase();
        if (!search) return activeItems;
        return activeItems.filter(item => (item.name || '').toLowerCase().includes(search));
    }, [activeItems, searchTerm]);

    const summary = useMemo(() => ({
        total: activeItems.length,
        noStock: activeItems.filter(item => Number(item.current_stock || 0) <= 0).length,
    }), [activeItems]);

    function openReceive(item) {
        setStatus('');
        setReceivingId(item.id);
        setForm({
            ...emptyForm,
            sizeMl: usesBottles(item) ? String(referenceSizeMl(item)) : '',
        });
    }

    function closeReceive() {
        setReceivingId(null);
        setForm(emptyForm);
    }

    function effectiveSizeMl(item) {
        if (!usesBottles(item)) return 0;
        if (form.sizeMl === CUSTOM_SIZE) return Number(form.customMl) || 0;
        return Number(form.sizeMl) || 0;
    }

    function pendingAmount(item) {
        return receiptAmount({
            item,
            bottles: form.bottles,
            sizeMl: effectiveSizeMl(item),
            amount: form.amount,
        });
    }

    async function handleReceive(item) {
        const amount = pendingAmount(item);

        if (amount <= 0) {
            setStatus('Captura una cantidad mayor a cero.');
            return;
        }

        setIsSaving(true);

        const { error, data: newStock } = await adjustInventoryStock({
            id: item.id,
            amount,
            type: 'entry',
            note: buildReceiptNote({
                item,
                bottles: form.bottles,
                sizeMl: effectiveSizeMl(item),
                amount: form.amount,
                userNote: form.note,
            }),
            userId: currentUser?.id,
        });

        setIsSaving(false);

        if (error) {
            setStatus(`Error al registrar la entrada: ${error.message}`);
            return;
        }

        setStatus(`${item.name}: +${amount} ${unitLabel(item.unit_type)} · existencia ahora ${newStock} ${unitLabel(item.unit_type)}`);
        closeReceive();
        await loadInventory();
    }

    function renderReceivePanel(item) {
        const byBottles = usesBottles(item);
        const sizeMl = effectiveSizeMl(item);
        const amount = pendingAmount(item);
        const label = unitLabel(item.unit_type);
        const newStock = Number(item.current_stock || 0) + amount;

        return (
            <div
                style={{
                    marginTop: '14px',
                    padding: '16px',
                    background: '#101010',
                    border: '1px solid #2a2a2a',
                    borderRadius: '12px',
                }}
            >
                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
                    {byBottles ? (
                        <>
                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', opacity: 0.75 }}>
                                    Botellas
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    inputMode="decimal"
                                    autoFocus
                                    placeholder="0"
                                    value={form.bottles}
                                    onChange={(e) => setForm(prev => ({ ...prev, bottles: e.target.value }))}
                                    style={{ ...INPUT, width: '110px' }}
                                />
                            </div>

                            <div>
                                <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', opacity: 0.75 }}>
                                    Tamaño
                                </label>
                                <select
                                    value={form.sizeMl}
                                    onChange={(e) => setForm(prev => ({ ...prev, sizeMl: e.target.value }))}
                                    style={{ ...INPUT, minWidth: '170px' }}
                                >
                                    {sizeOptionsFor(item).map(option => (
                                        <option key={option.ml} value={String(option.ml)}>{option.label}</option>
                                    ))}
                                    <option value={CUSTOM_SIZE}>Otro…</option>
                                </select>
                            </div>

                            {form.sizeMl === CUSTOM_SIZE && (
                                <div>
                                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', opacity: 0.75 }}>
                                        ml por botella
                                    </label>
                                    <input
                                        type="number"
                                        min="0"
                                        step="1"
                                        inputMode="decimal"
                                        placeholder="ml"
                                        value={form.customMl}
                                        onChange={(e) => setForm(prev => ({ ...prev, customMl: e.target.value }))}
                                        style={{ ...INPUT, width: '110px' }}
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', opacity: 0.75 }}>
                                Cantidad ({label})
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="any"
                                inputMode="decimal"
                                autoFocus
                                placeholder="0"
                                value={form.amount}
                                onChange={(e) => setForm(prev => ({ ...prev, amount: e.target.value }))}
                                style={{ ...INPUT, width: '130px' }}
                            />
                        </div>
                    )}

                    <div style={{ flex: '1 1 220px', minWidth: '200px' }}>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '13px', opacity: 0.75 }}>
                            Nota (opcional)
                        </label>
                        <input
                            type="text"
                            placeholder="Pedido La Europea"
                            value={form.note}
                            onChange={(e) => setForm(prev => ({ ...prev, note: e.target.value }))}
                            style={{ ...INPUT, width: '100%', boxSizing: 'border-box' }}
                        />
                    </div>
                </div>

                <div
                    style={{
                        marginTop: '14px',
                        padding: '12px 14px',
                        background: amount > 0 ? '#13251a' : '#161616',
                        border: `1px solid ${amount > 0 ? '#2e7d32' : '#2a2a2a'}`,
                        borderRadius: '10px',
                        fontSize: '14px',
                        lineHeight: 1.6,
                    }}
                >
                    {amount > 0 ? (
                        <>
                            <div>
                                {byBottles
                                    ? `${Number(form.bottles)} bot × ${sizeMl} ml = `
                                    : ''}
                                <strong>{amount} {label}</strong>
                            </div>
                            <div style={{ opacity: 0.8 }}>
                                Nuevo total: <strong>{newStock.toFixed(item.unit_type === 'unit' ? 0 : 2)} {label}</strong>
                            </div>
                        </>
                    ) : (
                        <span style={{ opacity: 0.6 }}>Captura la cantidad para ver el total resultante.</span>
                    )}
                </div>

                <div style={{ display: 'flex', gap: '10px', marginTop: '14px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => handleReceive(item)}
                        disabled={isSaving || amount <= 0}
                        style={{
                            padding: '12px 22px',
                            borderRadius: '10px',
                            border: 'none',
                            background: isSaving || amount <= 0 ? '#333' : '#2e7d32',
                            color: isSaving || amount <= 0 ? '#888' : 'white',
                            fontWeight: 'bold',
                            fontSize: '15px',
                            cursor: isSaving || amount <= 0 ? 'default' : 'pointer',
                        }}
                    >
                        {isSaving ? 'Guardando...' : 'Confirmar entrada'}
                    </button>

                    <button
                        onClick={closeReceive}
                        disabled={isSaving}
                        style={{
                            padding: '12px 22px',
                            borderRadius: '10px',
                            border: '1px solid #444',
                            background: 'transparent',
                            color: '#bbb',
                            fontSize: '15px',
                            cursor: 'pointer',
                        }}
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        );
    }

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
            <div style={{ maxWidth: '900px', margin: '0 auto' }}>
                {loadError && (
                    <div style={{
                        background: '#5c1f1f', color: '#ffd7d7', border: '1px solid #a33a3a',
                        borderRadius: '8px', padding: '12px 16px', marginBottom: '16px',
                    }}>
                        {loadError}
                    </div>
                )}

                <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '16px' }}>
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

                <div style={{ ...CARD, padding: '18px', marginBottom: '16px' }}>
                    <div style={{ fontSize: '26px', fontWeight: 'bold', marginBottom: '4px' }}>
                        Inventario
                    </div>
                    <div style={{ opacity: 0.75, fontSize: '14px' }}>
                        Existencias actuales y registro de mercancía recibida.
                    </div>
                </div>

                {status && (
                    <div style={{
                        background: '#13251a', color: '#cbf7d8', border: '1px solid #2e7d32',
                        borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '14px',
                    }}>
                        {status}
                    </div>
                )}

                <div
                    style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '12px',
                        marginBottom: '16px',
                    }}
                >
                    <div style={{ ...CARD, padding: '14px' }}>
                        <div style={{ opacity: 0.7, fontSize: '13px' }}>Insumos activos</div>
                        <div style={{ fontSize: '28px', fontWeight: 'bold' }}>{summary.total}</div>
                    </div>

                    <div style={{ ...CARD, padding: '14px' }}>
                        <div style={{ opacity: 0.7, fontSize: '13px' }}>Sin stock</div>
                        <div style={{ fontSize: '28px', fontWeight: 'bold', color: summary.noStock > 0 ? '#ff8c8c' : 'white' }}>
                            {summary.noStock}
                        </div>
                    </div>
                </div>

                <input
                    type="text"
                    placeholder="Buscar insumo..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ ...INPUT, width: '100%', boxSizing: 'border-box', marginBottom: '16px' }}
                />

                {loading ? (
                    <div style={{ padding: '12px 0' }}>Cargando inventario...</div>
                ) : filteredItems.length === 0 ? (
                    <div style={{ ...CARD, padding: '18px' }}>
                        No se encontraron insumos con ese filtro.
                    </div>
                ) : (
                    <div style={{ ...CARD, overflow: 'hidden' }}>
                        {filteredItems.map((item, index) => {
                            const stock = formatStock(item);
                            const isReceiving = receivingId === item.id;

                            return (
                                <div
                                    key={item.id}
                                    style={{
                                        padding: '14px 16px',
                                        borderTop: index === 0 ? 'none' : '1px solid #262626',
                                        background: isReceiving ? '#141414' : 'transparent',
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            gap: '12px',
                                            flexWrap: 'wrap',
                                        }}
                                    >
                                        <div style={{ flex: '1 1 200px', minWidth: '160px' }}>
                                            <div style={{ fontWeight: 'bold', fontSize: '15px' }}>{item.name}</div>
                                        </div>

                                        <div style={{ textAlign: 'right', minWidth: '150px' }}>
                                            <div
                                                style={{
                                                    fontSize: '15px',
                                                    fontWeight: 'bold',
                                                    color: Number(item.current_stock || 0) <= 0 ? '#ff8c8c' : 'white',
                                                }}
                                            >
                                                {stock.primary}
                                            </div>
                                            {stock.secondary && (
                                                <div style={{ fontSize: '12px', opacity: 0.6, marginTop: '2px' }}>
                                                    {stock.secondary}
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            onClick={() => (isReceiving ? closeReceive() : openReceive(item))}
                                            style={{
                                                padding: '10px 16px',
                                                borderRadius: '10px',
                                                border: '1px solid #2e7d32',
                                                background: isReceiving ? '#2e7d32' : 'transparent',
                                                color: isReceiving ? 'white' : '#9ccc65',
                                                cursor: 'pointer',
                                                fontWeight: 'bold',
                                                fontSize: '14px',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {isReceiving ? 'Cerrar' : 'Recibir'}
                                        </button>
                                    </div>

                                    {isReceiving && renderReceivePanel(item)}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default InventoryPage;
