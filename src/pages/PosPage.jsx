import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getUnitsWithStatus } from '../services/units';
import { getOrCreateActiveComanda, cancelComanda } from '../services/comandas';
import MesaGrid from '../components/MesaGrid';
import ShotMixerSelector from '../components/ShotMixerSelector';
import PaymentPanel from '../components/PaymentPanel';
import ComandaPanel from '../components/ComandaPanel';
import ProductCatalog from '../components/ProductCatalog';
import TopBar from '../components/TopBar';
import { requireOnline } from '../utils/requireOnline';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import {
    getProductsCatalog,
    getActiveCartItems,
    addNormalProductToComanda,
    getAvailableMixersForProduct,
    addShotWithFreeMixers,
    decreaseCartItem,
    updateComandaPersonas,
} from '../services/products';
import {
    presentBill,
    reopenComanda,
    startPayment,
    confirmPayment,
} from '../services/comandaCheckout';
import { printTicket } from '../components/Ticket';
import { supabase } from '../services/supabase';
import {
    getCustomerWithMembership,
    searchCustomerByQuery,
    getCustomerByIdWithMembership,
    getAllActiveMembershipPlans,
    activateMembership,
    addFreeBenefitItemToComanda,
    processMembershipOnPayment,
} from '../services/membership';
import { getNextCustomerNumber } from '../services/customersAdmin';



function getCategoryColor(categoryName) {
    switch (categoryName) {
        case 'Cerveza':
            return '#1565c0';
        case 'Tequila':
            return '#ef6c00';
        case 'Whisky':
            return '#6d4c41';
        case 'Refresco':
            return '#2e7d32';
        case 'Promo':
            return '#8e24aa';
        case 'Comida':
            return '#c62828';
        default:
            return '#444';
    }
}

function money(value) {
    return `$${Number(value || 0).toFixed(2)}`;
}

function getPaymentSummary(totalCuenta, paymentData) {
    const efectivo = Number(paymentData.efectivo || 0);
    const tarjeta = Number(paymentData.tarjeta || 0);
    const transferencia = Number(paymentData.transferencia || 0);

    const totalRecibido = efectivo + tarjeta + transferencia;

    let propina = Number(paymentData.propina || 0);

    if (efectivo <= 0 && !paymentData.propinaManual) {
        propina = Math.max(totalRecibido - Number(totalCuenta || 0), 0);
    }

    const totalConPropina = Number(totalCuenta || 0) + propina;
    const pendiente = Math.max(totalConPropina - totalRecibido, 0);
    const cambio = efectivo > 0 ? Math.max(totalRecibido - totalConPropina, 0) : 0;

    return {
        efectivo,
        tarjeta,
        transferencia,
        totalRecibido,
        propina,
        cambio,
        pendiente,
    };
}

function PosPage() {
    const navigate = useNavigate();
    const [currentUser, setCurrentUser] = useState(null);
    const [currentShiftId, setCurrentShiftId] = useState('');
    const [units, setUnits] = useState([]);
    const [status, setStatus] = useState('Cargando mesas...');
    const [selectedUnit, setSelectedUnit] = useState(null);
    const [currentComanda, setCurrentComanda] = useState(null);
    const [groupedProducts, setGroupedProducts] = useState({});
    const [cartItems, setCartItems] = useState([]);
    const [isAddingProduct, setIsAddingProduct] = useState(false);
    const [isChangingCart, setIsChangingCart] = useState(false);
    const [isUpdatingPersonas, setIsUpdatingPersonas] = useState(false);
    const [isUpdatingComandaStatus, setIsUpdatingComandaStatus] = useState(false);
    const [isConfirmingPayment, setIsConfirmingPayment] = useState(false);
    const isOnline = useOnlineStatus()
    const [paymentData, setPaymentData] = useState({
        efectivo: '',
        tarjeta: '',
        transferencia: '',
        propina: '',
        propinaManual: false,
    });
    const [availableMixers, setAvailableMixers] = useState([]);
    const [shotSelectorState, setShotSelectorState] = useState({
        open: false,
        shotProduct: null,
        selectedMixers: [],
    });
    const [currentCustomer, setCurrentCustomer] = useState(null);
    const [currentMembership, setCurrentMembership] = useState(null);
    const [membershipRenewalState, setMembershipRenewalState] = useState({
        open: false,
        plans: [],
        selectedPlanId: '',
    });
    const [freeBenefitState, setFreeBenefitState] = useState({
        open: false,
        type: null,
        benefit: null,
    });
    const [isProcessingMembership, setIsProcessingMembership] = useState(false);
    const [customerSearchState, setCustomerSearchState] = useState({
        open: false,
        query: '',
        result: null,
        notFound: false,
        showCreateForm: false,
        newName: '',
        newPhone: '',
    });
    const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);

    useEffect(() => {
        const savedUser = localStorage.getItem('continentalCurrentUser');
        const savedShiftId = localStorage.getItem('continentalCurrentShiftId');

        if (!savedUser || !savedShiftId) {
            navigate('/login');
            return;
        }

        setCurrentUser(JSON.parse(savedUser));
        setCurrentShiftId(savedShiftId);
    }, [navigate]);

    useEffect(() => {
        loadUnits();
    }, []);

    useEffect(() => {
        if (currentComanda?.id) {
            loadComandaView(currentComanda.id);
        }
    }, [currentComanda?.id]);

    function handleWeeklyReport() {
        navigate('/weekly-report');
    }


    function resetPaymentState() {
        setPaymentData({
            efectivo: '',
            tarjeta: '',
            transferencia: '',
            propina: '',
            propinaManual: false,
        });
    }

    function resetShotSelector() {
        setShotSelectorState({
            open: false,
            shotProduct: null,
            selectedMixers: [],
        });
    }

    function resetCustomerState() {
        setCurrentCustomer(null);
        setCurrentMembership(null);
        setMembershipRenewalState({ open: false, plans: [], selectedPlanId: '' });
        setFreeBenefitState({ open: false, type: null, benefit: null });
        setCustomerSearchState({ open: false, query: '', result: null, notFound: false, showCreateForm: false, newName: '', newPhone: '' });
    }
    function handleChangeUser() {
        const confirmed = window.confirm(
            '¿Deseas cambiar de usuario sin cerrar el turno?'
        );

        if (!confirmed) return;

        localStorage.removeItem('continentalCurrentUser');

        setCurrentUser(null);
        setSelectedUnit(null);
        setCurrentComanda(null);
        setGroupedProducts({});
        setCartItems([]);
        setAvailableMixers([]);
        resetPaymentState();
        resetShotSelector();

        navigate('/login');
    }

    async function handleReprintTicket() {
        const folioInput = window.prompt(
            'Ingrese el folio del ticket (ejemplo: 68 o C-000068):'
        );

        if (!folioInput) return;

        let folioNumero = folioInput.trim();

        if (folioNumero.toUpperCase().startsWith('C-')) {
            folioNumero = folioNumero.substring(2);
        }

        folioNumero = parseInt(folioNumero, 10);

        if (isNaN(folioNumero)) {
            alert('Folio inválido.');
            return;
        }

        // 🔹 Buscar comanda
        const { data: comanda, error } = await supabase
            .from('comandas')
            .select('*')
            .eq('folio', folioNumero)
            .single();

        if (error || !comanda) {
            alert('No se encontró una comanda con ese folio.');
            return;
        }

        let tipo = 'cuenta';

        // 🔹 Si está pagada → elegir tipo
        if (comanda.status === 'paid') {
            const opcion = window.prompt(
                `La comanda C-${String(comanda.folio).padStart(6, '0')} está pagada.\n\n` +
                `1 = Ticket cliente\n` +
                `2 = Ticket interno`
            );

            if (!opcion) return;

            if (opcion === '2') {
                tipo = 'pagado';
            } else if (opcion === '1') {
                tipo = 'cuenta';
            } else {
                alert('Opción inválida.');
                return;
            }
        }

        // 🔹 Traer items
        const { data: items } = await supabase
            .from('comanda_items')
            .select('*, products:products!comanda_items_product_id_fkey(name)')
            .eq('comanda_id', comanda.id)
            .eq('status', 'active');

        // 🔹 Traer mesa
        const { data: unit } = await supabase
            .from('units')
            .select('*')
            .eq('id', comanda.unit_id)
            .single();

        // 🔹 Traer pago si aplica
        let payment = null;

        if (tipo === 'pagado') {
            const { data: paymentData } = await supabase
                .from('payments')
                .select('*')
                .eq('comanda_id', comanda.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            payment = paymentData;
        }

        // 🔹 Imprimir
        printTicket({
            tipo,
            comanda,
            items: items || [],
            unit,
            payment,
        });

        // 🔹 Log (opcional pero recomendado)
        if (currentUser?.id) {
            await supabase.from('comanda_events').insert([
                {
                    comanda_id: comanda.id,
                    user_id: currentUser.id,
                    event_type: 'ticket_reprinted',
                    event_data: {
                        folio: comanda.folio,
                        tipo_ticket: tipo,
                    },
                },
            ]);
        }
    }

    function getCashMovementConfig(category) {
        const configMap = {
            resguardo_casa: {
                type: 'withdrawal',
                movementNature: 'transfer',
                sourceLocation: 'drawer',
                destinationLocation: 'house_safe',
            },
            deposito_banco: {
                type: 'withdrawal',
                movementNature: 'transfer',
                sourceLocation: 'drawer',
                destinationLocation: 'bank',
            },
            pago_proveedor_caja: {
                type: 'withdrawal',
                movementNature: 'expense',
                sourceLocation: 'drawer',
                destinationLocation: 'expense',
            },
            pago_proveedor_banco: {
                type: 'withdrawal',
                movementNature: 'expense',
                sourceLocation: 'bank',
                destinationLocation: 'expense',
            },
            pago_proveedor_resguardo: {
                type: 'withdrawal',
                movementNature: 'expense',
                sourceLocation: 'house_safe',
                destinationLocation: 'expense',
            },
            nomina_caja: {
                type: 'withdrawal',
                movementNature: 'expense',
                sourceLocation: 'drawer',
                destinationLocation: 'expense',
            },
            nomina_banco: {
                type: 'withdrawal',
                movementNature: 'expense',
                sourceLocation: 'bank',
                destinationLocation: 'expense',
            },
            renta_caja: {
                type: 'withdrawal',
                movementNature: 'expense',
                sourceLocation: 'drawer',
                destinationLocation: 'expense',
            },
            renta_banco: {
                type: 'withdrawal',
                movementNature: 'expense',
                sourceLocation: 'bank',
                destinationLocation: 'expense',
            },
            propinas_entregadas: {
                type: 'withdrawal',
                movementNature: 'expense',
                sourceLocation: 'drawer',
                destinationLocation: 'tips',
            },
            gasto_operativo_caja: {
                type: 'withdrawal',
                movementNature: 'expense',
                sourceLocation: 'drawer',
                destinationLocation: 'expense',
            },
            gasto_operativo_banco: {
                type: 'withdrawal',
                movementNature: 'expense',
                sourceLocation: 'bank',
                destinationLocation: 'expense',
            },
            regreso_resguardo: {
                type: 'deposit',
                movementNature: 'transfer',
                sourceLocation: 'house_safe',
                destinationLocation: 'drawer',
            },
            retiro_banco_a_caja: {
                type: 'deposit',
                movementNature: 'transfer',
                sourceLocation: 'bank',
                destinationLocation: 'drawer',
            },
            aportacion_socio: {
                type: 'deposit',
                movementNature: 'owner_funding',
                sourceLocation: 'owner',
                destinationLocation: 'drawer',
            },
            ajuste_ingreso: {
                type: 'deposit',
                movementNature: 'adjustment',
                sourceLocation: 'adjustment',
                destinationLocation: 'drawer',
            },
        };

        return configMap[category] || null;
    }

    async function calculateShiftSummary() {
        if (!currentShiftId) {
            return {
                error: new Error('No hay turno activo.'),
                data: null,
            };
        }

        const { data: shift, error: shiftError } = await supabase
            .from('shifts')
            .select('*')
            .eq('id', currentShiftId)
            .single();

        if (shiftError || !shift) {
            return {
                error: shiftError || new Error('No se pudo obtener el turno.'),
                data: null,
            };
        }

        const { data: payments, error: paymentsError } = await supabase
            .from('payments')
            .select(`
            *,
            comandas (
                tip_total
            )
        `)
            .eq('shift_id', currentShiftId);

        if (paymentsError) {
            return { error: paymentsError, data: null };
        }

        const { data: cashMovements, error: cashMovementsError } = await supabase
            .from('cash_movements')
            .select('*')
            .eq('shift_id', currentShiftId);

        if (cashMovementsError) {
            return { error: cashMovementsError, data: null };
        }

        let totalEfectivo = 0;
        let totalTarjeta = 0;
        let totalTransferencia = 0;
        let totalPropinas = 0;
        let totalCambio = 0;
        let totalWithdrawals = 0;
        let totalDeposits = 0;

        (payments || []).forEach((p) => {
            const efectivoRecibido = Number(p.efectivo || 0);
            const tarjetaRecibida = Number(p.tarjeta || 0);
            const transferenciaRecibida = Number(p.transferencia || 0);
            const cambioDado = Number(p.change_given || 0);
            const propina = Number((p.tip_amount ?? p.comandas?.tip_total) || 0);

            totalEfectivo += efectivoRecibido;
            totalTarjeta += tarjetaRecibida;
            totalTransferencia += transferenciaRecibida;
            totalPropinas += propina;
            totalCambio += cambioDado;
        });

        (cashMovements || []).forEach((m) => {
            const amount = Number(m.amount || 0);

            // Money leaving drawer
            if (m.source_location === 'drawer') {
                totalWithdrawals += amount;
            }

            // Money entering drawer
            if (m.destination_location === 'drawer') {
                totalDeposits += amount;
            }
        });

        const expectedCash =
            Number(shift.starting_cash || 0) +
            totalEfectivo +
            totalDeposits -
            totalWithdrawals;

        return {
            error: null,
            data: {
                shift,
                totalEfectivo,
                totalTarjeta,
                totalTransferencia,
                totalPropinas,
                totalCambio,
                totalWithdrawals,
                totalDeposits,
                expectedCash,
            },
        };
    }

    async function handleAddCash() {
        if (!currentUser?.id) {
            alert('No hay usuario activo.');
            return;
        }

        const option = window.prompt(
            `Seleccione tipo de depósito:

1 = Regreso de resguardo (casa → caja)
2 = Retiro de banco a caja
3 = Aportación socio
4 = Ajuste ingreso`
        );

        if (!option) return;

        const categoryMap = {
            '1': 'regreso_resguardo',
            '2': 'retiro_banco_a_caja',
            '3': 'aportacion_socio',
            '4': 'ajuste_ingreso',
        };

        const category = categoryMap[option];

        if (!category) {
            alert('Opción inválida.');
            return;
        }

        const config = getCashMovementConfig(category);

        if (!config) {
            alert('No se encontró configuración para el movimiento.');
            return;
        }

        const amountInput = window.prompt('Monto a depositar:');

        if (!amountInput) return;

        const amount = Number(amountInput);

        if (isNaN(amount) || amount <= 0) {
            alert('Monto inválido.');
            return;
        }

        const noteInput = window.prompt('Motivo / referencia del depósito:');

        if (!noteInput || !noteInput.trim()) {
            alert('Debes ingresar un motivo.');
            return;
        }

        const { error } = await supabase
            .from('cash_movements')
            .insert([
                {
                    shift_id: currentShiftId,
                    user_id: currentUser.id,
                    type: config.type,
                    amount,
                    note: noteInput.trim(),
                    category,
                    movement_nature: config.movementNature,
                    source_location: config.sourceLocation,
                    destination_location: config.destinationLocation,
                },
            ]);

        if (error) {
            alert('No se pudo registrar el depósito.');
            return;
        }

        alert('Depósito registrado correctamente.');
    }

    async function handleRemoveCash() {
        if (!currentUser?.id) {
            alert('No hay usuario activo.');
            return;
        }

        const option = window.prompt(
            `Seleccione tipo de retiro:

1 = Resguardo a casa
2 = Depósito a banco
3 = Pago proveedor (caja)
4 = Pago proveedor (banco)
5 = Nómina (caja)
6 = Nómina (banco)
7 = Renta (caja)
8 = Renta (banco)
9 = Propinas entregadas
10 = Gasto operativo (caja)
11 = Gasto operativo (banco)
12 = Pago proveedor (resguardo)`
        );

        if (!option) return;

        const categoryMap = {
            '1': 'resguardo_casa',
            '2': 'deposito_banco',
            '3': 'pago_proveedor_caja',
            '4': 'pago_proveedor_banco',
            '5': 'nomina_caja',
            '6': 'nomina_banco',
            '7': 'renta_caja',
            '8': 'renta_banco',
            '9': 'propinas_entregadas',
            '10': 'gasto_operativo_caja',
            '11': 'gasto_operativo_banco',
            '12': 'pago_proveedor_resguardo',
        };

        const category = categoryMap[option];

        if (!category) {
            alert('Opción inválida.');
            return;
        }

        const config = getCashMovementConfig(category);

        if (!config) {
            alert('No se encontró configuración para el movimiento.');
            return;
        }

        if (config.sourceLocation === 'drawer' && !currentShiftId) {
            alert('No hay turno activo.');
            return;
        }

        const amountInput = window.prompt('Monto a retirar:');

        if (!amountInput) return;

        const amount = Number(amountInput);

        if (isNaN(amount) || amount <= 0) {
            alert('Monto inválido.');
            return;
        }

        const noteInput = window.prompt('Motivo / referencia del retiro:');

        if (!noteInput || !noteInput.trim()) {
            alert('Debes ingresar un motivo.');
            return;
        }

        const { error } = await supabase
            .from('cash_movements')
            .insert([
                {
                    shift_id: currentShiftId,
                    user_id: currentUser.id,
                    type: config.type,
                    amount,
                    note: noteInput.trim(),
                    category,
                    movement_nature: config.movementNature,
                    source_location: config.sourceLocation,
                    destination_location: config.destinationLocation,
                },
            ]);

        if (error) {
            alert('No se pudo registrar el retiro.');
            return;
        }

        alert('Retiro registrado correctamente.');
    }

    function handleInventory() {
        navigate('/inventory');
    }

    async function handleShiftCut() {
        const { data: summary, error } = await calculateShiftSummary();

        if (error || !summary) {
            alert(error?.message || 'No se pudo calcular el corte.');
            return;
        }

        alert(
            `📊 CORTE DE TURNO\n\n` +
            `Fondo inicial: ${money(summary.shift.starting_cash)}\n` +
            `Efectivo neto en caja: ${money(summary.totalEfectivo)}\n` +
            `Cambio entregado: ${money(summary.totalCambio)}\n` +
            `Tarjeta: ${money(summary.totalTarjeta)}\n` +
            `Transferencia: ${money(summary.totalTransferencia)}\n` +
            `Propinas: ${money(summary.totalPropinas)}\n\n` +
            `Depósitos: +${money(summary.totalDeposits)}\n` +
            `Retiros: -${money(summary.totalWithdrawals)}\n\n` +
            `Caja esperada: ${money(summary.expectedCash)}`
        );
    }



    async function handleCloseShift() {
        if (!currentShiftId || !currentUser?.id) {
            alert('No hay turno activo.')
            return
        }

        const { data: summary, error: summaryError } = await calculateShiftSummary()

        if (summaryError || !summary) {
            alert(summaryError?.message || 'No se pudo calcular el cierre de turno.')
            return
        }

        const { data: openComandas } = await supabase
            .from('comandas')
            .select('id')
            .in('status', ['open', 'pending_payment', 'processing_payment'])
            .gte('opened_at', summary.shift.opened_at)
            .limit(1)

        if (openComandas && openComandas.length > 0) {
            alert('No se puede cerrar turno: hay comandas abiertas o en proceso.')
            return
        }

        const countedInput = window.prompt(
            `🔒 CIERRE DE TURNO\n\n` +
            `Fondo inicial: ${money(summary.shift.starting_cash)}\n` +
            `Efectivo neto en caja: ${money(summary.totalEfectivo)}\n` +
            `Cambio entregado: ${money(summary.totalCambio)}\n` +
            `Tarjeta: ${money(summary.totalTarjeta)}\n` +
            `Transferencia: ${money(summary.totalTransferencia)}\n` +
            `Propinas: ${money(summary.totalPropinas)}\n\n` +
            `Depósitos: +${money(summary.totalDeposits)}\n` +
            `Retiros: -${money(summary.totalWithdrawals)}\n\n` +
            `Caja esperada: ${money(summary.expectedCash)}\n\n` +
            `Ingrese efectivo contado físicamente:`
        );

        if (countedInput === null || countedInput.trim() === '') return

        const cashCounted = Number(countedInput)

        if (isNaN(cashCounted)) {
            alert('Cantidad inválida.')
            return
        }

        const difference = cashCounted - Number(summary.expectedCash || 0)

        const { error: updateError } = await supabase
            .from('shifts')
            .update({
                status: 'closed',
                closed_at: new Date().toISOString(),
                closed_by_user_id: currentUser.id,
                cash_counted: cashCounted,
                difference,
                total_efectivo: summary.totalEfectivo,
                total_tarjeta: summary.totalTarjeta,
                total_transferencia: summary.totalTransferencia,
                total_propinas: summary.totalPropinas,
                total_retiros: summary.totalWithdrawals,
                expected_cash: summary.expectedCash,
            })
            .eq('id', currentShiftId)

        if (updateError) {
            alert(updateError.message || 'No se pudo cerrar el turno.')
            return
        }

        alert(
            `🔒 TURNO CERRADO\n\n` +
            `Fondo inicial: ${money(summary.shift.starting_cash)}\n` +
            `Efectivo neto en caja: ${money(summary.totalEfectivo)}\n` +
            `Cambio entregado: ${money(summary.totalCambio)}\n` +
            `Tarjeta: ${money(summary.totalTarjeta)}\n` +
            `Transferencia: ${money(summary.totalTransferencia)}\n` +
            `Propinas: ${money(summary.totalPropinas)}\n\n` +
            `Depósitos: +${money(summary.totalDeposits)}\n` +
            `Retiros: -${money(summary.totalWithdrawals)}\n\n` +
            `Caja esperada: ${money(summary.expectedCash)}\n` +
            `Caja contada: ${money(cashCounted)}\n` +
            `Diferencia: ${money(difference)}`
        );

        localStorage.removeItem('continentalCurrentShiftId')
        localStorage.removeItem('continentalCurrentUser')
        navigate('/')
    }

    async function loadUnits() {
        setStatus('Cargando mesas...');
        const { data, error } = await getUnitsWithStatus();

        if (error) {
            setStatus(`Error cargando mesas: ${error.message}`);
            return;
        }

        setUnits(data || []);
        setStatus('Mesas cargadas.');
    }

    async function loadComandaView(comandaId) {
        const [productsResult, cartResult] = await Promise.all([
            getProductsCatalog(),
            getActiveCartItems(comandaId),
        ]);

        if (productsResult.error) {
            setStatus(`Error cargando productos: ${productsResult.error.message}`);
            return;
        }

        if (cartResult.error) {
            setStatus(`Error cargando comanda: ${cartResult.error.message}`);
            return;
        }

        setGroupedProducts(productsResult.data?.groupedProducts || {});
        setCartItems(cartResult.data || []);
        setStatus('Comanda cargada.');
    }

    function handleLogout() {
        localStorage.removeItem('continentalCurrentUser');
        localStorage.removeItem('continentalCurrentShiftId');
        navigate('/login');
    }

    async function handleUnitClick(unit) {
        if (!requireOnline(isOnline, setStatus)) return

        if (!currentUser) {
            setStatus('No hay usuario activo.')
            return
        }

        setStatus(`Abriendo ${unit.name}...`)

        const { data: existing, error: existingError } = await supabase
            .from('comandas')
            .select('*')
            .eq('unit_id', unit.id)
            .in('status', ['open', 'pending_payment', 'processing_payment'])
            .limit(1)

        if (existingError) {
            setStatus(`Error abriendo comanda: ${existingError.message}`)
            return
        }

        const isNew = !existing || existing.length === 0
        let customerName = ''
        let pendingCustomerData = null

        if (isNew) {
            const input = window.prompt('Nombre de mesa o número de cliente (opcional):')
            if (input === null) {
                setStatus('Operación cancelada.')
                return
            }
            const trimmed = input.trim()

            if (trimmed && /^\d+$/.test(trimmed)) {
                setStatus('Buscando cliente...')
                const { data: customerData } = await getCustomerWithMembership(trimmed)
                if (customerData) {
                    customerName = customerData.customer.name
                    pendingCustomerData = customerData
                } else {
                    const proceed = window.confirm(`No se encontró cliente #${trimmed}. ¿Continuar sin cliente?`)
                    if (!proceed) {
                        setStatus('Operación cancelada.')
                        return
                    }
                    customerName = trimmed
                }
            } else {
                customerName = trimmed
            }
        }

        const { data, error } = await getOrCreateActiveComanda({
            unitId: unit.id,
            userId: currentUser.id,
            customerName,
        })

        if (error || !data) {
            setStatus(`Error abriendo comanda: ${error?.message || 'desconocido'}`)
            return
        }

        // Link customer to comanda if found
        if (isNew && pendingCustomerData) {
            await supabase
                .from('comandas')
                .update({ customer_id: pendingCustomerData.customer.id })
                .eq('id', data.id)
            setCurrentCustomer(pendingCustomerData.customer)
            setCurrentMembership(pendingCustomerData.activeMembership)
        } else if (!isNew && data.customer_id) {
            const { data: cd } = await getCustomerByIdWithMembership(data.customer_id)
            if (cd) {
                setCurrentCustomer(cd.customer)
                setCurrentMembership(cd.activeMembership)
            }
        } else {
            resetCustomerState()
        }

        setSelectedUnit(unit)
        setCurrentComanda(data)
        resetPaymentState()
        resetShotSelector()
        setStatus(`Comanda cargada para ${unit.name}.`)
    }
    async function handleSearchCustomer() {
        if (!customerSearchState.query.trim()) return
        setIsSearchingCustomer(true)
        setCustomerSearchState(p => ({ ...p, notFound: false, result: null }))

        const { data } = await searchCustomerByQuery(customerSearchState.query.trim())

        if (data) {
            setCustomerSearchState(p => ({ ...p, result: data, notFound: false }))
        } else {
            setCustomerSearchState(p => ({ ...p, result: null, notFound: true }))
        }
        setIsSearchingCustomer(false)
    }

    async function handleAssignCustomer(customerData) {
        if (!currentComanda?.id) return
        setIsProcessingMembership(true)

        await supabase
            .from('comandas')
            .update({
                customer_id: customerData.customer.id,
                customer_name: customerData.customer.name,
            })
            .eq('id', currentComanda.id)

        setCurrentComanda(prev => ({
            ...prev,
            customer_id: customerData.customer.id,
            customer_name: customerData.customer.name,
        }))

        setCurrentCustomer(customerData.customer)
        setCurrentMembership(customerData.activeMembership)
        setCustomerSearchState({ open: false, query: '', result: null, notFound: false, showCreateForm: false, newName: '', newPhone: '' })
        setIsProcessingMembership(false)
        setStatus(`Cliente asignado: ${customerData.customer.name}`)
    }

    async function handleCreateAndAssignCustomer() {
        if (!customerSearchState.newName.trim() || !currentComanda?.id) return
        setIsProcessingMembership(true)

        const nextNumber = await getNextCustomerNumber()

        const { data: newCustomer, error } = await supabase
            .from('customers')
            .insert([{
                customer_number: nextNumber,
                name: customerSearchState.newName.trim(),
                phone: customerSearchState.newPhone.trim() || null,
            }])
            .select()
            .single()

        if (error || !newCustomer) {
            setStatus(`Error creando cliente: ${error?.message}`)
            setIsProcessingMembership(false)
            return
        }

        await supabase
            .from('comandas')
            .update({ customer_id: newCustomer.id, customer_name: newCustomer.name })
            .eq('id', currentComanda.id)

        setCurrentComanda(prev => ({ ...prev, customer_id: newCustomer.id, customer_name: newCustomer.name }))
        setCurrentCustomer(newCustomer)
        setCurrentMembership(null)
        setCustomerSearchState({ open: false, query: '', result: null, notFound: false, showCreateForm: false, newName: '', newPhone: '' })
        setIsProcessingMembership(false)
        setStatus(`Cliente creado y asignado: ${newCustomer.name} #${newCustomer.customer_number}`)
    }
    async function handleOpenMembershipRenewal() {
        setIsProcessingMembership(true)
        const { data, error } = await getAllActiveMembershipPlans()
        if (error || !data || data.length === 0) {
            alert('No hay planes de membresía activos configurados.')
            setIsProcessingMembership(false)
            return
        }
        setMembershipRenewalState({
            open: true,
            plans: data,
            selectedPlanId: data[0].id,
        })
        setIsProcessingMembership(false)
    }

    async function handleActivateMembership() {
        if (!currentCustomer || !currentComanda?.id || !membershipRenewalState.selectedPlanId) return
        setIsProcessingMembership(true)

        const selectedPlan = membershipRenewalState.plans.find(
            p => p.id === membershipRenewalState.selectedPlanId
        )

        // 1. Create the membership record
        const { data: newMembership, error: membershipError } = await activateMembership({
            customerId: currentCustomer.id,
            planId: membershipRenewalState.selectedPlanId,
            comandaId: currentComanda.id,
        })

        if (membershipError || !newMembership) {
            alert(`Error activando membresía: ${membershipError?.message}`)
            setIsProcessingMembership(false)
            return
        }

        // 2. Add membership product to bill if linked
        if (selectedPlan?.product_id) {
            const { data: product } = await supabase
                .from('products')
                .select('*')
                .eq('id', selectedPlan.product_id)
                .single()

            if (product) {
                await addNormalProductToComanda({
                    comandaId: currentComanda.id,
                    product,
                })
                await loadComandaView(currentComanda.id)
            }
        }

        setCurrentMembership(newMembership)
        setMembershipRenewalState({ open: false, plans: [], selectedPlanId: '' })
        setIsProcessingMembership(false)
        setStatus('Membresía activada correctamente.')
    }

    async function handleOpenFreeBenefitSelector(type) {
        if (!currentMembership) return
        const benefit = currentMembership.membership_plans?.membership_plan_benefits?.find(
            b => b.benefit_type === type
        )
        if (!benefit) return
        setFreeBenefitState({ open: true, type, benefit })
    }

    async function handleAddFreeBenefit(productId) {
        if (!currentComanda?.id || !productId) return
        setIsAddingProduct(true)
        const { error } = await addFreeBenefitItemToComanda({
            comandaId: currentComanda.id,
            productId,
        })
        if (error) {
            setStatus(`Error agregando beneficio: ${error.message}`)
            setIsAddingProduct(false)
            return
        }
        await loadComandaView(currentComanda.id)
        setFreeBenefitState({ open: false, type: null, benefit: null })
        setIsAddingProduct(false)
        setStatus('Beneficio agregado.')
    }
    async function handleBackToUnits(customStatus = null) {
        setSelectedUnit(null);
        setCurrentComanda(null);
        setGroupedProducts({});
        setCartItems([]);
        resetPaymentState();
        resetShotSelector();
        resetCustomerState();
        await loadUnits();

        if (customStatus) {
            setStatus(customStatus);
        }
    }

    async function openShotMixerSelector(product) {
        try {
            const freeMixersQty = Number(product?.free_mixers_qty || 0);

            if (freeMixersQty <= 0) {
                const { error } = await addShotWithFreeMixers({
                    comandaId: currentComanda.id,
                    shotProduct: product,
                    selectedMixers: [],
                    userId: currentUser?.id,
                });

                if (error) {
                    setStatus(`Error agregando shot: ${error.message}`);
                    return;
                }

                await loadComandaView(currentComanda.id);
                setStatus(`${product.name} agregado.`);
                return;
            }

            const { data, error } = await getAvailableMixersForProduct(product.id);

            if (error) {
                setStatus(`Error cargando mixers: ${error.message}`);
                return;
            }

            setAvailableMixers(data || []);
            setShotSelectorState({
                open: true,
                shotProduct: product,
                selectedMixers: [],
            });
        } finally {
            setIsAddingProduct(false);
        }
    }

    async function handleAddProduct(product) {
        if (!requireOnline(isOnline, setStatus)) return
        if (!currentComanda?.id) return;

        if (currentComanda.status !== 'open') {
            alert('Esta comanda no se puede editar.');
            return;
        }

        if (isAddingProduct || isChangingCart || isUpdatingComandaStatus) return;

        setIsAddingProduct(true);

        try {
            if (product.is_shot) {
                await openShotMixerSelector(product);
                return;
            }

            const { error } = await addNormalProductToComanda({
                comandaId: currentComanda.id,
                product,
            });

            if (error) {
                setStatus(`Error agregando producto: ${error.message}`);
                return;
            }

            await loadComandaView(currentComanda.id);
            setStatus(`${product.name} agregado.`);
        } finally {
            setIsAddingProduct(false);
        }
    }

    async function handleIncreaseCartItem(item) {
        const product = productsById[item.product_id];

        if (!product) {
            setStatus('No se encontró el producto en catálogo para aumentar la cantidad.');
            return;
        }

        await handleAddProduct(product);
    }

    async function handleDecreaseCartItem(item) {
        if (!currentComanda?.id || !currentUser?.id) return;

        if (currentComanda.status !== 'open') {
            alert('Esta comanda no se puede editar.');
            return;
        }

        const currentQty = Number(item.quantity || 0);
        const confirmed = window.confirm(
            currentQty <= 1
                ? '¿Eliminar este producto de la comanda?'
                : '¿Disminuir este producto?'
        );

        if (!confirmed) return;
        if (isChangingCart || isAddingProduct || isUpdatingComandaStatus) return;

        setIsChangingCart(true);

        try {
            const { error } = await decreaseCartItem({
                comandaId: currentComanda.id,
                itemId: item.id,
                productId: item.product_id,
                currentQty,
                userId: currentUser.id,
            });

            if (error) {
                setStatus(`Error disminuyendo producto: ${error.message}`);
                return;
            }

            await loadComandaView(currentComanda.id);
            setStatus(
                currentQty <= 1
                    ? `${item.products?.name || 'Producto'} eliminado.`
                    : `${item.products?.name || 'Producto'} disminuido.`
            );
        } finally {
            setIsChangingCart(false);
        }
    }

    async function handlePersonasChange(delta) {
        if (!currentComanda?.id) return;

        const canEditPersonas =
            currentComanda.status === 'open' || currentComanda.status === 'processing_payment';

        if (!canEditPersonas) {
            alert('Las personas solo se pueden editar con la comanda abierta o en cobro.');
            return;
        }

        if (isUpdatingPersonas) return;

        const nextPersonas = Math.max(0, Number(currentComanda.personas || 0) + delta);

        setIsUpdatingPersonas(true);

        try {
            const { data, error } = await updateComandaPersonas({
                comandaId: currentComanda.id,
                personas: nextPersonas,
            });

            if (error) {
                setStatus(`Error actualizando personas: ${error.message}`);
                return;
            }

            setCurrentComanda((prev) => ({
                ...prev,
                personas: data,
            }));

            setStatus(`Personas actualizadas: ${data}.`);
        } finally {
            setIsUpdatingPersonas(false);
        }
    }

    function toggleMixerSelection(mixer) {
        const requiredMixers = Number(shotSelectorState.shotProduct?.free_mixers_qty || 0);

        setShotSelectorState((prev) => {
            if (prev.selectedMixers.length >= requiredMixers) {
                return prev;
            }

            return {
                ...prev,
                selectedMixers: [...prev.selectedMixers, mixer],
            };
        });
    }

    function removeSelectedMixer(indexToRemove) {
        setShotSelectorState((prev) => ({
            ...prev,
            selectedMixers: prev.selectedMixers.filter((_, index) => index !== indexToRemove),
        }));
    }

    async function handleConfirmShotMixers() {
        if (!currentComanda?.id || !shotSelectorState.shotProduct) return;

        const requiredMixers = Number(shotSelectorState.shotProduct?.free_mixers_qty || 0);

        if (shotSelectorState.selectedMixers.length !== requiredMixers) {
            alert(`Debes seleccionar exactamente ${requiredMixers} mixer(s).`);
            return;
        }

        setIsAddingProduct(true);

        try {
            const { error } = await addShotWithFreeMixers({
                comandaId: currentComanda.id,
                shotProduct: shotSelectorState.shotProduct,
                selectedMixers: shotSelectorState.selectedMixers,
                userId: currentUser?.id,
            });

            if (error) {
                setStatus(`Error agregando shot: ${error.message}`);
                return;
            }

            await loadComandaView(currentComanda.id);
            setStatus(`${shotSelectorState.shotProduct.name} agregado con mixers.`);
            resetShotSelector();
        } finally {
            setIsAddingProduct(false);
        }
    }

    async function handlePresentBill() {
        if (!currentComanda?.id || !currentUser?.id) return;

        if (currentComanda.status !== 'open') {
            alert('Solo se puede presentar cuenta en una comanda abierta.');
            return;
        }

        if (displayedTotal <= 0) {
            alert('La comanda no tiene productos.');
            return;
        }

        if (isUpdatingComandaStatus) return;

        setIsUpdatingComandaStatus(true);

        try {
            const cuentaAt = new Date().toISOString();

            const { error } = await presentBill({
                comandaId: currentComanda.id,
                userId: currentUser.id,
                total: displayedTotal,
            });

            if (error) {
                setStatus(`Error al presentar cuenta: ${error.message}`);
                return;
            }

            printTicket({
                tipo: 'cuenta',
                comanda: {
                    ...currentComanda,
                    final_total: displayedTotal,
                    cuenta_at: cuentaAt,
                },
                items: visibleCartItems,
                unit: selectedUnit,
            });

            alert(`Cuenta cerrada, favor de tomar ticket. Total ${money(displayedTotal)}`);

            await handleBackToUnits('Cuenta presentada correctamente.');
        } finally {
            setIsUpdatingComandaStatus(false);
        }
    }

    async function handleReopenComanda() {
        if (!currentComanda?.id || !currentUser?.id) return;

        if (
            currentComanda.status === 'processing_payment' &&
            currentUser.role === 'waiter'
        ) {
            alert('No autorizado.');
            return;
        }

        if (
            currentComanda.status !== 'pending_payment' &&
            currentComanda.status !== 'processing_payment'
        ) {
            alert('Esta comanda no está en estado reabrible.');
            return;
        }

        if (isUpdatingComandaStatus) return;

        setIsUpdatingComandaStatus(true);

        try {
            const { error } = await reopenComanda({
                comandaId: currentComanda.id,
                userId: currentUser.id,
                previousStatus: currentComanda.status,
            });

            if (error) {
                setStatus(`Error reabriendo comanda: ${error.message}`);
                return;
            }

            setCurrentComanda((prev) => ({
                ...prev,
                status: 'open',
            }));

            resetPaymentState();
            await loadUnits();
            setStatus('Comanda reabierta.');
        } finally {
            setIsUpdatingComandaStatus(false);
        }
    }

    async function handleCancelMesa() {
        if (!currentComanda?.id || !currentUser?.id) return;
        if (currentComanda.status !== 'open') return;

        const hasItems = visibleCartItems && visibleCartItems.length > 0;

        if (hasItems && currentUser?.role === 'waiter') {
            alert('No autorizado. Solo un manager o admin puede cancelar una mesa con productos.');
            return;
        }

        const msg = hasItems
            ? `Esta mesa tiene ${visibleCartItems.length} producto(s). ¿Cancelar la mesa de todas formas? Los productos NO serán cobrados.`
            : '¿Cancelar y liberar esta mesa?';

        if (!window.confirm(msg)) return;
        if (isUpdatingComandaStatus) return;

        setIsUpdatingComandaStatus(true);
        try {
            const { error } = await cancelComanda({
                comandaId: currentComanda.id,
                userId: currentUser.id,
            });
            if (error) { setStatus(`Error cancelando mesa: ${error.message}`); return; }

            setSelectedUnit(null);
            setCurrentComanda(null);
            setGroupedProducts({});
            setCartItems([]);
            resetPaymentState();
            resetShotSelector();
            resetCustomerState();
            await loadUnits();
            setStatus('Mesa cancelada y liberada.');
        } finally {
            setIsUpdatingComandaStatus(false);
        }
    }

    async function handleStartPayment() {
        if (!currentComanda?.id || !currentUser?.id) return;

        if (currentComanda.status !== 'pending_payment') {
            alert('Solo se puede iniciar cobro desde cuenta.');
            return;
        }

        if (isUpdatingComandaStatus) return;

        setIsUpdatingComandaStatus(true);

        try {
            const { error } = await startPayment({
                comandaId: currentComanda.id,
                userId: currentUser.id,
            });

            if (error) {
                setStatus(`Error iniciando cobro: ${error.message}`);
                return;
            }

            setCurrentComanda((prev) => ({
                ...prev,
                status: 'processing_payment',
            }));

            resetPaymentState();
            await loadUnits();
            setStatus('Cobro iniciado.');
        } finally {
            setIsUpdatingComandaStatus(false);
        }
    }

    function handlePaymentFieldChange(field, value) {
        if (value === '') {
            setPaymentData((prev) => ({
                ...prev,
                [field]: '',
                ...(field === 'propina' ? { propinaManual: true } : {}),
            }));
            return;
        }

        const numericValue = Number(value);

        if (Number.isNaN(numericValue) || numericValue < 0) {
            return;
        }

        setPaymentData((prev) => ({
            ...prev,
            [field]: value,
            ...(field === 'propina' ? { propinaManual: true } : {}),
        }));
    }

    function handleResetAutoTip() {
        setPaymentData((prev) => ({
            ...prev,
            propina: '',
            propinaManual: false,
        }));
    }

    async function handleConfirmPayment() {
        if (!currentComanda?.id || !currentUser?.id || !currentShiftId) return;

        if (currentComanda.status !== 'processing_payment') {
            alert('La comanda no está en proceso de cobro.');
            return;
        }

        if (paymentSummary.pendiente > 0) {
            alert('El monto pagado es insuficiente.');
            return;
        }

        if (isConfirmingPayment) return;

        setIsConfirmingPayment(true);

        try {
            const cobradoAt = new Date().toISOString();

            const { error, data } = await confirmPayment({
                comandaId: currentComanda.id,
                total: displayedTotal,
                userId: currentUser.id,
                shiftId: currentShiftId,
                efectivo: paymentSummary.efectivo,
                tarjeta: paymentSummary.tarjeta,
                transferencia: paymentSummary.transferencia,
                propina: paymentSummary.propina,
                cambio: Math.round(paymentSummary.cambio * 100) / 100,
            });

            if (error) {
                setStatus(`Error confirmando cobro: ${error.message}`);
                return;
            }


            // Process membership if customer is assigned
            let membershipResult = null
            if (currentCustomer && currentMembership) {
                membershipResult = await processMembershipOnPayment({
                    customerId: currentCustomer.id,
                    membershipId: currentMembership.id,
                    comandaId: currentComanda.id,
                    discountPct: membershipDiscountPct,
                    discountAmount,
                    membershipPlanBenefits: currentMembership.membership_plans?.membership_plan_benefits || [],
                })
            }
            printTicket({
                tipo: 'pagado',
                comanda: {
                    ...currentComanda,
                    final_total: displayedTotal,
                    cobrado_at: cobradoAt,
                    tip_total: paymentSummary.propina,
                },
                items: visibleCartItems,
                unit: selectedUnit,
                payment: {
                    efectivo: Math.max(paymentSummary.efectivo - paymentSummary.cambio, 0),
                    tarjeta: paymentSummary.tarjeta,
                    transferencia: paymentSummary.transferencia,
                    total_paid:
                        Math.max(paymentSummary.efectivo - paymentSummary.cambio, 0) +
                        paymentSummary.tarjeta +
                        paymentSummary.transferencia,
                    change_given: paymentSummary.cambio,
                },
                membershipInfo: currentCustomer && currentMembership ? {
                    customerName: currentCustomer.name,
                    customerNumber: currentCustomer.customer_number,
                    planName: currentMembership.membership_plans?.name,
                    discountAmount,
                    discountPct: membershipDiscountPct,
                    newVisitCount: membershipResult?.newVisitCount,
                    bottleCredits: membershipResult?.newBottleCreditsAvailable,
                    earnedBottleCredit: membershipResult?.earnedBottleCredit,
                } : null,
            });

            if (data?.inventoryWarning) {
                alert(`Cobro registrado, pero inventario avisó: ${data.inventoryWarning}`);
            } else {
                let msg = 'Cobro registrado correctamente.'
                if (membershipResult?.earnedBottleCredit) {
                    msg += ` 🍾 ¡${currentCustomer.name} ganó un crédito de botella!`
                }
                alert(msg)
            }

            await handleBackToUnits(
                data?.inventoryWarning
                    ? 'Cobro registrado con advertencia de inventario.'
                    : 'Cobro registrado correctamente.'
            );
        } finally {
            setIsConfirmingPayment(false);
        }
    }

    const folioDisplay = currentComanda?.folio
        ? `C-${String(currentComanda.folio).padStart(6, '0')}`
        : '';

    const customerDisplay = currentComanda?.customer_name
        ? ` • ${currentComanda.customer_name}`
        : '';

    const visibleCartItems = useMemo(() => {
        return cartItems.filter((item) => !item.is_free_mixer);
    }, [cartItems]);

    const productsById = useMemo(() => {
        const map = {};

        Object.values(groupedProducts).forEach((products) => {
            products.forEach((product) => {
                map[product.id] = product;
            });
        });

        return map;
    }, [groupedProducts]);

    const cartTotal = useMemo(() => {
        return visibleCartItems.reduce((sum, item) => {
            return sum + Number(item.quantity || 0) * Number(item.unit_price || 0);
        }, 0);
    }, [visibleCartItems]);

    const membershipDiscountBenefit = currentMembership?.membership_plans?.membership_plan_benefits?.find(
        b => b.benefit_type === 'discount'
    );
    const membershipDiscountPct = Number(membershipDiscountBenefit?.discount_percentage || 0);
    const discountAmount = membershipDiscountPct > 0
        ? Math.round(cartTotal * (membershipDiscountPct / 100) * 100) / 100
        : 0;

    const displayedTotal =
        currentComanda?.status === 'open'
            ? Math.max(cartTotal - discountAmount, 0)
            : Number(currentComanda?.final_total ?? cartTotal);

    const paymentSummary = useMemo(() => {
        return getPaymentSummary(displayedTotal, paymentData);
    }, [displayedTotal, paymentData]);

    const canEditPersonas =
        currentComanda?.status === 'open' || currentComanda?.status === 'processing_payment';

    const propinaFieldValue = paymentData.propinaManual
        ? paymentData.propina
        : String(paymentSummary.propina || 0);

    const requiredShotMixers = Number(shotSelectorState.shotProduct?.free_mixers_qty || 0);

    return (
        <div style={{ padding: '16px' }}>
            <header
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #444',
                }}
            >
                <div>
                    <h1 style={{ margin: 0 }}>Continental POS</h1>
                    <p style={{ margin: '8px 0 0 0' }}>
                        Usuario: {currentUser ? `${currentUser.name} (${currentUser.role})` : 'Cargando...'}
                    </p>
                    <p style={{ margin: '4px 0 0 0' }}>
                        Turno: {currentShiftId || 'Cargando...'}
                    </p>
                    <p style={{ margin: '8px 0 0 0' }}>{status}</p>
                </div>
                <button onClick={handleLogout}>Logout</button>
            </header>

            <TopBar
                currentUser={currentUser}
                onChangeUser={handleChangeUser}
                onReprintTicket={handleReprintTicket}
                onAddCash={handleAddCash}
                onRemoveCash={handleRemoveCash}
                onInventory={handleInventory}
                onShiftCut={handleShiftCut}
                onCloseShift={handleCloseShift}
                onWeeklyReport={handleWeeklyReport}
            />

            {!selectedUnit ? (
                <MesaGrid units={units} onUnitClick={handleUnitClick} />
            ) : (
                <main>
                    <div style={{ marginBottom: '16px' }}>
                        <button onClick={() => handleBackToUnits()}>← Volver a mesas</button>
                    </div>

                    <div
                        style={{
                            borderLeft: '6px solid #1565c0',
                            background: '#181818',
                            borderRadius: '8px',
                            padding: '14px 16px',
                            marginBottom: '16px',
                        }}
                    >
                        <div style={{ fontSize: '13px', opacity: 0.75, marginBottom: '4px' }}>
                            Mesa activa
                        </div>

                        <div style={{ fontSize: '34px', fontWeight: 'bold', lineHeight: 1.1 }}>
                            {selectedUnit.name}
                        </div>

                        <div style={{ marginTop: '8px', fontSize: '15px', opacity: 0.9 }}>
                            {folioDisplay}
                            {customerDisplay}
                        </div>

                        {/* CUSTOMER & MEMBERSHIP INFO */}
                        {/* ASSIGN CUSTOMER BUTTON — shown when no customer assigned */}
                        {!currentCustomer && currentComanda?.status === 'open' && (
                            <div style={{ marginTop: '10px' }}>
                                {!customerSearchState.open ? (
                                    <button
                                        type="button"
                                        onClick={() => setCustomerSearchState(p => ({ ...p, open: true }))}
                                        style={{ padding: '6px 14px', borderRadius: '8px', border: '1px solid #444', background: '#222', color: '#aaa', cursor: 'pointer', fontSize: '12px' }}
                                    >
                                        👤 Asignar cliente
                                    </button>
                                ) : (
                                    <div style={{ padding: '12px', background: '#1a1a1a', borderRadius: '10px', border: '1px solid #444' }}>
                                        <div style={{ fontWeight: 'bold', marginBottom: '10px', fontSize: '13px' }}>Buscar cliente por número o nombre</div>

                                        {!customerSearchState.showCreateForm ? (
                                            <>
                                                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                                    <input
                                                        type="text"
                                                        value={customerSearchState.query}
                                                        onChange={e => setCustomerSearchState(p => ({ ...p, query: e.target.value }))}
                                                        onKeyDown={e => e.key === 'Enter' && handleSearchCustomer()}
                                                        placeholder="Número o nombre..."
                                                        style={{ flex: 1, padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }}
                                                    />
                                                    <button
                                                        type="button"
                                                        onClick={handleSearchCustomer}
                                                        disabled={isSearchingCustomer}
                                                        style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#1565c0', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                                                    >
                                                        {isSearchingCustomer ? '...' : 'Buscar'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setCustomerSearchState({ open: false, query: '', result: null, notFound: false, showCreateForm: false, newName: '', newPhone: '' })}
                                                        style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#333', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>

                                                {customerSearchState.result && (
                                                    <div style={{ background: '#111', borderRadius: '8px', padding: '10px', marginBottom: '8px' }}>
                                                        <div style={{ fontSize: '13px', fontWeight: 'bold' }}>
                                                            #{customerSearchState.result.customer.customer_number} — {customerSearchState.result.customer.name}
                                                        </div>
                                                        <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '2px' }}>
                                                            {customerSearchState.result.activeMembership
                                                                ? `Membresía activa: ${customerSearchState.result.activeMembership.membership_plans?.name}`
                                                                : 'Sin membresía activa'}
                                                            {' · '}{customerSearchState.result.customer.visit_count} visitas
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAssignCustomer(customerSearchState.result)}
                                                            disabled={isProcessingMembership}
                                                            style={{ marginTop: '8px', padding: '6px 14px', borderRadius: '8px', border: 'none', background: '#2e7d32', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                                        >
                                                            Asignar a esta mesa
                                                        </button>
                                                    </div>
                                                )}

                                                {customerSearchState.notFound && (
                                                    <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                                                        <span style={{ color: '#f57c00' }}>Cliente no encontrado. </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => setCustomerSearchState(p => ({ ...p, showCreateForm: true }))}
                                                            style={{ background: 'none', border: 'none', color: '#4a90d9', cursor: 'pointer', fontSize: '12px', textDecoration: 'underline' }}
                                                        >
                                                            ¿Crear nuevo cliente?
                                                        </button>
                                                    </div>
                                                )}
                                            </>
                                        ) : (
                                            <>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
                                                    <input
                                                        type="text"
                                                        value={customerSearchState.newName}
                                                        onChange={e => setCustomerSearchState(p => ({ ...p, newName: e.target.value }))}
                                                        placeholder="Nombre del cliente *"
                                                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }}
                                                    />
                                                    <input
                                                        type="text"
                                                        value={customerSearchState.newPhone}
                                                        onChange={e => setCustomerSearchState(p => ({ ...p, newPhone: e.target.value }))}
                                                        placeholder="Teléfono (opcional)"
                                                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    <button
                                                        type="button"
                                                        onClick={handleCreateAndAssignCustomer}
                                                        disabled={isProcessingMembership || !customerSearchState.newName.trim()}
                                                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#2e7d32', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                                    >
                                                        {isProcessingMembership ? 'Creando...' : 'Crear y asignar'}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setCustomerSearchState(p => ({ ...p, showCreateForm: false }))}
                                                        style={{ padding: '8px 14px', borderRadius: '8px', border: 'none', background: '#333', color: 'white', cursor: 'pointer', fontSize: '12px' }}
                                                    >
                                                        ← Volver
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}

                        {currentCustomer && (
                            <div style={{ marginTop: '10px', padding: '10px 12px', background: '#111', borderRadius: '8px', border: '1px solid #333' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                    <div>
                                        <span style={{ fontSize: '13px', fontWeight: 'bold' }}>
                                            👤 #{currentCustomer.customer_number} — {currentCustomer.name}
                                        </span>
                                        <span style={{ marginLeft: '10px', fontSize: '12px', opacity: 0.7 }}>
                                            {currentCustomer.visit_count} visitas · {currentCustomer.bottle_credits_available} 🍾
                                        </span>
                                    </div>
                                    {currentMembership ? (
                                        <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '10px', background: '#1b5e20', color: '#66bb6a', fontWeight: 'bold' }}>
                                            {currentMembership.membership_plans?.name}
                                            {membershipDiscountPct > 0 && ` · ${membershipDiscountPct}% desc`}
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: '12px', padding: '3px 10px', borderRadius: '10px', background: '#4a1c00', color: '#f57c00' }}>
                                            Sin membresía activa este mes
                                        </span>
                                    )}
                                </div>

                                {/* BENEFIT BUTTONS */}
                                {currentComanda?.status === 'open' && (
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                                        {!currentMembership && (
                                            <button
                                                type="button"
                                                onClick={handleOpenMembershipRenewal}
                                                disabled={isProcessingMembership}
                                                style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#f57c00', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                            >
                                                {isProcessingMembership ? 'Cargando...' : '+ Activar membresía'}
                                            </button>
                                        )}
                                        {currentMembership && currentMembership.membership_plans?.membership_plan_benefits?.some(b => b.benefit_type === 'free_product') && (
                                            <button
                                                type="button"
                                                onClick={() => handleOpenFreeBenefitSelector('free_product')}
                                                disabled={isAddingProduct}
                                                style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#1565c0', color: 'white', cursor: 'pointer', fontSize: '12px' }}
                                            >
                                                🎁 Producto gratis
                                            </button>
                                        )}
                                        {currentMembership && currentCustomer.bottle_credits_available > 0 && currentMembership.membership_plans?.membership_plan_benefits?.some(b => b.benefit_type === 'free_bottle_milestone') && (
                                            <button
                                                type="button"
                                                onClick={() => handleOpenFreeBenefitSelector('free_bottle_milestone')}
                                                disabled={isAddingProduct}
                                                style={{ padding: '6px 12px', borderRadius: '8px', border: 'none', background: '#6a1b9a', color: 'white', cursor: 'pointer', fontSize: '12px' }}
                                            >
                                                🍾 Canjear botella ({currentCustomer.bottle_credits_available})
                                            </button>
                                        )}
                                    </div>
                                )}

                                {/* DISCOUNT DISPLAY */}
                                {discountAmount > 0 && currentComanda?.status === 'open' && (
                                    <div style={{ marginTop: '8px', fontSize: '13px', color: '#66bb6a' }}>
                                        Descuento membresía ({membershipDiscountPct}%): -${discountAmount.toFixed(2)}
                                        {' · '}Total con descuento: ${displayedTotal.toFixed(2)}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* MEMBERSHIP RENEWAL MODAL */}
                        {membershipRenewalState.open && (
                            <div style={{ marginTop: '10px', padding: '14px', background: '#1a1a1a', borderRadius: '10px', border: '1px solid #f57c00' }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>Activar membresía para {currentCustomer?.name}</div>
                                <select
                                    value={membershipRenewalState.selectedPlanId}
                                    onChange={e => setMembershipRenewalState(p => ({ ...p, selectedPlanId: e.target.value }))}
                                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #444', background: '#111', color: 'white', marginBottom: '10px' }}
                                >
                                    {membershipRenewalState.plans.map(plan => (
                                        <option key={plan.id} value={plan.id}>
                                            {plan.name} — ${plan.price_monthly}/mes
                                            {!plan.product_id && ' ⚠ Sin producto vinculado'}
                                        </option>
                                    ))}
                                </select>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={handleActivateMembership}
                                        disabled={isProcessingMembership}
                                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#2e7d32', color: 'white', cursor: 'pointer', fontWeight: 'bold' }}
                                    >
                                        {isProcessingMembership ? 'Activando...' : 'Activar y agregar a cuenta'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setMembershipRenewalState({ open: false, plans: [], selectedPlanId: '' })}
                                        style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', background: '#555', color: 'white', cursor: 'pointer' }}
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* FREE BENEFIT SELECTOR MODAL */}
                        {freeBenefitState.open && freeBenefitState.benefit && (
                            <div style={{ marginTop: '10px', padding: '14px', background: '#1a1a1a', borderRadius: '10px', border: '1px solid #1565c0' }}>
                                <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
                                    {freeBenefitState.type === 'free_bottle_milestone' ? '🍾 Seleccionar botella gratis' : '🎁 Seleccionar producto gratis'}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                                    {(freeBenefitState.benefit.membership_benefit_products || []).map(bp => (
                                        <button
                                            key={bp.id}
                                            type="button"
                                            onClick={() => handleAddFreeBenefit(bp.product_id)}
                                            disabled={isAddingProduct}
                                            style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #1565c0', background: '#111', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                                        >
                                            {bp.products?.name}
                                        </button>
                                    ))}
                                    {(freeBenefitState.benefit.membership_benefit_products || []).length === 0 && (
                                        <span style={{ opacity: 0.5, fontSize: '13px' }}>No hay productos configurados para este beneficio.</span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setFreeBenefitState({ open: false, type: null, benefit: null })}
                                    style={{ padding: '6px 14px', borderRadius: '8px', border: 'none', background: '#555', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        )}

                        <div
                            style={{
                                marginTop: '10px',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '16px',
                                flexWrap: 'wrap',
                            }}
                        >
                            <div style={{ fontSize: '15px', opacity: 0.9 }}>
                                Estado: {currentComanda?.status}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '15px', opacity: 0.9 }}>Personas:</span>

                                <button
                                    type="button"
                                    onClick={() => handlePersonasChange(-1)}
                                    disabled={!canEditPersonas || isUpdatingPersonas}
                                    style={{
                                        width: '34px',
                                        height: '34px',
                                        borderRadius: '6px',
                                        border: '1px solid #444',
                                        background: '#222',
                                        color: 'white',
                                        cursor: 'pointer',
                                    }}
                                >
                                    -
                                </button>

                                <div
                                    style={{
                                        minWidth: '44px',
                                        textAlign: 'center',
                                        padding: '6px 10px',
                                        background: '#222',
                                        borderRadius: '6px',
                                        fontWeight: 'bold',
                                    }}
                                >
                                    {currentComanda?.personas ?? 0}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => handlePersonasChange(1)}
                                    disabled={!canEditPersonas || isUpdatingPersonas}
                                    style={{
                                        width: '34px',
                                        height: '34px',
                                        borderRadius: '6px',
                                        border: '1px solid #444',
                                        background: '#222',
                                        color: 'white',
                                        cursor: 'pointer',
                                    }}
                                >
                                    +
                                </button>
                            </div>
                        </div>
                    </div>

                    <ShotMixerSelector
                        state={shotSelectorState}
                        availableMixers={availableMixers}
                        requiredMixers={requiredShotMixers}
                        isAddingProduct={isAddingProduct}
                        onSelectMixer={toggleMixerSelection}
                        onRemoveMixer={removeSelectedMixer}
                        onConfirm={handleConfirmShotMixers}
                        onCancel={resetShotSelector}
                    />

                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: '1.3fr 1fr',
                            gap: '16px',
                        }}
                    >
                        <ProductCatalog
                            groupedProducts={groupedProducts}
                            currentComanda={currentComanda}
                            isAddingProduct={isAddingProduct}
                            isChangingCart={isChangingCart}
                            isUpdatingComandaStatus={isUpdatingComandaStatus}
                            shotSelectorState={shotSelectorState}
                            onAddProduct={handleAddProduct}
                            getCategoryColor={getCategoryColor}
                            money={money}
                        />

                        <ComandaPanel
                            currentComanda={currentComanda}
                            visibleCartItems={visibleCartItems}
                            isChangingCart={isChangingCart}
                            isAddingProduct={isAddingProduct}
                            shotSelectorState={shotSelectorState}
                            displayedTotal={displayedTotal}
                            isUpdatingComandaStatus={isUpdatingComandaStatus}
                            currentUser={currentUser}
                            isConfirmingPayment={isConfirmingPayment}
                            paymentData={paymentData}
                            propinaFieldValue={propinaFieldValue}
                            paymentSummary={paymentSummary}
                            onDecreaseCartItem={handleDecreaseCartItem}
                            onIncreaseCartItem={handleIncreaseCartItem}
                            onPresentBill={handlePresentBill}
                            onReopenComanda={handleReopenComanda}
                            onCancelMesa={handleCancelMesa}
                            onStartPayment={handleStartPayment}
                            onPaymentFieldChange={handlePaymentFieldChange}
                            onResetAutoTip={handleResetAutoTip}
                            onConfirmPayment={handleConfirmPayment}
                        />
                    </div>
                </main>
            )}
        </div>
    );
}

export default PosPage;