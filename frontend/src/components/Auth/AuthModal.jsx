'use client';

import { useState } from 'react';
import { useAuth } from './AuthContext';
import { Video, Mail, Lock, User, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';

export default function AuthModal() {
    const { login, signup } = useAuth();
    const [tab, setTab] = useState('login'); // 'login' | 'signup'
    const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
    const [errors, setErrors] = useState({});
    const [globalError, setGlobalError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const switchTab = (t) => {
        setTab(t);
        setErrors({});
        setGlobalError('');
    };

    const validate = () => {
        const e = {};
        if (tab === 'signup' && !form.name.trim()) e.name = 'Name is required';
        if (!form.email.trim()) e.email = 'Email is required';
        else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Invalid email format';
        if (!form.password) e.password = 'Password is required';
        else if (form.password.length < 8) e.password = 'Min 8 characters';
        if (tab === 'signup' && form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        setLoading(true);
        setGlobalError('');
        try {
            if (tab === 'login') {
                await login(form.email, form.password);
            } else {
                await signup(form.name.trim(), form.email, form.password);
            }
        } catch (err) {
            setGlobalError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const updateField = (field, value) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setErrors((prev) => ({ ...prev, [field]: undefined }));
        setGlobalError('');
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0A0A0A]">
            {/* Ambient glow */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[#556B2F]/10 blur-[120px] animate-glow-pulse" />
                <div className="absolute bottom-1/4 right-1/3 w-[300px] h-[300px] rounded-full bg-[#556B2F]/5 blur-[100px] animate-glow-drift" />
            </div>

            {/* Card */}
            <div className="relative w-full max-w-md mx-4 animate-fade-in-up">
                {/* Logo */}
                <div className="text-center mb-6">
                    <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-[#556B2F]/20 backdrop-blur-xl border border-[#556B2F]/30 shadow-[0_8px_32px_rgba(85,107,47,0.15)] flex items-center justify-center">
                        <Video size={24} className="text-[#6B8E3D]" />
                    </div>
                    <h1 className="text-3xl font-black tracking-tight font-satoshi">
                        <span className="text-[#556B2F]">Spice</span><span className="text-[#6B8E3D]">Z</span>
                        <span className="text-white/90">-Cam</span>
                    </h1>
                    <p className="text-white/30 text-sm font-cabinet mt-1">Peer-to-peer video, no strings attached</p>
                </div>

                {/* Glass card */}
                <div className="frost-glass-card rounded-2xl overflow-hidden">
                    {/* Tabs */}
                    <div className="flex border-b border-white/[0.06]">
                        {['login', 'signup'].map((t) => (
                            <button
                                key={t}
                                onClick={() => switchTab(t)}
                                className={`flex-1 py-3.5 text-sm font-satoshi font-bold capitalize transition-all duration-300 relative ${tab === t ? 'text-[#6B8E3D]' : 'text-white/30 hover:text-white/50'
                                    }`}
                            >
                                {t === 'login' ? 'Sign In' : 'Create Account'}
                                {tab === t && (
                                    <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-12 h-0.5 bg-[#6B8E3D] rounded-full" />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="p-6 space-y-4">
                        {globalError && (
                            <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-cabinet">
                                {globalError}
                            </div>
                        )}

                        {tab === 'signup' && (
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-white/40 text-xs font-cabinet font-medium">
                                    <User size={12} /> Full Name
                                </label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={(e) => updateField('name', e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl frost-glass-input text-white/90 text-sm font-cabinet placeholder:text-white/20 outline-none transition-all duration-200"
                                    placeholder="Arjun Kumar"
                                />
                                {errors.name && <span className="text-red-400 text-[11px] font-cabinet">{errors.name}</span>}
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label className="flex items-center gap-1.5 text-white/40 text-xs font-cabinet font-medium">
                                <Mail size={12} /> Email
                            </label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={(e) => updateField('email', e.target.value)}
                                className="w-full px-4 py-3 rounded-xl frost-glass-input text-white/90 text-sm font-cabinet placeholder:text-white/20 outline-none transition-all duration-200"
                                placeholder="you@example.com"
                            />
                            {errors.email && <span className="text-red-400 text-[11px] font-cabinet">{errors.email}</span>}
                        </div>

                        <div className="space-y-1.5">
                            <label className="flex items-center gap-1.5 text-white/40 text-xs font-cabinet font-medium">
                                <Lock size={12} /> Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={form.password}
                                    onChange={(e) => updateField('password', e.target.value)}
                                    className="w-full px-4 py-3 pr-10 rounded-xl frost-glass-input text-white/90 text-sm font-cabinet placeholder:text-white/20 outline-none transition-all duration-200"
                                    placeholder="••••••••"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/50 transition-colors"
                                >
                                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                            {errors.password && <span className="text-red-400 text-[11px] font-cabinet">{errors.password}</span>}
                        </div>

                        {tab === 'signup' && (
                            <div className="space-y-1.5">
                                <label className="flex items-center gap-1.5 text-white/40 text-xs font-cabinet font-medium">
                                    <Lock size={12} /> Confirm Password
                                </label>
                                <input
                                    type="password"
                                    value={form.confirmPassword}
                                    onChange={(e) => updateField('confirmPassword', e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl frost-glass-input text-white/90 text-sm font-cabinet placeholder:text-white/20 outline-none transition-all duration-200"
                                    placeholder="••••••••"
                                />
                                {errors.confirmPassword && <span className="text-red-400 text-[11px] font-cabinet">{errors.confirmPassword}</span>}
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full mt-2 py-3.5 rounded-xl bg-[#556B2F] text-white font-satoshi font-bold text-sm transition-all duration-300 hover:bg-[#6B8E3D] hover:shadow-[0_8px_32px_rgba(85,107,47,0.3)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <>
                                    {tab === 'login' ? 'Sign In' : 'Create Account'}
                                    <ArrowRight size={16} />
                                </>
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
