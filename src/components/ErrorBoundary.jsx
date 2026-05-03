import { Component } from 'react';

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, info) {
        console.error('POS crashed:', error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    padding: '32px',
                    textAlign: 'center',
                    background: '#111',
                    color: 'white',
                }}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
                    <div style={{ fontSize: '22px', fontWeight: 'bold', marginBottom: '8px' }}>
                        Algo salió mal
                    </div>
                    <div style={{ fontSize: '14px', opacity: 0.6, marginBottom: '24px', maxWidth: '400px' }}>
                        {this.state.error?.message || 'Error inesperado en el sistema.'}
                    </div>
                    <button
                        onClick={() => window.location.reload()}
                        style={{
                            padding: '12px 28px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#1565c0',
                            color: 'white',
                            fontSize: '15px',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                        }}
                    >
                        Recargar sistema
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;