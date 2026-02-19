'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSocket } from './useSocket';

/**
 * useTranscript
 *
 * Uses the Web Speech API for real-time speech-to-text on the local mic,
 * and syncs transcript segments with the server via Socket.io.
 *
 * @param {string}  roomId   — current room
 * @param {string}  userName — speaker label
 * @param {boolean} enabled  — start/stop recognition
 */
export function useTranscript(roomId, userName, enabled = false) {
    const { socket } = useSocket();
    const [segments, setSegments] = useState([]);
    const [isListening, setIsListening] = useState(false);
    const [interimText, setInterimText] = useState('');
    const recognitionRef = useRef(null);
    const enabledRef = useRef(enabled);

    const isSupported =
        typeof window !== 'undefined' &&
        (typeof window.SpeechRecognition !== 'undefined' ||
            typeof window.webkitSpeechRecognition !== 'undefined');

    // Keep enabledRef in sync
    useEffect(() => {
        enabledRef.current = enabled;
    }, [enabled]);

    // Listen for server transcript updates
    useEffect(() => {
        if (!socket) return;
        const handler = ({ segments: serverSegments }) => {
            if (Array.isArray(serverSegments)) {
                setSegments(serverSegments);
            }
        };
        socket.on('transcript-update', handler);
        return () => { socket.off('transcript-update', handler); };
    }, [socket]);

    // Start / stop speech recognition
    useEffect(() => {
        if (!isSupported) return;
        if (!enabled) {
            if (recognitionRef.current) {
                recognitionRef.current.abort();
                recognitionRef.current = null;
                setIsListening(false);
            }
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    const segment = {
                        speaker: userName || 'You',
                        timestamp: Date.now(),
                        text: transcript.trim(),
                    };
                    // Send to server
                    if (socket && roomId) {
                        socket.emit('transcript-segment', { roomId, segment });
                    }
                    setInterimText('');
                } else {
                    interim += transcript;
                }
            }
            if (interim) setInterimText(interim);
        };

        recognition.onerror = (event) => {
            if (event.error === 'no-speech' || event.error === 'aborted') return;
            console.error('[useTranscript] Speech recognition error:', event.error);
        };

        recognition.onend = () => {
            // Auto-restart if still enabled
            if (enabledRef.current) {
                try {
                    recognition.start();
                } catch {
                    // already started
                }
            } else {
                setIsListening(false);
            }
        };

        try {
            recognition.start();
            recognitionRef.current = recognition;
            setIsListening(true);
        } catch (err) {
            console.error('[useTranscript] Could not start recognition:', err);
        }

        return () => {
            recognition.abort();
            recognitionRef.current = null;
            setIsListening(false);
        };
    }, [enabled, isSupported, userName, roomId, socket]);

    const clearTranscript = useCallback(() => {
        setSegments([]);
        setInterimText('');
    }, []);

    return { segments, interimText, isListening, isSupported, clearTranscript };
}
