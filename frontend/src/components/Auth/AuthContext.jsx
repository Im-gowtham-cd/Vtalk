'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useSocket } from '@/hooks/useSocket';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const { refreshSocket } = useSocket();

    // On mount, check localStorage for existing token
    useEffect(() => {
        const stored = localStorage.getItem('vtalk_token');
        if (stored) {
            setToken(stored);
            fetchMe(stored);
        } else {
            setIsLoading(false);
        }
    }, []);

    const fetchMe = async (jwt) => {
        try {
            const res = await fetch(`${SOCKET_URL}/auth/me`, {
                headers: { Authorization: `Bearer ${jwt}` },
            });
            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
                setToken(jwt);
                refreshSocket(jwt);
            } else {
                // Token expired or invalid
                localStorage.removeItem('vtalk_token');
                setToken(null);
                setUser(null);
            }
        } catch {
            localStorage.removeItem('vtalk_token');
            setToken(null);
            setUser(null);
        } finally {
            setIsLoading(false);
        }
    };

    const login = useCallback(async (email, password) => {
        const res = await fetch(`${SOCKET_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        localStorage.setItem('vtalk_token', data.token);
        setToken(data.token);
        setUser(data.user);
        refreshSocket(data.token);
        return data;
    }, [refreshSocket]);

    const signup = useCallback(async (name, email, password) => {
        const res = await fetch(`${SOCKET_URL}/auth/signup`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Signup failed');
        localStorage.setItem('vtalk_token', data.token);
        setToken(data.token);
        setUser(data.user);
        refreshSocket(data.token);
        return data;
    }, [refreshSocket]);

    const logout = useCallback(() => {
        localStorage.removeItem('vtalk_token');
        setToken(null);
        setUser(null);
        refreshSocket(null);
    }, []);

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                isAuthenticated: !!user,
                isLoading,
                login,
                signup,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}

export default AuthContext;
