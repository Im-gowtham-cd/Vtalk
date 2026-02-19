'use client';
import { useEffect, useRef, useCallback, useState } from 'react';

/**
 * useRecorder
 *
 * Records the local MediaStream (video + audio) using MediaRecorder,
 * provides a download on stop, and tracks recording duration.
 *
 * @param {MediaStream|null} localStream — the local WebRTC stream
 * @param {string}           roomId      — used in the download filename
 */
export function useRecorder(localStream, roomId, onStop) {
    const recorderRef = useRef(null);
    const chunksRef = useRef([]);
    const timerRef = useRef(null);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingDuration, setRecordingDuration] = useState(0);

    /** Pick the best supported MIME type */
    const getMimeType = () => {
        const candidates = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm',
            'video/mp4',
        ];
        if (typeof MediaRecorder === 'undefined') return '';
        return candidates.find((m) => MediaRecorder.isTypeSupported(m)) || '';
    };

    const isSupported = typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';

    const startRecording = useCallback(() => {
        if (!localStream || !isSupported) return;
        if (recorderRef.current && recorderRef.current.state === 'recording') return;

        const mimeType = getMimeType();
        if (!mimeType) return;

        chunksRef.current = [];
        setRecordingDuration(0);

        try {
            const recorder = new MediaRecorder(localStream, { mimeType });

            recorder.ondataavailable = (e) => {
                if (e.data && e.data.size > 0) {
                    chunksRef.current.push(e.data);
                }
            };

            recorder.onstop = () => {
                const blob = new Blob(chunksRef.current, { type: mimeType });
                const now = new Date();
                const pad = (n) => String(n).padStart(2, '0');
                const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}-${pad(now.getMinutes())}`;
                const filename = `vtalk-recording-${roomId || 'call'}-${dateStr}.webm`;

                if (onStop) {
                    onStop(blob);
                }

                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(() => {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 100);
            };

            recorder.onerror = (e) => {
                console.error('[useRecorder] MediaRecorder error:', e);
            };

            recorder.start(1000); // collect data every second
            recorderRef.current = recorder;
            setIsRecording(true);

            // Duration timer
            timerRef.current = setInterval(() => {
                setRecordingDuration((d) => d + 1);
            }, 1000);
        } catch (err) {
            console.error('[useRecorder] Could not start MediaRecorder:', err);
        }
    }, [localStream, roomId, isSupported]);

    const stopRecording = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        const recorder = recorderRef.current;
        if (recorder && recorder.state !== 'inactive') {
            recorder.stop();
        }

        recorderRef.current = null;
        setIsRecording(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (recorderRef.current && recorderRef.current.state !== 'inactive') {
                recorderRef.current.stop();
            }
        };
    }, []);

    return { isRecording, startRecording, stopRecording, recordingDuration, isSupported };
}