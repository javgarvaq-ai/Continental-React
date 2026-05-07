import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useCustomer } from '../hooks/useCustomer';
import { useComanda } from '../hooks/useComanda';
import { usePayment } from '../hooks/usePayment';
import { useShift } from '../hooks/useShift';
import { getOrCreateActiveComanda, cancelComanda, getActiveComandaByUnit, assignCustomerToComanda } from '../services/comandas';
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
import {
    getCustomerWithMembership,
    getCustomerByIdWithMembership,
} from '../services/membership';
import { getComandaByFolio, getReprintData } from '../services/tickets';
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
    const [cancelConfirming, setCancelConfirming] = useState(false)
    const [changeUserDialog, setChangeUserDialog] = useState(false)
    const [openTableDialog, setOpenTableDialog] = useState({ open: false, unit: null, existing: null, input: '', searching: false, notFound: false })
    const [reprintDialog, setReprintDialog] = useState({ open: false, folioInput: '', phase: 'folio', comanda: null, loading: false, error: '' })
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
        cancelMembershipConfirming,
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
        setChangeUserDialog(true)
    }

    function doChangeUser() {
        setChangeUserDialog(false)
        clearUser()
        setSelectedUnit(null)
        setCurrentComanda(null)
        setGroupedProducts({})
        setCartItems([])
        resetPaymentState()
        resetShotSelector()
        navigate('/login')
    }

    function handleReprintTicket() {
        setReprintDialog({ open: true, folioInput: '', phase: 'folio', comanda: null, loading: false, error: '' })
    }

    async function handleReprintFolioSubmit() {
        let raw = reprintDialog.folioInput.trim()
        if (!raw) return
        if (raw.toUpperCase().startsWith('C-')) raw = raw.substring(2)
        const folioNumero = parseInt(raw, 10)
        if (isNaN(folioNumero)) {
            setReprintDialog(d => ({ ...d, error: 'Folio inválido. Ejemplo: 68 o C-000068.' }))
            return
        }
        setReprintDialog(d => ({ ...d, loading: true, error: '' }))
        const { data: comanda, error } = await getComandaByFolio(folioNumero)
        if (error || !comanda) {
            setReprintDialog(d => ({ ...d, loading: false, error: 'No se encontró una comanda con ese folio.' }))
            return
        }
        if (comanda.status === 'paid') {
            setReprintDialog(d => ({ ...d, loading: false, phase: 'type', comanda }))
        } else {
            setReprintDialog(d => ({ ...d, loading: false }))
            await doPrintTicket({ tipo: 'cuenta', comanda })
            setReprintDialog({ open: false, folioInput: '', phase: 'folio', comanda: null, loading: false, error: '' })
        }
    }

    async function doPrintTicket({ tipo, comanda }) {
        const { items, unit, payment } = await getReprintData({ comanda, tipo, userId: currentUser?.id })
        printTicket({ tipo, comanda, items, unit, payment })
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

        const { data: existing, error: existingError } = await getActiveComandaByUnit({ unitId: unit.id })

        if (existingError) {
            setStatus(`Error abriendo comanda: ${existingError.message}`)
            return
        }

        const isNew = !existing || existing.length === 0

        if (isNew) {
            // Open the dialog — user picks customer name/number before creating the comanda
            setOpenTableDialog({ open: true, unit, existing, input: '', searching: false, notFound: false })
            setStatus('')
            return
        }

        // Existing comanda — load it directly
        await doOpenTable({ unit, existing, customerName: '', pendingCustomerData: null, isNew: false })
    }

    async function handleOpenTableSubmit() {
        const { unit, existing, input } = openTableDialog
        const trimmed = (input || '').trim()

        if (trimmed && /^\d+$/.test(trimmed)) {
            setOpenTableDialog(d => ({ ...d, searching: true, notFound: false }))
            const { data: customerData } = await getCustomerWithMembership(trimmed)
            if (customerData) {
                setOpenTableDialog(d => ({ ...d, searching: false }))
                await doOpenTable({ unit, existing, customerName: customerData.customer.name, pendingCustomerData: customerData, isNew: true })
            } else {
                setOpenTableDialog(d => ({ ...d, searching: false, notFound: true }))
            }
            return
        }

        await doOpenTable({ unit, existing, customerName: trimmed, pendingCustomerData: null, isNew: true })
    }

    async function doOpenTable({ unit, existing, customerName, pendingCustomerData, isNew }) {
        setOpenTableDialog({ open: false, unit: null, existing: null, input: '', searching: false, notFound: false })

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

        if (isNew && pendingCustomerData) {
            const { error: linkError } = await assignCustomerToComanda({
                comandaId: data.id,
                customerId: pendingCustomerData.customer.id,
                customerName: pendingCustomerData.customer.name,
            })
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
            setStatus('No autorizado. Solo un manager o admin puede cancelar una mesa con productos.');
            return;
        }

        // Double-confirm pattern: first click arms, second click fires
        if (!cancelConfirming) {
            setCancelConfirming(true);
            setTimeout(() => setCancelConfirming(false), 3000);
            return;
        }
        setCancelConfirming(false);
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
                    alignItems: 'flex-start',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid #222',
                }}
            >
                <div>
                    <h1 style={{ margin: '0 0 4px 0', fontSize: '22px', fontWeight: 700, color: '#e8e8e8', letterSpacing: '-0.3px' }}>
                        Continental POS
                    </h1>
                    <p style={{ margin: 0, fontSize: '13px', color: '#777' }}>
                        {currentUser ? `${currentUser.name} · ${currentUser.role}` : 'Cargando...'}
                        {currentShiftId ? (
                            <span style={{ marginLeft: '10px', color: '#444', fontSize: '12px' }}>
                                #{currentShiftId.slice(-8)}
                            </span>
                        ) : null}
                    </p>
                    {status && (
                        <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: '#555' }}>{status}</p>
                    )}
                </div>
                <button
                    onClick={handleLogout}
                    style={{
                        padding: '7px 14px',
                        borderRadius: '6px',
                        border: '1px solid #2e2e2e',
                        background: '#1a1a1a',
                        color: '#888',
                        cursor: 'pointer',
                        fontSize: '13px',
                    }}
                >
                    Salir
                </button>
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
                                                style={{
                                                    padding: '6px 12px', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', transition: 'all 0.15s',
                                                    border: cancelMembershipConfirming ? '1px solid #ef4444' : '1px solid #c62828',
                                                    background: cancelMembershipConfirming ? '#3d1a1a' : 'transparent',
                                                    color: cancelMembershipConfirming ? '#ef4444' : '#ef9a9a',
                                                }}
                                            >
                                                {isProcessingMembership ? 'Cancelando...' : cancelMembershipConfirming ? '¿Confirmar?' : 'Cancelar membresía'}
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
                            cancelConfirming={cancelConfirming}
                            onStartPayment={handleStartPayment}
                            onPaymentFieldChange={handlePaymentFieldChange}
                            onResetAutoTip={handleResetAutoTip}
                            onConfirmPayment={handleConfirmPayment}
                        />
                    </div>
                </main>
            )}

            {/* ── Open Table Dialog ── */}
            {openTableDialog.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '380px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                        <h3 style={{ margin: '0 0 4px 0', fontSize: '18px', fontWeight: 700, color: '#e8e8e8' }}>
                            {openTableDialog.unit?.name}
                        </h3>
                        <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#555' }}>Mesa nueva</p>

                        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                            Cliente (opcional)
                        </label>
                        <input
                            autoFocus
                            type="text"
                            value={openTableDialog.input}
                            onChange={e => setOpenTableDialog(d => ({ ...d, input: e.target.value, notFound: false }))}
                            onKeyDown={e => e.key === 'Enter' && handleOpenTableSubmit()}
                            placeholder="Nombre o número de membresía"
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '7px', border: '1px solid #2a2a2a', background: '#0e0e0e', color: '#e2e2e2', fontSize: '14px', boxSizing: 'border-box', outline: 'none' }}
                        />

                        {openTableDialog.notFound && (
                            <div style={{ marginTop: '10px' }}>
                                <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#fb923c' }}>
                                    Cliente no encontrado.
                                </p>
                                <button
                                    type="button"
                                    onClick={() => doOpenTable({ unit: openTableDialog.unit, existing: openTableDialog.existing, customerName: openTableDialog.input.trim(), pendingCustomerData: null, isNew: true })}
                                    style={{ padding: '7px 14px', borderRadius: '6px', border: '1px solid #3d2a1a', background: '#2a1a0e', color: '#fb923c', fontSize: '13px', cursor: 'pointer', fontWeight: '600' }}
                                >
                                    Continuar sin cliente
                                </button>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                            <button
                                type="button"
                                onClick={() => setOpenTableDialog({ open: false, unit: null, existing: null, input: '', searching: false, notFound: false })}
                                style={{ flex: 1, padding: '10px', borderRadius: '7px', border: '1px solid #222', background: 'transparent', color: '#666', fontSize: '13px', cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleOpenTableSubmit}
                                disabled={openTableDialog.searching}
                                style={{ flex: 2, padding: '10px', borderRadius: '7px', border: '1px solid #2a5a3a', background: '#1a3a2a', color: '#4ade80', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                            >
                                {openTableDialog.searching ? 'Buscando...' : 'Abrir mesa'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Change User Dialog ── */}
            {changeUserDialog && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '340px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                        <h3 style={{ margin: '0 0 8px 0', fontSize: '17px', fontWeight: 700, color: '#e8e8e8' }}>
                            Cambiar usuario
                        </h3>
                        <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: '#666' }}>
                            El turno permanece abierto. Volverás al login para seleccionar otro usuario.
                        </p>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setChangeUserDialog(false)}
                                style={{ flex: 1, padding: '10px', borderRadius: '7px', border: '1px solid #222', background: 'transparent', color: '#666', fontSize: '13px', cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={doChangeUser}
                                style={{ flex: 2, padding: '10px', borderRadius: '7px', border: '1px solid #3a5a8a', background: '#1a2e47', color: '#93c5fd', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                            >
                                Cambiar usuario
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Reprint Ticket Dialog ── */}
            {reprintDialog.open && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ background: '#141414', border: '1px solid #2a2a2a', borderRadius: '12px', padding: '24px', width: '100%', maxWidth: '360px', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
                        <h3 style={{ margin: '0 0 20px 0', fontSize: '17px', fontWeight: 700, color: '#e8e8e8' }}>
                            Reimprimir ticket
                        </h3>

                        {reprintDialog.phase === 'folio' && (
                            <>
                                <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: '#666', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '6px' }}>
                                    Folio
                                </label>
                                <input
                                    autoFocus
                                    type="text"
                                    value={reprintDialog.folioInput}
                                    onChange={e => setReprintDialog(d => ({ ...d, folioInput: e.target.value, error: '' }))}
                                    onKeyDown={e => e.key === 'Enter' && handleReprintFolioSubmit()}
                                    placeholder="68 o C-000068"
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '7px', border: '1px solid #2a2a2a', background: '#0e0e0e', color: '#e2e2e2', fontSize: '16px', boxSizing: 'border-box', outline: 'none' }}
                                />
                                {reprintDialog.error && (
                                    <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#f87171' }}>{reprintDialog.error}</p>
                                )}
                                <div style={{ display: 'flex', gap: '8px', marginTop: '20px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setReprintDialog({ open: false, folioInput: '', phase: 'folio', comanda: null, loading: false, error: '' })}
                                        style={{ flex: 1, padding: '10px', borderRadius: '7px', border: '1px solid #222', background: 'transparent', color: '#666', fontSize: '13px', cursor: 'pointer' }}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleReprintFolioSubmit}
                                        disabled={!reprintDialog.folioInput.trim() || reprintDialog.loading}
                                        style={{ flex: 2, padding: '10px', borderRadius: '7px', border: '1px solid #2a5a3a', background: '#1a3a2a', color: '#4ade80', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}
                                    >
                                        {reprintDialog.loading ? 'Buscando...' : 'Buscar'}
                                    </button>
                                </div>
                            </>
                        )}

                        {reprintDialog.phase === 'type' && reprintDialog.comanda && (
                            <>
                                <p style={{ margin: '0 0 16px 0', fontSize: '13px', color: '#888' }}>
                                    Comanda C-{String(reprintDialog.comanda.folio).padStart(6, '0')} · pagada
                                </p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <button
                                        type="button"
                                        onClick={async () => { await doPrintTicket({ tipo: 'cuenta', comanda: reprintDialog.comanda }); setReprintDialog({ open: false, folioInput: '', phase: 'folio', comanda: null, loading: false, error: '' }) }}
                                        style={{ padding: '12px', borderRadius: '7px', border: '1px solid #2a2a2a', background: '#1e1e1e', color: '#e2e2e2', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}
                                    >
                                        Ticket cliente
                                    </button>
                                    <button
                                        type="button"
                                        onClick={async () => { await doPrintTicket({ tipo: 'pagado', comanda: reprintDialog.comanda }); setReprintDialog({ open: false, folioInput: '', phase: 'folio', comanda: null, loading: false, error: '' }) }}
                                        style={{ padding: '12px', borderRadius: '7px', border: '1px solid #2a2a2a', background: '#1e1e1e', color: '#e2e2e2', fontSize: '14px', cursor: 'pointer', fontWeight: '500' }}
                                    >
                                        Ticket interno
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setReprintDialog(d => ({ ...d, phase: 'folio', comanda: null }))}
                                        style={{ padding: '10px', borderRadius: '7px', border: '1px solid #1a1a1a', background: 'transparent', color: '#555', fontSize: '13px', cursor: 'pointer' }}
                                    >
                                        ← Volver
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default PosPage;
