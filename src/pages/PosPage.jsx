import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useCustomer } from '../hooks/useCustomer';
import { useComanda } from '../hooks/useComanda';
import { usePayment } from '../hooks/usePayment';
import { useShift } from '../hooks/useShift';
import { getOrCreateActiveComanda, cancelComanda } from '../services/comandas';
import MesaGrid from '../components/MesaGrid';
import ShotMixerSelector from '../components/ShotMixerSelector';
import ComandaPanel from '../components/ComandaPanel';
import ProductCatalog from '../components/ProductCatalog';
import TopBar from '../components/TopBar'
import CashMovementPanel from '../components/CashMovementPanel'
import ShiftPanel from '../components/ShiftPanel';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { requireOnline } from '../utils/requireOnline';
import {
    getProductsCatalog,
    getActiveCartItems,
} from '../services/products';
import { printTicket } from '../components/Ticket';
import { supabase } from '../services/supabase';
import {
    getCustomerWithMembership,
    getCustomerByIdWithMembership,
} from '../services/membership';
import { getCategoryColor } from '../config/categoryColors';
import { money } from '../utils/money';


function PosPage() {
    const navigate = useNavigate();
    const currentUser = useAuthStore(state => state.user);
    const currentShiftId = useAuthStore(state => state.shiftId);
    const clearAuth = useAuthStore(state => state.clearAuth);
    const clearUser = useAuthStore(state => state.clearUser);
    const [status, setStatus] = useState('Cargando mesas...');
    // Shared state — owned by PosPage because multiple hooks need it
    const [currentComanda, setCurrentComanda] = useState(null);
    const [groupedProducts, setGroupedProducts] = useState({});
    const [cartItems, setCartItems] = useState([]);
    const [isCancellingMesa, setIsCancellingMesa] = useState(false);
    const isOnline = useOnlineStatus()

    // Derived cart values — computed before hooks so they can be passed down
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

    // useCustomer — needs cartTotal (computed above)
    const {
        currentCustomer,
        setCurrentCustomer,
        currentMembership,
        setCurrentMembership,
        customerSearchState,
        setCustomerSearchState,
        membershipRenewalState,
        setMembershipRenewalState,
        freeBenefitState,
        setFreeBenefitState,
        isProcessingMembership,
        isSearchingCustomer,
        membershipDiscountPct,
        discountAmount,
        resetCustomerState,
        handleSearchCustomer,
        handleAssignCustomer,
        handleCreateAndAssignCustomer,
        handleOpenMembershipRenewal,
        handleActivateMembership,
        handleCancelMembership,
        handleOpenFreeBenefitSelector,
        handleAddFreeBenefit,
    } = useCustomer({
        currentComanda,
        cartTotal,
        setStatus,
        onUpdateComanda: (fields) => setCurrentComanda(prev => ({ ...prev, ...fields })),
        onReloadComanda: reloadCart,
    });

    // useComanda — needs currentMembership (from useCustomer above)
    const {
        units,
        selectedUnit,
        setSelectedUnit,
        isAddingProduct,
        isChangingCart,
        isUpdatingPersonas,
        availableMixers,
        shotSelectorState,
        requiredShotMixers,
        canEditPersonas,
        loadUnits,
        resetShotSelector,
        handleAddProduct,
        handleIncreaseCartItem,
        handleDecreaseCartItem,
        handlePersonasChange,
        toggleMixerSelection,
        removeSelectedMixer,
        handleConfirmShotMixers,
    } = useComanda({
        currentUser,
        currentMembership,
        currentComanda,
        setCurrentComanda,
        productsById,
        isOnline,
        setStatus,
        onLoadComanda: reloadCart,
    });

    // usePayment — needs membershipDiscountPct/discountAmount (from useCustomer) and loadUnits (from useComanda)
    const {
        paymentData,
        isUpdatingComandaStatus,
        isConfirmingPayment,
        displayedTotal,
        paymentSummary,
        propinaFieldValue,
        resetPaymentState,
        handlePaymentFieldChange,
        handleResetAutoTip,
        handlePresentBill,
        handleReopenComanda,
        handleStartPayment,
        handleConfirmPayment,
    } = usePayment({
        currentUser,
        currentShiftId,
        currentComanda,
        setCurrentComanda,
        currentCustomer,
        currentMembership,
        membershipDiscountPct,
        discountAmount,
        cartTotal,
        visibleCartItems,
        selectedUnit,
        setStatus,
        onBackToUnits: handleBackToUnits,
        onLoadUnits: loadUnits,
    });

    // useShift — shift lifecycle, cash movements, panel state
    const {
        cashPanelOpen,
        setCashPanelOpen,
        isSubmittingCash,
        shiftPanelOpen,
        setShiftPanelOpen,
        fetchShiftPanelData,
        handleConfirmCloseShift,
        handleCashMovementSubmit,
    } = useShift({
        currentUser,
        currentShiftId,
        setStatus,
        onShiftClosed: () => { clearAuth(); navigate('/'); },
    });

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


    function handleChangeUser() {
        const confirmed = window.confirm(
            '¿Deseas cambiar de usuario sin cerrar el turno?'
        );

        if (!confirmed) return;

        clearUser();

        setSelectedUnit(null);
        setCurrentComanda(null);
        setGroupedProducts({});
        setCartItems([]);
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

    function handleInventory() {
        navigate('/inventory');
    }

    // Full load: fetches catalog + cart. Used when first opening a comanda.
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

    // Cart-only reload: used after add/remove/benefit operations — catalog doesn't change.
    async function reloadCart(comandaId) {
        const { data, error } = await getActiveCartItems(comandaId);

        if (error) {
            setStatus(`Error actualizando carrito: ${error.message}`);
            return;
        }

        setCartItems(data || []);
    }

    function handleLogout() {
        clearAuth();
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
            prefetchedExisting: existing,
        })

        if (error || !data) {
            setStatus(`Error abriendo comanda: ${error?.message || 'desconocido'}`)
            return
        }

        // Link customer to comanda if found
        if (isNew && pendingCustomerData) {
            const { error: linkError } = await supabase
                .from('comandas')
                .update({ customer_id: pendingCustomerData.customer.id })
                .eq('id', data.id)
            if (linkError) {
                setStatus(`Comanda abierta, pero no se pudo vincular el cliente: ${linkError.message}`)
            }
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
        if (isCancellingMesa) return;

        setIsCancellingMesa(true);
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
            setIsCancellingMesa(false);
        }
    }

    const folioDisplay = currentComanda?.folio
        ? `C-${String(currentComanda.folio).padStart(6, '0')}`
        : '';

    const customerDisplay = currentComanda?.customer_name
        ? ` • ${currentComanda.customer_name}`
        : '';

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
                onCashMovement={() => setCashPanelOpen(true)}
                onShiftPanel={() => setShiftPanelOpen(true)}
                onInventory={handleInventory}
                onWeeklyReport={handleWeeklyReport}
            />

            <CashMovementPanel
                open={cashPanelOpen}
                onClose={() => setCashPanelOpen(false)}
                onSubmit={handleCashMovementSubmit}
                isSubmitting={isSubmittingCash}
            />

            <ShiftPanel
                open={shiftPanelOpen}
                onClose={() => setShiftPanelOpen(false)}
                currentUser={currentUser}
                onFetchData={fetchShiftPanelData}
                onConfirmClose={handleConfirmCloseShift}
                onOpenCashMovement={() => setCashPanelOpen(true)}
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
                                                        onClick={() => setCustomerSearchState({ open: false, query: '', results: [], notFound: false, showCreateForm: false, newName: '', newPhone: '' })}
                                                        style={{ padding: '8px 12px', borderRadius: '8px', border: 'none', background: '#333', color: 'white', cursor: 'pointer', fontSize: '13px' }}
                                                    >
                                                        ✕
                                                    </button>
                                                </div>

                                                {customerSearchState.results.length > 0 && (
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                                                        {customerSearchState.results.map((item) => (
                                                            <div key={item.customer.id} style={{ background: '#111', borderRadius: '8px', padding: '10px' }}>
                                                                <div style={{ fontSize: '13px', fontWeight: 'bold' }}>
                                                                    #{item.customer.customer_number} — {item.customer.name}
                                                                </div>
                                                                <div style={{ fontSize: '12px', opacity: 0.7, marginTop: '2px' }}>
                                                                    {item.customer.phone && (
                                                                        <span>{item.customer.phone}{' · '}</span>
                                                                    )}
                                                                    {item.activeMembership
                                                                        ? `Membresía activa: ${item.activeMembership.membership_plans?.name}`
                                                                        : 'Sin membresía activa'}
                                                                    {' · '}{item.customer.visit_count} visitas
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => handleAssignCustomer(item)}
                                                                    disabled={isProcessingMembership}
                                                                    style={{ marginTop: '8px', padding: '6px 14px', borderRadius: '8px', border: 'none', background: '#2e7d32', color: 'white', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                                                                >
                                                                    Asignar a esta mesa
                                                                </button>
                                                            </div>
                                                        ))}
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
                                        {currentMembership && currentComanda?.status === 'open' && (
                                            <button
                                                type="button"
                                                onClick={handleCancelMembership}
                                                disabled={isProcessingMembership}
                                                style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #c62828', background: 'transparent', color: '#ef9a9a', cursor: 'pointer', fontSize: '12px' }}
                                            >
                                                {isProcessingMembership ? 'Cancelando...' : 'Cancelar membresía'}
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