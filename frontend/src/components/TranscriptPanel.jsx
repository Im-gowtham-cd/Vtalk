'use client';

import { useEffect, useRef } from 'react';
import { X, FileText, Sparkles, Loader2 } from 'lucide-react';

const speakerColors = [
    'text-[#6B8E3D]',   // olive green
    'text-teal-400',
    'text-amber-400',
    'text-pink-400',
    'text-blue-400',
    'text-purple-400',
];

export default function TranscriptPanel({ segments, interimText, aiSummary, isProcessingAI, onRunAI, onClose }) {
    const scrollRef = useRef(null);
    const speakerMap = useRef({});
    let colorIdx = 0;

    const getColor = (speaker) => {
        if (!speakerMap.current[speaker]) {
            speakerMap.current[speaker] = speakerColors[colorIdx % speakerColors.length];
            colorIdx++;
        }
        return speakerMap.current[speaker];
    };

    // Auto-scroll to bottom on new segments
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [segments, interimText]);

    const formatTime = (ts) => {
        const d = new Date(ts);
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    return (
        <div className="w-80 h-full flex flex-col frost-glass-panel rounded-2xl overflow-hidden animate-[fade-in-up_0.2s_ease-out]">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                    <FileText size={14} className="text-[#6B8E3D]" />
                    <span className="text-white/90 text-sm font-satoshi font-bold">Transcript</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={onRunAI}
                        disabled={isProcessingAI || segments.length === 0}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#6B8E3D]/10 hover:bg-[#6B8E3D]/20 text-[#6B8E3D] text-[10px] font-satoshi font-bold transition-all disabled:opacity-30"
                        title="Generate AI Summary"
                    >
                        {isProcessingAI ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                        AI Summary
                    </button>
                    <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Segments */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-2.5 scrollbar-thin">
                {segments.length === 0 && !interimText && (
                    <div className="flex flex-col items-center justify-center h-full text-center py-10">
                        <FileText size={28} className="text-white/10 mb-3" />
                        <p className="text-white/20 text-xs font-cabinet">Start speaking to see the transcript here...</p>
                    </div>
                )}

                {segments.map((seg, i) => (
                    <div key={i} className="group">
                        <div className="flex items-baseline gap-2 mb-0.5">
                            <span className={`text-xs font-satoshi font-bold ${getColor(seg.speaker)}`}>
                                {seg.speaker}
                            </span>
                            <span className="text-white/20 text-[10px] font-cabinet">{formatTime(seg.timestamp)}</span>
                        </div>
                        <p className="text-white/70 text-sm font-cabinet leading-relaxed pl-0.5">{seg.text}</p>
                    </div>
                ))}

                {/* Interim (current speaking) */}
                {interimText && (
                    <div className="opacity-50">
                        <div className="flex items-baseline gap-2 mb-0.5">
                            <span className={`text-xs font-satoshi font-bold ${getColor('You')}`}>You</span>
                            <span className="text-white/20 text-[10px] font-cabinet">now</span>
                        </div>
                        <p className="text-white/40 text-sm font-cabinet italic leading-relaxed pl-0.5">{interimText}...</p>
                    </div>
                )}
            </div>

            {/* AI Summary Section */}
            {(aiSummary || isProcessingAI) && (
                <div className="mx-3 mt-1 mb-3 p-3 rounded-xl bg-[#6B8E3D]/5 border border-[#6B8E3D]/10 animate-fade-in shadow-inner">
                    <div className="flex items-center gap-1.5 mb-2">
                        <Sparkles size={12} className="text-[#6B8E3D]" />
                        <span className="text-[#6B8E3D] text-[10px] font-satoshi font-bold uppercase tracking-wider">AI Summary</span>
                    </div>
                    {isProcessingAI ? (
                        <div className="flex items-center gap-2 py-2">
                            <Loader2 size={12} className="text-[#6B8E3D]/40 animate-spin" />
                            <span className="text-white/20 text-xs font-cabinet italic">Claude is thinking...</span>
                        </div>
                    ) : (
                        <p className="text-white/80 text-xs font-cabinet leading-relaxed whitespace-pre-wrap">
                            {aiSummary}
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
