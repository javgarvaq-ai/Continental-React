import { useNavigate } from 'react-router-dom'

export const ADMIN_NAV_WIDTH = 200 // px — pages offset their paddingLeft by this + 16

const NAV_SECTIONS = [
    {
        label: 'Vistas',
        items: [
            { label: 'POS',           path: '/pos'                    },
            { label: '📊 Dashboard',  path: '/dashboard'              },
            { label: '🧾 Folios',     path: '/admin/folios'           },
            { label: '📈 Analytics',  path: '/analytics'              },
            { label: '💰 Reporte',   path: '/weekly-report'          },
            { label: '👥 Clientes',   path: '/customers/intelligence' },
            { label: '📦 Inventario', path: '/inventory/dashboard'    },
            { label: '💵 Movimientos', path: '/admin/cash-movements'  },
            { label: '🕐 Turnos',     path: '/admin/shifts'           },
            { label: '📋 Eventos',    path: '/admin/comanda-events'   },
        ],
    },
    {
        label: 'Configuración',
        items: [
            { label: 'Usuarios',       path: '/admin/users'            },
            { label: 'Categorías',     path: '/admin/categories'       },
            { label: 'Productos',      path: '/admin/products'         },
            { label: 'Inventario',     path: '/admin/inventory-items'  },
            { label: 'Recetas',        path: '/admin/recipe-mappings'  },
            { label: 'Membresías',     path: '/admin/membership-plans' },
            { label: 'Clientes',       path: '/admin/customers'        },
            { label: 'Mesas/Unidades', path: '/admin/units'            },
            { label: 'Empleados',      path: '/admin/employees'        },
            { label: 'Horarios',       path: '/admin/schedule'         },
        ],
    },
]

function AdminNav({ currentPath }) {
    const navigate = useNavigate()

    return (
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: `${ADMIN_NAV_WIDTH}px`,
            height: '100vh',
            background: '#0a0a0a',
            borderRight: '1px solid #1e1e1e',
            overflowY: 'auto',
            zIndex: 50,
            boxSizing: 'border-box',
            padding: '16px 8px',
            display: 'flex',
            flexDirection: 'column',
        }}>
            {NAV_SECTIONS.map((section, si) => (
                <div key={section.label}>
                    {si > 0 && (
                        <div style={{
                            height: '1px',
                            background: '#1e1e1e',
                            margin: '10px 6px',
                        }} />
                    )}
                    <div style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        letterSpacing: '0.09em',
                        textTransform: 'uppercase',
                        color: '#3a3a3a',
                        padding: '0 8px 6px',
                    }}>
                        {section.label}
                    </div>
                    {section.items.map(item => {
                        const isActive = currentPath === item.path
                        return (
                            <button
                                key={item.path}
                                type="button"
                                onClick={() => navigate(item.path)}
                                style={{
                                    display: 'block',
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid',
                                    borderColor: item.dev
                                        ? (isActive ? '#d97706' : 'transparent')
                                        : (isActive ? '#4a90d9' : 'transparent'),
                                    background: item.dev
                                        ? (isActive ? '#451a03' : 'transparent')
                                        : (isActive ? '#1d3557' : 'transparent'),
                                    color: item.dev
                                        ? '#fbbf24'
                                        : (isActive ? '#e2e8f0' : '#666'),
                                    cursor: 'pointer',
                                    fontSize: '13px',
                                    fontWeight: isActive ? 600 : 400,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    marginBottom: '1px',
                                    transition: 'background 0.15s, color 0.15s',
                                }}
                            >
                                {item.label}
                            </button>
                        )
                    })}
                </div>
            ))}
        </div>
    )
}

export default AdminNav
