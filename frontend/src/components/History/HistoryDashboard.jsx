'use client';

import { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Users, CheckSquare, Loader2, Trash2 } from 'lucide-react';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

export default function HistoryDashboard({ onBack, onSelectSession, token }) {
    const [sessions, setSessions] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchSessions();
    }, []);

    const fetchSessions = async () => {
        try {
            const res = await fetch(`${SOCKET_URL}/history`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setSessions(data.sessions || []);
            }
        } catch (err) {
            console.error('Failed to fetch history:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (e, sessionId) => {
        e.stopPropagation();
        if (!confirm('Delete this session?')) return;
        try {
            const res = await fetch(`${SOCKET_URL}/history/${sessionId}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
            }
        } catch (err) {
            console.error('Failed to delete session:', err);
        }
    };

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
        });
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0m';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m}m`;
    };

    return (
        <div className="relative min-h-screen bg-[#0A0A0A] overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[#556B2F]/6 blur-[120px] animate-glow-pulse" />
            </div>

            <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={onBack}
                        className="w-10 h-10 rounded-full frost-glass frost-glass-hover flex items-center justify-center transition-all duration-300"
                    >
                        <ArrowLeft size={18} className="text-white/60" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-satoshi font-black text-white/90">Call History</h1>
                        <p className="text-white/30 text-sm font-cabinet mt-0.5">Review past calls, tasks, and transcripts</p>
                    </div>
                </div>

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-20">
                        <Loader2 size={24} className="text-[#6B8E3D] animate-spin" />
                    </div>
                )}

                {/* Empty state */}
                {!loading && sessions.length === 0 && (
                    <div className="text-center py-20">
                        <Clock size={40} className="text-white/10 mx-auto mb-4" />
                        <p className="text-white/30 text-sm font-cabinet">No call history yet.</p>
                        <p className="text-white/15 text-xs font-cabinet mt-1">Your past calls will appear here after you end a session.</p>
                    </div>
                )}

                {/* Session cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {sessions.map((session) => (
                        <div
                            key={session.sessionId}
                            onClick={() => onSelectSession(session.sessionId)}
                            className="group text-left p-5 rounded-2xl frost-glass-card transition-all duration-300 hover:border-[#556B2F]/30 hover:shadow-[0_8px_32px_rgba(85,107,47,0.1)] cursor-pointer"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <div>
                                    <span className="text-white/90 text-sm font-satoshi font-bold">
                                        Room {session.roomId}
                                    </span>
                                    <p className="text-white/30 text-xs font-cabinet mt-0.5">{formatDate(session.date)}</p>
                                </div>
                                <button
                                    onClick={(e) => handleDelete(e, session.sessionId)}
                                    className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center text-red-400 hover:bg-red-500/20 transition-all duration-200"
                                >
                                    <Trash2 size={12} />
                                </button>
                            </div>

                            <div className="flex items-center gap-4 text-white/40 text-xs font-cabinet">
                                <span className="flex items-center gap-1.5">
                                    <Clock size={11} /> {formatDuration(session.duration)}
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <Users size={11} /> {session.participantCount}
                                </span>
                                {session.taskCount > 0 && (
                                    <span className="flex items-center gap-1.5 text-[#6B8E3D]">
                                        <CheckSquare size={11} /> {session.taskCount} tasks
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
