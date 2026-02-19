'use client';

import { useState, useEffect } from 'react';
import {
    ArrowLeft, Clock, Users, CheckSquare, FileDown, ChevronDown,
    ChevronUp, Loader2, AlertCircle, CheckCircle2, Circle,
} from 'lucide-react';
import { exportSessionPDF } from '@/utils/exportPDF';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

const priorityConfig = {
    HIGH: { label: 'High', emoji: '🔴', bgClass: 'bg-red-500/10', borderClass: 'border-l-red-500', textClass: 'text-red-400' },
    MEDIUM: { label: 'Medium', emoji: '🟡', bgClass: 'bg-amber-500/10', borderClass: 'border-l-amber-500', textClass: 'text-amber-400' },
    LOW: { label: 'Low', emoji: '🟢', bgClass: 'bg-emerald-500/10', borderClass: 'border-l-emerald-500', textClass: 'text-emerald-400' },
};

export default function SessionDetail({ sessionId, onBack, token }) {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const [showTranscript, setShowTranscript] = useState(false);
    const [taskStates, setTaskStates] = useState({}); // { taskId: status }

    useEffect(() => {
        fetchSession();
    }, [sessionId]);

    const fetchSession = async () => {
        try {
            const res = await fetch(`${SOCKET_URL}/history/${sessionId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setSession(data.session);
                // Initialize task states
                const states = {};
                (data.session.tasks || []).forEach((t) => { states[t.id] = t.status; });
                setTaskStates(states);
            }
        } catch (err) {
            console.error('Failed to fetch session:', err);
        } finally {
            setLoading(false);
        }
    };

    const toggleTaskStatus = async (taskId) => {
        const current = taskStates[taskId] || 'pending';
        const next = current === 'completed' ? 'pending' : 'completed';
        setTaskStates((prev) => ({ ...prev, [taskId]: next }));

        try {
            await fetch(`${SOCKET_URL}/history/${sessionId}/tasks/${taskId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status: next }),
            });
        } catch {
            // Revert on error
            setTaskStates((prev) => ({ ...prev, [taskId]: current }));
        }
    };

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString('en-IN', {
            day: 'numeric', month: 'long', year: 'numeric',
        });
    };

    const formatDuration = (seconds) => {
        if (!seconds) return '0 minutes';
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        return `${m} minutes`;
    };

    const formatTimestamp = (ts) => {
        const d = new Date(ts);
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
                <Loader2 size={24} className="text-[#6B8E3D] animate-spin" />
            </div>
        );
    }

    if (!session) {
        return (
            <div className="min-h-screen bg-[#0A0A0A] flex flex-col items-center justify-center gap-3">
                <AlertCircle size={32} className="text-white/20" />
                <p className="text-white/30 text-sm font-cabinet">Session not found</p>
                <button onClick={onBack} className="text-[#6B8E3D] text-sm font-satoshi font-bold hover:underline">Go back</button>
            </div>
        );
    }

    const tasks = session.tasks || [];
    const transcript = session.transcript || [];
    const highTasks = tasks.filter((t) => t.priority === 'HIGH');
    const medTasks = tasks.filter((t) => t.priority === 'MEDIUM');
    const lowTasks = tasks.filter((t) => t.priority === 'LOW');

    // Assignments per person
    const assignments = {};
    tasks.forEach((t) => {
        const name = t.assignedTo || 'Unassigned';
        assignments[name] = (assignments[name] || 0) + 1;
    });

    return (
        <div className="relative min-h-screen bg-[#0A0A0A] overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-[#556B2F]/6 blur-[120px] animate-glow-pulse" />
            </div>

            <div className="relative z-10 max-w-3xl mx-auto px-4 py-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={onBack}
                        className="w-10 h-10 rounded-full frost-glass frost-glass-hover flex items-center justify-center transition-all duration-300"
                    >
                        <ArrowLeft size={18} className="text-white/60" />
                    </button>
                    <div className="flex-1">
                        <h1 className="text-xl font-satoshi font-black text-white/90">Room {session.roomId}</h1>
                        <p className="text-white/30 text-xs font-cabinet mt-0.5">{formatDate(session.date)}</p>
                    </div>
                    <button
                        onClick={() => exportSessionPDF(session)}
                        className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#556B2F] text-white text-sm font-satoshi font-bold transition-all duration-300 hover:bg-[#6B8E3D] hover:shadow-[0_8px_32px_rgba(85,107,47,0.3)] active:scale-[0.98]"
                    >
                        <FileDown size={14} />
                        Export PDF
                    </button>
                </div>

                {/* Info pills */}
                <div className="flex flex-wrap gap-2 mb-6">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full frost-glass text-white/40 text-xs font-cabinet">
                        <Clock size={11} /> {formatDuration(session.duration)}
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full frost-glass text-white/40 text-xs font-cabinet">
                        <Users size={11} /> {session.participants?.length || 0} participants
                    </div>
                    {tasks.length > 0 && (
                        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full frost-glass text-[#6B8E3D] text-xs font-cabinet">
                            <CheckSquare size={11} /> {tasks.length} tasks
                        </div>
                    )}
                </div>

                {/* Participants */}
                {session.participants && session.participants.length > 0 && (
                    <div className="mb-6">
                        <h3 className="text-white/50 text-xs font-cabinet font-medium uppercase tracking-wider mb-2">Participants</h3>
                        <div className="flex flex-wrap gap-2">
                            {session.participants.map((p, i) => (
                                <span key={i} className="px-3 py-1.5 rounded-full frost-glass text-white/70 text-xs font-cabinet">
                                    {p.name || 'Anonymous'}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                {/* Tasks Section */}
                {tasks.length > 0 && (
                    <div className="mb-6">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="text-lg">📋</span>
                            <h2 className="text-white/90 text-base font-satoshi font-bold">Tasks Summary</h2>
                            <span className="text-white/30 text-xs font-cabinet ml-auto">{tasks.length} total</span>
                        </div>

                        {[
                            { label: 'HIGH PRIORITY', tasks: highTasks, config: priorityConfig.HIGH },
                            { label: 'MEDIUM PRIORITY', tasks: medTasks, config: priorityConfig.MEDIUM },
                            { label: 'LOW PRIORITY', tasks: lowTasks, config: priorityConfig.LOW },
                        ].map(({ label, tasks: groupTasks, config }) => groupTasks.length > 0 && (
                            <div key={label} className="mb-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <span>{config.emoji}</span>
                                    <span className={`text-xs font-satoshi font-bold uppercase tracking-wider ${config.textClass}`}>
                                        {label} ({groupTasks.length})
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {groupTasks.map((task) => (
                                        <div
                                            key={task.id}
                                            className={`p-3.5 rounded-xl frost-glass-card border-l-2 ${config.borderClass} transition-all duration-200`}
                                        >
                                            <div className="flex items-start gap-3">
                                                <button
                                                    onClick={() => toggleTaskStatus(task.id)}
                                                    className="mt-0.5 shrink-0 transition-colors"
                                                >
                                                    {taskStates[task.id] === 'completed' ? (
                                                        <CheckCircle2 size={16} className="text-[#6B8E3D]" />
                                                    ) : (
                                                        <Circle size={16} className="text-white/20 hover:text-white/40" />
                                                    )}
                                                </button>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-cabinet font-medium ${taskStates[task.id] === 'completed' ? 'text-white/30 line-through' : 'text-white/80'
                                                        }`}>
                                                        {task.text}
                                                    </p>
                                                    <div className="flex flex-wrap items-center gap-3 mt-1.5 text-[10px] font-cabinet text-white/30">
                                                        {task.assignedTo && (
                                                            <span>👤 {task.assignedTo}</span>
                                                        )}
                                                        {task.deadline && (
                                                            <span>📅 {task.deadline}</span>
                                                        )}
                                                        {task.mentionedAt && (
                                                            <span>🗣 At {task.mentionedAt}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {/* Assignments by person */}
                        {Object.keys(assignments).length > 0 && (
                            <div className="mt-4 p-3 rounded-xl frost-glass">
                                <span className="text-white/40 text-[10px] font-cabinet font-medium uppercase tracking-wider">Assignments by Person</span>
                                <div className="flex flex-wrap gap-3 mt-2">
                                    {Object.entries(assignments).map(([name, count]) => (
                                        <span key={name} className="text-white/60 text-xs font-cabinet">
                                            {name}: <span className="text-white/90 font-medium">{count} task{count > 1 ? 's' : ''}</span>
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Transcript */}
                {transcript.length > 0 && (
                    <div>
                        <button
                            onClick={() => setShowTranscript(!showTranscript)}
                            className="flex items-center gap-2 w-full p-3 rounded-xl frost-glass frost-glass-hover transition-all duration-300 mb-2"
                        >
                            <span className="text-white/60 text-sm font-satoshi font-bold flex-1 text-left">
                                Full Transcript ({transcript.length} segments)
                            </span>
                            {showTranscript ? (
                                <ChevronUp size={16} className="text-white/40" />
                            ) : (
                                <ChevronDown size={16} className="text-white/40" />
                            )}
                        </button>

                        {showTranscript && (
                            <div className="rounded-xl frost-glass-card p-4 max-h-96 overflow-y-auto scrollbar-thin space-y-2">
                                {transcript.map((seg, i) => (
                                    <div key={i}>
                                        <div className="flex items-baseline gap-2 mb-0.5">
                                            <span className="text-xs font-satoshi font-bold text-[#6B8E3D]">{seg.speaker}</span>
                                            <span className="text-white/15 text-[10px] font-cabinet">{formatTimestamp(seg.timestamp)}</span>
                                        </div>
                                        <p className="text-white/60 text-sm font-cabinet leading-relaxed">{seg.text}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
