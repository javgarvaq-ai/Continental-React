import { useEffect, useState } from 'react';
import { useStatus } from '../hooks/useStatus';
import { getWeeklyReportData } from '../services/reports';
import { useNavigate } from 'react-router-dom';
import { money } from '../utils/money';

function WeeklyReportPage() {
    const today = new Date();
    const navigate = useNavigate();

    const startOfWeek = new Date(today);
    // Week starts on Monday (aligns with employee schedule)
    // getDay: 0=Sun → go back 6 days, 1=Mon → 0, 2=Tue → 1, etc.
    const dayOfWeek = today.getDay();
    startOfWeek.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

    // Use local date (not UTC) so the default range is correct in Mexico timezone
    function toLocalDateString(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    const [startDate, setStartDate] = useState(toLocalDateString(startOfWeek));
    const [endDate, setEndDate] = useState(toLocalDateString(today));

    const [loading, setLoading] = useState(false);
    const { status, statusColor, setStatus } = useStatus('');
    const [payments, setPayments] = useState([]);
    const [cashMovements, setCashMovements] = useState([]);
    const [comandas, setComandas] = useState([]);

    useEffect(() => {
        loadWeeklyData();
    }, []);

    function formatCategoryName(category) {
        const map = {
            pago_proveedor_banco: 'Pago proveedor (banco)',
            pago_proveedor_caja: 'Pago proveedor (caja)',
            nomina_caja: 'Nómina (caja)',
            nomina_banco: 'Nómina (banco)',
            renta_caja: 'Renta (caja)',
            renta_banco: 'Renta (banco)',
            propinas_entregadas: 'Propinas entregadas',
            gasto_operativo_caja: 'Gasto operativo (caja)',
            gasto_operativo_banco: 'Gasto operativo (banco)',
        };

        return map[category] || category;
    }
    async function loadWeeklyData() {
        setLoading(true);
        setStatus('Cargando reporte semanal...');

        const { payments, cashMovements, comandas, paymentsError, cashMovementsError, comandasError } =
            await getWeeklyReportData({ startDate, endDate });

        if (paymentsError) {
            setStatus(`Error cargando pagos: ${paymentsError.message}`);
            setLoading(false);
            return;
        }

        if (cashMovementsError) {
            setStatus(`Error cargando movimientos: ${cashMovementsError.message}`);
            setLoading(false);
            return;
        }

        if (comandasError) {
            setStatus(`Error cargando comandas: ${comandasError.message}`);
            setLoading(false);
            return;
        }

        setPayments(payments || []);
        setCashMovements(cashMovements || []);
        setComandas(comandas || []);
        setStatus('Reporte semanal cargado.');
        setLoading(false);
    }

    const totalSales = comandas.reduce(
        (sum, c) => sum + Number(c.final_total || 0),
        0
    );

    const totalCashSales = payments.reduce(
        (sum, p) => sum + Number(p.efectivo || 0),
        0
    );

    const totalCardSales = payments.reduce(
        (sum, p) => sum + Number(p.tarjeta || 0),
        0
    );

    const totalTransferSales = payments.reduce(
        (sum, p) => sum + Number(p.transferencia || 0),
        0
    );

    const totalTips = payments.reduce(
        (sum, p) => sum + Number((p.tip_amount ?? p.comandas?.tip_total) || 0),
        0
    );

    const totalDrawerOut = cashMovements.reduce((sum, m) => {
        if (m.source_location === 'drawer') {
            return sum + Number(m.amount || 0);
        }
        return sum;
    }, 0);

    const totalDrawerIn = cashMovements.reduce((sum, m) => {
        if (m.destination_location === 'drawer') {
            return sum + Number(m.amount || 0);
        }
        return sum;
    }, 0);

    const totalExpenses = cashMovements.reduce((sum, m) => {
        if (m.movement_nature === 'expense') {
            return sum + Number(m.amount || 0);
        }
        return sum;
    }, 0);

    const totalTransfersToHouse = cashMovements.reduce((sum, m) => {
        if (m.destination_location === 'house_safe') {
            return sum + Number(m.amount || 0);
        }
        return sum;
    }, 0);

    const totalTransfersToBank = cashMovements.reduce((sum, m) => {
        if (m.destination_location === 'bank') {
            return sum + Number(m.amount || 0);
        }
        return sum;
    }, 0);

    const totalBankExpenses = cashMovements.reduce((sum, m) => {
        if (
            m.source_location === 'bank' &&
            m.movement_nature === 'expense'
        ) {
            return sum + Number(m.amount || 0);
        }
        return sum;
    }, 0);

    const estimatedUtility = totalSales - totalExpenses;
    const expensesByCategory = cashMovements.reduce((acc, m) => {
        if (m.movement_nature === 'expense') {
            const key = m.category || 'otros';
            acc[key] = (acc[key] || 0) + Number(m.amount || 0);
        }
        return acc;
    }, {});
    const totalFromHouseToDrawer = cashMovements.reduce((sum, m) => {
        if (
            m.source_location === 'house_safe' &&
            m.destination_location === 'drawer'
        ) {
            return sum + Number(m.amount || 0);
        }
        return sum;
    }, 0);

    const totalFromBankToDrawer = cashMovements.reduce((sum, m) => {
        if (
            m.source_location === 'bank' &&
            m.destination_location === 'drawer'
        ) {
            return sum + Number(m.amount || 0);
        }
        return sum;
    }, 0);

    const operationalHouseBalance =
        totalTransfersToHouse - totalFromHouseToDrawer;

    const operationalBankBalance =
        totalCardSales +
        totalTransferSales +
        totalTransfersToBank -
        totalFromBankToDrawer -
        totalBankExpenses;

    const estimatedDrawerPosition =
        totalCashSales + totalDrawerIn - totalDrawerOut;

    const GREEN = '#4ade80';
    const RED = '#f87171';
    const BLUE = '#60a5fa';
    const YELLOW = '#facc15';
    const MUTED = '#94a3b8';

    const sectionCard = {
        padding: '20px',
        border: '1px solid #2a2a2a',
        borderRadius: '12px',
        background: '#1a1a1a',
        marginBottom: '14px',
    };

    const sectionTitle = {
        fontSize: '11px',
        fontWeight: '700',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: MUTED,
        marginBottom: '16px',
    };

    function MetricCard({ label, value, color = 'white', accent }) {
        return (
            <div style={{
                padding: '14px 16px',
                background: '#1a1a1a',
                border: '1px solid #2a2a2a',
                borderLeft: `3px solid ${accent || color}`,
                borderRadius: '8px',
            }}>
                <div style={{ fontSize: '11px', color: MUTED, marginBottom: '6px' }}>{label}</div>
                <div style={{ fontSize: '18px', fontWeight: '700', color }}>{value}</div>
            </div>
        );
    }

    return (
        <div style={{ padding: '20px', color: 'white', maxWidth: '860px' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
                <button
                    onClick={() => navigate('/pos')}
                    style={{
                        padding: '7px 12px',
                        borderRadius: '8px',
                        border: '1px solid #333',
                        background: '#222',
                        color: MUTED,
                        cursor: 'pointer',
                        fontSize: '14px',
                    }}
                >
                    ← POS
                </button>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700' }}>Reporte semanal</h2>
            </div>

            {/* Date Range Bar */}
            <div style={{
                ...sectionCard,
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                flexWrap: 'wrap',
                padding: '14px 18px',
            }}>
                <span style={{ fontSize: '13px', color: MUTED }}>Período</span>
                <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    style={{ background: '#111', border: '1px solid #333', borderRadius: '6px', color: 'white', padding: '6px 10px', fontSize: '13px' }}
                />
                <span style={{ color: '#444' }}>—</span>
                <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    style={{ background: '#111', border: '1px solid #333', borderRadius: '6px', color: 'white', padding: '6px 10px', fontSize: '13px' }}
                />
                <button
                    onClick={loadWeeklyData}
                    disabled={loading}
                    style={{
                        padding: '7px 18px',
                        borderRadius: '8px',
                        border: 'none',
                        background: loading ? '#333' : '#1565c0',
                        color: loading ? MUTED : 'white',
                        fontWeight: '700',
                        fontSize: '13px',
                        cursor: loading ? 'default' : 'pointer',
                        marginLeft: 'auto',
                    }}
                >
                    {loading ? 'Cargando...' : 'Cargar reporte'}
                </button>
            </div>

            {/* Status + Record Counts */}
            <div style={{ ...sectionCard, display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap', padding: '14px 18px' }}>
                <div style={{ flex: 1, fontSize: '13px', color: loading ? MUTED : statusColor }}>
                    {loading ? 'Cargando...' : status}
                </div>
                <div style={{ display: 'flex', gap: '20px' }}>
                    {[
                        { label: 'Comandas', value: comandas.length },
                        { label: 'Pagos', value: payments.length },
                        { label: 'Movimientos', value: cashMovements.length },
                    ].map(({ label, value }) => (
                        <div key={label} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '18px', fontWeight: '700' }}>{value}</div>
                            <div style={{ fontSize: '11px', color: MUTED }}>{label}</div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Ingresos */}
            <div style={sectionCard}>
                <div style={sectionTitle}>Ingresos</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                    <MetricCard label="Ventas totales" value={money(totalSales)} color={GREEN} accent={GREEN} />
                    <MetricCard label="Efectivo recibido" value={money(totalCashSales)} color={GREEN} accent="#22c55e" />
                    <MetricCard label="Tarjeta" value={money(totalCardSales)} color={BLUE} accent={BLUE} />
                    <MetricCard label="Transferencia" value={money(totalTransferSales)} color={BLUE} accent="#3b82f6" />
                    <MetricCard label="Propinas" value={money(totalTips)} color={YELLOW} accent={YELLOW} />
                </div>
            </div>

            {/* Egresos */}
            <div style={sectionCard}>
                <div style={sectionTitle}>Egresos</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '10px' }}>
                    <MetricCard label="Gastos totales (caja)" value={money(totalExpenses)} color={RED} accent={RED} />
                    <MetricCard label="Gastos desde banco" value={money(totalBankExpenses)} color={RED} accent="#ef4444" />
                    <MetricCard label="Traslados a resguardo" value={money(totalTransfersToHouse)} color={MUTED} accent="#475569" />
                    <MetricCard label="Traslados a banco" value={money(totalTransfersToBank)} color={MUTED} accent="#475569" />
                    <MetricCard label="Entradas a caja" value={money(totalDrawerIn)} color={MUTED} accent="#475569" />
                    <MetricCard label="Salidas de caja" value={money(totalDrawerOut)} color={MUTED} accent="#475569" />
                </div>
            </div>

            {/* Utilidad estimada — featured */}
            <div style={{
                ...sectionCard,
                border: `1px solid ${estimatedUtility >= 0 ? '#166534' : '#7f1d1d'}`,
                background: estimatedUtility >= 0 ? '#052e16' : '#1c0a0a',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
            }}>
                <div>
                    <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED, marginBottom: '4px' }}>
                        Utilidad estimada
                    </div>
                    <div style={{ fontSize: '11px', color: MUTED }}>Ventas totales − gastos totales del período</div>
                </div>
                <div style={{ fontSize: '32px', fontWeight: '800', color: estimatedUtility >= 0 ? GREEN : RED }}>
                    {money(estimatedUtility)}
                </div>
            </div>

            {/* Desglose de gastos */}
            <div style={sectionCard}>
                <div style={sectionTitle}>Desglose de gastos</div>
                {Object.entries(expensesByCategory).length === 0 ? (
                    <div style={{ fontSize: '13px', color: MUTED }}>No hay gastos registrados.</div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {Object.entries(expensesByCategory).map(([key, value]) => (
                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', background: '#111', borderRadius: '6px' }}>
                                <span style={{ fontSize: '13px', color: MUTED }}>{formatCategoryName(key)}</span>
                                <span style={{ fontSize: '14px', fontWeight: '600', color: RED }}>{money(value)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Posición de dinero */}
            <div style={sectionCard}>
                <div style={sectionTitle}>Posición de dinero</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', marginBottom: '12px' }}>
                    <MetricCard label="Saldo estimado en caja" value={money(estimatedDrawerPosition)} color={estimatedDrawerPosition >= 0 ? GREEN : RED} accent="#475569" />
                    <MetricCard label="Resguardo (neto del período)" value={money(operationalHouseBalance)} color={operationalHouseBalance >= 0 ? GREEN : RED} accent="#475569" />
                    <MetricCard label="Banco (neto del período)" value={money(operationalBankBalance)} color={operationalBankBalance >= 0 ? GREEN : RED} accent="#475569" />
                </div>
                <div style={{ fontSize: '11px', color: '#555' }}>
                    Valores representan movimiento neto dentro del rango seleccionado.
                </div>
            </div>
        </div>
    );
}

export default WeeklyReportPage;