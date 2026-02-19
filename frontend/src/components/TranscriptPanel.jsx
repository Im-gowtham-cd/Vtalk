'use client';

import { useEffect, useRef } from 'react';
import { X, FileText } from 'lucide-react';

const speakerColors = [
    'text-[#6B8E3D]',   // olive green
    'text-teal-400',
    'text-amber-400',
    'text-pink-400',
    'text-blue-400',
    'text-purple-400',
];

export default function TranscriptPanel({ segments, interimText, onClose }) {
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
                <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors">
                    <X size={14} />
                </button>
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
        </div>
    );
}
