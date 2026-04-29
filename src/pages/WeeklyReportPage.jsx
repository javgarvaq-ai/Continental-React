import { useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { useNavigate } from 'react-router-dom';

function money(value) {
    return `$${Number(value || 0).toFixed(2)}`;
}

function WeeklyReportPage() {
    const today = new Date();
    const navigate = useNavigate();

    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());

    const [startDate, setStartDate] = useState(
        startOfWeek.toISOString().slice(0, 10)
    );
    const [endDate, setEndDate] = useState(
        today.toISOString().slice(0, 10)
    );

    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');
    const [payments, setPayments] = useState([]);
    const [cashMovements, setCashMovements] = useState([]);
    const [comandas, setComandas] = useState([]);

    useEffect(() => {
        loadWeeklyData();
    }, [startDate, endDate]);

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

        const startIso = `${startDate}T00:00:00`;
        const endIso = `${endDate}T23:59:59`;

        const [paymentsResult, cashMovementsResult, comandasResult] = await Promise.all([
            supabase
                .from('payments')
                .select(`
                    *,
                    comandas (
                        id,
                        folio,
                        final_total,
                        tip_total,
                        status,
                        cobrado_at
                    )
                `)
                .gte('created_at', startIso)
                .lte('created_at', endIso),

            supabase
                .from('cash_movements')
                .select('*')
                .gte('created_at', startIso)
                .lte('created_at', endIso),

            supabase
                .from('comandas')
                .select('*')
                .eq('status', 'paid')
                .gte('cobrado_at', startIso)
                .lte('cobrado_at', endIso),
        ]);

        if (paymentsResult.error) {
            setStatus(`Error cargando pagos: ${paymentsResult.error.message}`);
            setLoading(false);
            return;
        }

        if (cashMovementsResult.error) {
            setStatus(`Error cargando movimientos: ${cashMovementsResult.error.message}`);
            setLoading(false);
            return;
        }

        if (comandasResult.error) {
            setStatus(`Error cargando comandas: ${comandasResult.error.message}`);
            setLoading(false);
            return;
        }

        setPayments(paymentsResult.data || []);
        setCashMovements(cashMovementsResult.data || []);
        setComandas(comandasResult.data || []);
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

    return (
        <div style={{ padding: '16px', color: 'white' }}>
            <button
                onClick={() => navigate('/pos')}
                style={{
                    marginBottom: '12px',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #555',
                    background: '#222',
                    color: 'white',
                    cursor: 'pointer',
                    fontWeight: 'bold',
                }}
            >
                ← Volver al POS
            </button>
            <h2>Reporte semanal</h2>

            <div style={{ marginBottom: '16px' }}>
                <label style={{ marginRight: '8px' }}>Desde:</label>
                <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                />

                <label style={{ margin: '0 8px' }}>Hasta:</label>
                <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                />
            </div>

            <div
                style={{
                    padding: '16px',
                    border: '1px solid #444',
                    borderRadius: '10px',
                    background: '#181818',
                    marginBottom: '16px',
                }}
            >
                <div>{loading ? 'Cargando...' : status}</div>
                <div style={{ marginTop: '10px' }}>Pagos: {payments.length}</div>
                <div>Movimientos de caja: {cashMovements.length}</div>
                <div>Comandas pagadas: {comandas.length}</div>
            </div>

            <div
                style={{
                    padding: '16px',
                    border: '1px solid #444',
                    borderRadius: '10px',
                    background: '#181818',
                    display: 'grid',
                    gap: '8px',
                }}
            >
                <div>Ventas totales: {money(totalSales)}</div>
                <div>Efectivo neto recibido: {money(totalCashSales)}</div>
                <div>Tarjeta: {money(totalCardSales)}</div>
                <div>Transferencia: {money(totalTransferSales)}</div>
                <div>Propinas: {money(totalTips)}</div>
                <div>Entradas a caja: {money(totalDrawerIn)}</div>
                <div>Salidas de caja: {money(totalDrawerOut)}</div>
                <div>Gastos totales: {money(totalExpenses)}</div>
                <div>Traslados a resguardo: {money(totalTransfersToHouse)}</div>
                <div>Traslados a banco: {money(totalTransfersToBank)}</div>
                <div>Gastos pagados desde banco: {money(totalBankExpenses)}</div>
                <div style={{ fontWeight: 'bold', marginTop: '8px' }}>
                    Utilidad estimada: {money(estimatedUtility)}
                </div>
            </div>
            <div
                style={{
                    padding: '16px',
                    border: '1px solid #444',
                    borderRadius: '10px',
                    background: '#181818',
                    marginTop: '16px',
                }}
            >
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                    Desglose de gastos
                </div>

                {Object.entries(expensesByCategory).length === 0 ? (
                    <div>No hay gastos registrados.</div>
                ) : (
                    Object.entries(expensesByCategory).map(([key, value]) => (
                        <div key={key}>
                            {formatCategoryName(key)}: {money(value)}
                        </div>
                    ))
                )}
            </div>
            <div
                style={{
                    padding: '16px',
                    border: '1px solid #444',
                    borderRadius: '10px',
                    background: '#181818',
                    marginTop: '16px',
                }}
            >
                <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>
                    Posición de dinero
                </div>

                <div>Saldo estimado en caja: {money(estimatedDrawerPosition)}</div>
                <div>Saldo operativo en resguardo: {money(operationalHouseBalance)}</div>
                <div>Saldo operativo en banco: {money(operationalBankBalance)}</div>
                <div style={{ marginTop: '8px', opacity: 0.8 }}>
                    Estos valores representan movimiento neto dentro del rango seleccionado.
                </div>
            </div>
        </div>
    );
}

export default WeeklyReportPage;