// src/admin/AdminLogin.jsx
import { useState } from 'react';
import { Person, Lock, BoxArrowRight, ExclamationCircle } from 'react-bootstrap-icons';
import logo from './img/logo.svg'; 
import { API_URL } from '../config/api';
import './css/admin-login.css';

export default function AdminLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const baseUrl = API_URL.replace('/widget', '');
            const loginUrl = `${baseUrl}/admin/login`;

            console.log('Attempting login to:', loginUrl);

            const res = await fetch(loginUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json();

            if (res.ok) {
                console.log('Login Success:', data);
                localStorage.setItem('admin_token', data.token);
                if (data.admin) {
                    localStorage.setItem('admin_info', JSON.stringify(data.admin));
                }

                window.location.href = '/admin';
            } else {
                setError(data.message || 'Invalid email or password');
            }
        } catch (err) {
            console.error('Login Error:', err);
            setError('Unable to connect to server. Please check your backend.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-card">
                
                {/* Logo Section */}
                <div className="text-center mb-4">
                    <img src={logo} alt="Inverz Logo" className="login-logo" />
                    <br></br>
                    <br></br>
                    <p className="text-muted small">Please sign in to continue</p>
                </div>

                {/* Error Alert Box */}
                {error && (
                    <div className="alert alert-danger py-2 small d-flex align-items-center justify-content-center border-0 rounded-3 mb-3" role="alert">
                        <ExclamationCircle className="me-2" />
                        {error}
                    </div>
                )}

                {/* Login Form */}
                <form onSubmit={handleLogin}>
                    <div className="mb-3">
                        <label className="form-label-login">Email Address</label>
                        <div className="input-group-custom">
                            <span className="input-icon"><Person size={18} /></span>
                            <input 
                                type="email" 
                                className="form-control-login" 
                                placeholder="name@example.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="form-label-login">Password</label>
                        <div className="input-group-custom">
                            <span className="input-icon"><Lock size={18} /></span>
                            <input 
                                type="password" 
                                className="form-control-login" 
                                placeholder="••••••••"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                    </div>

                    <button 
                        type="submit" 
                        className="btn-login w-100" 
                        disabled={loading}
                    >
                        {loading ? 'Signing in...' : 'Sign In'} <BoxArrowRight className="ms-2" />
                    </button>
                </form>

                <div className="text-center mt-4">
                    <span className="text-muted small">© 2026 Inverz Solution. All rights reserved.</span>
                </div>
            </div>
        </div>
    );
}