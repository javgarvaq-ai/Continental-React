const CASH_MOVEMENT_CONFIG = {
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
}

export function getCashMovementConfig(category) {
    return CASH_MOVEMENT_CONFIG[category] || null
}
