import { useNavigate } from 'react-router-dom'

const navButtonStyle = {
    padding: '10px 14px',
    borderRadius: '8px',
    border: '1px solid #555',
    background: '#222',
    color: 'white',
    cursor: 'pointer',
    fontWeight: 'bold',
    fontSize: '13px',
}

const NAV_ITEMS = [
    { label: 'POS', path: '/pos' },
    { label: '📊 Dashboard',   path: '/dashboard'              },
    { label: '🧾 Folios',      path: '/admin/folios'           },
    { label: '📈 Analytics',   path: '/analytics'              },
    { label: '👥 Clientes',    path: '/customers/intelligence' },
    { label: '📦 Inventario',  path: '/inventory/dashboard'   },
    { label: 'Usuarios', path: '/admin/users' },
    { label: 'Categorías', path: '/admin/categories' },
    { label: 'Productos', path: '/admin/products' },
    { label: 'Inventario', path: '/admin/inventory-items' },
    { label: 'Recetas', path: '/admin/recipe-mappings' },
    { label: 'Membresías', path: '/admin/membership-plans' },
    { label: 'Clientes', path: '/admin/customers' },
    { label: 'Mesas/Unidades', path: '/admin/units' },
    { label: 'Empleados', path: '/admin/employees' },
    { label: 'Horarios', path: '/admin/schedule' },
    { label: '🛠 SQL', path: '/admin/sql', dev: true }, // DEV TOOL — remove after QA
]

function AdminNav({ currentPath }) {
    const navigate = useNavigate()

    return (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'nowrap', overflowX: 'auto', paddingBottom: '4px' }}>
            {NAV_ITEMS.map(item => (
                <button
                    key={item.path}
                    type="button"
                    onClick={() => navigate(item.path)}
                    style={{
                        ...navButtonStyle,
                        background: item.dev
                            ? (currentPath === item.path ? '#451a03' : '#1c1208')
                            : (currentPath === item.path ? '#1d3557' : '#222'),
                        borderColor: item.dev
                            ? (currentPath === item.path ? '#d97706' : '#854d0e')
                            : (currentPath === item.path ? '#4a90d9' : '#555'),
                        color: item.dev ? '#fbbf24' : 'white',
                    }}
                >
                    {item.label}
                </button>
            ))}
        </div>
    )
}

export default AdminNav