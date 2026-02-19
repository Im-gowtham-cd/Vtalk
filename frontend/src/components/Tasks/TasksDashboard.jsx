'use client';

import { useState, useEffect } from 'react';
import {
    ArrowLeft, CheckCircle2, Circle, Clock, Filter,
    Search, Download, Loader2, AlertCircle, ChevronRight
} from 'lucide-react';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

const priorityConfig = {
    HIGH: { label: 'High', emoji: '🔴', bgClass: 'bg-red-500/10', borderClass: 'border-l-red-500', textClass: 'text-red-400' },
    MEDIUM: { label: 'Medium', emoji: '🟡', bgClass: 'bg-amber-500/10', borderClass: 'border-l-amber-500', textClass: 'text-amber-400' },
    LOW: { label: 'Low', emoji: '🟢', bgClass: 'bg-emerald-500/10', borderClass: 'border-l-emerald-500', textClass: 'text-emerald-400' },
};

export default function TasksDashboard({ onBack, token, onSelectSession }) {
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [filterPriority, setFilterPriority] = useState('ALL');
    const [filterStatus, setFilterStatus] = useState('ALL');

    useEffect(() => {
        fetchTasks();
    }, []);

    const fetchTasks = async () => {
        try {
            const res = await fetch(`${SOCKET_URL}/history/all-tasks`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setTasks(data.tasks || []);
            }
        } catch (err) {
            console.error('Failed to fetch tasks:', err);
        } finally {
            setLoading(false);
        }
    };

    const toggleTaskStatus = async (sessionId, taskId, currentStatus) => {
        const next = currentStatus === 'completed' ? 'pending' : 'completed';

        // Optimistic update
        setTasks(prev => prev.map(t =>
            (t.id === taskId) ? { ...t, status: next } : t
        ));

        try {
            const res = await fetch(`${SOCKET_URL}/history/${sessionId}/tasks/${taskId}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ status: next }),
            });
            if (!res.ok) throw new Error('Failed to update');
        } catch (err) {
            // Revert on error
            setTasks(prev => prev.map(t =>
                (t.id === taskId) ? { ...t, status: currentStatus } : t
            ));
        }
    };

    const formatDate = (iso) => {
        const d = new Date(iso);
        return d.toLocaleDateString('en-IN', {
            day: 'numeric', month: 'short', year: 'numeric'
        });
    };

    const filteredTasks = tasks.filter(t => {
        const matchesSearch = t.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (t.assignedTo || '').toLowerCase().includes(searchQuery.toLowerCase());
        const matchesPriority = filterPriority === 'ALL' || t.priority === filterPriority;
        const matchesStatus = filterStatus === 'ALL' ||
            (filterStatus === 'COMPLETED' ? t.status === 'completed' : t.status !== 'completed');

        return matchesSearch && matchesPriority && matchesStatus;
    });

    const stats = {
        total: tasks.length,
        completed: tasks.filter(t => t.status === 'completed').length,
        pending: tasks.filter(t => t.status !== 'completed').length,
        high: tasks.filter(t => t.priority === 'HIGH' && t.status !== 'completed').length
    };

    return (
        <div className="relative min-h-screen bg-[#0A0A0A] overflow-hidden">
            {/* Ambient glow */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[#556B2F]/10 blur-[150px] animate-glow-pulse" />
            </div>

            <div className="relative z-10 max-w-5xl mx-auto px-6 py-10">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
                    <div className="flex items-center gap-5">
                        <button
                            onClick={onBack}
                            className="w-12 h-12 rounded-2xl frost-glass frost-glass-hover flex items-center justify-center transition-all duration-300 shadow-lg"
                        >
                            <ArrowLeft size={20} className="text-white/70" />
                        </button>
                        <div>
                            <h1 className="text-3xl font-satoshi font-black text-white/90 tracking-tight">Task Center</h1>
                            <p className="text-white/40 text-sm font-cabinet mt-1">Manage action items from all your meetings in one place</p>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <div className="px-5 py-3 rounded-2xl frost-glass-card flex flex-col items-center min-w-[100px]">
                            <span className="text-white/30 text-[10px] uppercase font-black tracking-widest mb-1">Pending</span>
                            <span className="text-xl font-satoshi font-black text-[#6B8E3D]">{stats.pending}</span>
                        </div>
                        <div className="px-5 py-3 rounded-2xl frost-glass-card flex flex-col items-center min-w-[100px]">
                            <span className="text-white/30 text-[10px] uppercase font-black tracking-widest mb-1">High Priority</span>
                            <span className="text-xl font-satoshi font-black text-red-500">{stats.high}</span>
                        </div>
                    </div>
                </div>

                {/* Filters */}
                <div className="flex flex-col md:flex-row gap-4 mb-8">
                    <div className="relative flex-1 group">
                        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-[#6B8E3D] transition-colors" />
                        <input
                            type="text"
                            placeholder="Search tasks or assignees..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-[#121212]/50 border border-white/5 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-cabinet text-white placeholder:text-white/10 focus:outline-none focus:border-[#556B2F]/50 transition-all"
                        />
                    </div>
                    <div className="flex gap-2">
                        <select
                            value={filterPriority}
                            onChange={(e) => setFilterPriority(e.target.value)}
                            className="bg-[#121212]/50 border border-white/5 rounded-2xl px-4 py-3.5 text-xs font-satoshi font-bold text-white/60 focus:outline-none focus:border-[#556B2F]/50 appearance-none cursor-pointer"
                        >
                            <option value="ALL">All Priorities</option>
                            <option value="HIGH">High Priority</option>
                            <option value="MEDIUM">Medium Priority</option>
                            <option value="LOW">Low Priority</option>
                        </select>
                        <select
                            value={filterStatus}
                            onChange={(e) => setFilterStatus(e.target.value)}
                            className="bg-[#121212]/50 border border-white/5 rounded-2xl px-4 py-3.5 text-xs font-satoshi font-bold text-white/60 focus:outline-none focus:border-[#556B2F]/50 appearance-none cursor-pointer"
                        >
                            <option value="ALL">All Status</option>
                            <option value="PENDING">Pending</option>
                            <option value="COMPLETED">Completed</option>
                        </select>
                    </div>
                </div>

                {/* Tasks List */}
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-32 gap-4">
                        <Loader2 size={32} className="text-[#6B8E3D] animate-spin" />
                        <p className="text-white/20 text-sm font-cabinet">Syncing your tasks...</p>
                    </div>
                ) : filteredTasks.length === 0 ? (
                    <div className="text-center py-32 rounded-3xl border border-dashed border-white/5 bg-white/[0.01]">
                        <AlertCircle size={40} className="text-white/10 mx-auto mb-4" />
                        <h3 className="text-white/70 text-base font-satoshi font-bold">No tasks found</h3>
                        <p className="text-white/20 text-sm font-cabinet mt-1 max-w-xs mx-auto">
                            {searchQuery || filterPriority !== 'ALL' || filterStatus !== 'ALL'
                                ? 'Adjust your filters to see more results.'
                                : 'Extracted action items from your meetings will appear here.'}
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4">
                        {filteredTasks.map((task) => {
                            const config = priorityConfig[task.priority] || priorityConfig.MEDIUM;
                            return (
                                <div
                                    key={task.id}
                                    className={`group flex flex-col md:flex-row md:items-center gap-6 p-5 rounded-3xl frost-glass-card border-l-4 ${config.borderClass} transition-all duration-300 hover:shadow-2xl hover:translate-x-1`}
                                >
                                    <div className="flex items-start gap-4 flex-1 min-w-0">
                                        <button
                                            onClick={() => toggleTaskStatus(task.sessionId, task.id, task.status)}
                                            className="mt-1 transition-all active:scale-90"
                                        >
                                            {task.status === 'completed' ? (
                                                <div className="w-6 h-6 rounded-lg bg-[#6B8E3D] flex items-center justify-center">
                                                    <CheckCircle2 size={16} className="text-white" />
                                                </div>
                                            ) : (
                                                <div className="w-6 h-6 rounded-lg border-2 border-white/10 flex items-center justify-center group-hover:border-[#6B8E3D]/50">
                                                    <Circle size={14} className="text-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                                </div>
                                            )}
                                        </button>
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-lg font-cabinet font-medium leading-snug ${task.status === 'completed' ? 'text-white/20 line-through' : 'text-white/90'}`}>
                                                {task.text}
                                            </p>
                                            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${config.textClass.replace('text', 'bg')}`} />
                                                    <span className={`text-[10px] font-black tracking-widest uppercase ${config.textClass}`}>{config.label}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-white/30 text-xs font-cabinet">
                                                    <span className="text-[10px]">👤</span> {task.assignedTo || 'Unassigned'}
                                                </div>
                                                {task.deadline && (
                                                    <div className="flex items-center gap-1.5 text-white/30 text-xs font-cabinet">
                                                        <Clock size={11} className="text-[#6B8E3D]/40" /> {task.deadline}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex md:flex-col items-start md:items-end justify-between md:justify-center border-t md:border-t-0 md:border-l border-white/5 pt-4 md:pt-0 md:pl-8 gap-1">
                                        <button
                                            onClick={() => onSelectSession(task.sessionId)}
                                            className="text-white/20 hover:text-[#6B8E3D] text-[10px] font-cabinet font-black uppercase tracking-widest flex items-center gap-1 transition-colors group/link"
                                        >
                                            Room {task.roomId}
                                            <ChevronRight size={10} className="group-hover/link:translate-x-0.5 transition-transform" />
                                        </button>
                                        <span className="text-[10px] font-cabinet text-white/15">{formatDate(task.sessionDate)}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
