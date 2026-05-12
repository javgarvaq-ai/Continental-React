import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { checkUsersExist } from '../services/users'

function SetupAdminPage() {
    const [loading, setLoading]       = useState(true)
    const [usersExist, setUsersExist] = useState(false)
    const [status, setStatus]         = useState('Checking system status...')

    useEffect(() => {
        async function check() {
            const { exists, error } = await checkUsersExist()

            if (error) {
                setStatus(`Error checking users: ${error.message}`)
                setLoading(false)
                return
            }

            setUsersExist(exists)
            setLoading(false)
        }

        check()
    }, [])

    if (loading) return null

    if (usersExist) {
        return <Navigate to="/login" replace />
    }

    // The bootstrap user must be created via the Supabase Dashboard:
    //   1. Go to Authentication → Users → Add User
    //   2. Use email: <uuid>@continental.bar, password: 000000
    //   3. Copy the UUID Supabase assigns
    //   4. Run in SQL editor:
    //      INSERT INTO public.users (id, name, role, email, active)
    //      VALUES ('<uuid>', 'Admin', 'admin', '<uuid>@continental.bar', true);
    return (
        <div
            style={{
                minHeight: '100vh',
                background: '#111',
                color: 'white',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'flex-start',
                paddingTop: '80px',
                paddingLeft: '20px',
                paddingRight: '20px',
                boxSizing: 'border-box',
            }}
        >
            <div
                style={{
                    width: '100%',
                    maxWidth: '520px',
                    padding: '24px',
                    background: '#181818',
                    border: '1px solid #2f2f2f',
                    borderRadius: '16px',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
                }}
            >
                <h1 style={{ marginTop: 0, marginBottom: '12px' }}>Initial Setup Required</h1>
                <p style={{ marginTop: 0, marginBottom: '20px', opacity: 0.85 }}>{status}</p>
                <p style={{ opacity: 0.7, lineHeight: 1.6 }}>
                    No users found. The first admin account must be created directly in the
                    Supabase Dashboard. See the setup instructions in{' '}
                    <code style={{ background: '#2a2a2a', padding: '2px 6px', borderRadius: 4 }}>
                        tasks/todo.md
                    </code>
                    .
                </p>
            </div>
        </div>
    )
}

export default SetupAdminPage
