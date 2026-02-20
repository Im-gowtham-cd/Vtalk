'use client';

import { useState, useEffect, useRef } from 'react';
import VideoPlayer from '@/components/VideoPlayer';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useDevices } from '@/hooks/useDevices';
import { useRecorder } from '@/hooks/useRecorder';
import { useTranscript } from '@/hooks/useTranscript';
import ChatBox from '@/components/ChatBox';
import EmojiReactions from '@/components/EmojiReactions';
import TranscriptPanel from '@/components/TranscriptPanel';
import { useSocket } from '@/hooks/useSocket';
import {
  Copy, Check, Users, Mic, MicOff, Video, VideoOff, PhoneOff,
  Settings, ChevronDown, X, ChevronUp, Clock, MessageCircle,
  MonitorUp, MonitorOff, Circle, FileText,
} from 'lucide-react';

// Session timer hook
function useSessionTimer() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return hrs > 0
    ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}`
    : `${pad(mins)}:${pad(secs)}`;
}

export default function VideoCall({ roomId, userName, onLeave, initialAudioMuted = false, initialVideoOff = false }) {
  const { socket } = useSocket();
  const {
    localStream,
    remoteStreams,
    remoteMediaState,
    remoteScreenState,
    participants,
    isAudioMuted,
    isVideoOff,
    isScreenSharing,
    screenStream,
    toggleAudio,
    toggleVideo,
    startScreenShare,
    stopScreenShare,
    switchDevice,
    cleanup,
  } = useWebRTC(roomId, { initialAudioMuted, initialVideoOff });

  const {
    audioDevices,
    videoDevices,
    selectedAudioId,
    selectedVideoId,
    setSelectedAudioId,
    setSelectedVideoId,
  } = useDevices();

  // Recording
  const { isRecording, startRecording, stopRecording, recordingDuration, isSupported: recorderSupported } = useRecorder(localStream, roomId, (blob) => handleTranscription(blob));
  const [showStopRecordConfirm, setShowStopRecordConfirm] = useState(false);

  // Transcript - continuous background recording
  const [showTranscript, setShowTranscript] = useState(false);
  const { segments, interimText, isListening, isSupported: transcriptSupported } = useTranscript(roomId, userName, true);

  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  // Chat state lifted for persistence
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isProcessingAI, setIsProcessingAI] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // ✅ FIX 1: Default to Puter Cloud in production, Local in dev
  const [useLocalWhisper, setUseLocalWhisper] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    }
    return false;
  });
  const [aiSummary, setAiSummary] = useState('');

  const WHISPER_URL = process.env.NEXT_PUBLIC_WHISPER_URL || 'http://127.0.0.1:5001';

  const chatRef = useRef(null);
  const deviceMenuRef = useRef(null);
  const participantsRef = useRef(null);
  const elapsed = useSessionTimer();

  useEffect(() => { setMounted(true); }, []);

  // Close popups on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (deviceMenuRef.current && !deviceMenuRef.current.contains(e.target)) setShowDeviceMenu(false);
      if (participantsRef.current && !participantsRef.current.contains(e.target)) setShowParticipants(false);
      if (chatRef.current && !chatRef.current.contains(e.target)) setShowChat(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Listen for socket messages in parent to persist state
  useEffect(() => {
    if (!socket) return;
    const handleChatMsg = (msg) => {
      setChatMessages((prev) => [...prev, msg]);
      if (!showChat && msg.userId !== socket.id) {
        setUnreadCount((c) => c + 1);
      }
    };
    socket.on('chat-message', handleChatMsg);
    return () => { socket.off('chat-message', handleChatMsg); };
  }, [socket, showChat]);

  const handleLeave = () => {
    if (isTranscribing) {
      if (!window.confirm('Transcription is still in progress. If you leave now, the final part of your recording might not be saved. Leave anyway?')) {
        return;
      }
    }
    socket?.emit('leave-room', { roomId });
    cleanup();
    onLeave();
  };

  const handleCopyId = () => {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleAudioDeviceChange = (deviceId) => {
    setSelectedAudioId(deviceId);
    switchDevice('audio', deviceId);
  };

  const handleVideoDeviceChange = (deviceId) => {
    setSelectedVideoId(deviceId);
    switchDevice('video', deviceId);
  };

  const handleRecordToggle = () => {
    if (isRecording) {
      setShowStopRecordConfirm(true);
    } else {
      startRecording();
    }
  };

  const handleConfirmStopRecording = () => {
    stopRecording();
    setShowStopRecordConfirm(false);
  };

  // ✅ Hardened transcription — auto-tries local if dev, otherwise Cloud.
  const handleTranscription = async (blob) => {
    setIsTranscribing(true);
    setShowTranscript(true);

    try {
      let text = '';

      if (useLocalWhisper) {
        // --- Local Whisper path ---
        console.log(`[AI] Dev Mode: Sending to Local Whisper at ${WHISPER_URL}`);
        const formData = new FormData();
        formData.append('file', blob, 'video.webm');

        const response = await fetch(`${WHISPER_URL}/transcribe`, {
          method: 'POST',
          body: formData,
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Local Whisper error: ${errorText}`);
        }

        const data = await response.json();
        if (data.error) throw new Error(data.error);
        text = data.text;

      } else {
        // --- Puter cloud path (Production Default) ---
        console.log('[AI] Prod Mode: Sending to Puter Cloud...');

        // Check if Puter JS is loaded
        if (typeof window === 'undefined' || !window.puter) {
          throw new Error('Puter.js script not loaded. Check your ad-blocker or internet connection.');
        }

        const puterAI = window.puter?.ai;
        const transcribeFunction = puterAI?.transcribe || puterAI?.speech2txt;

        if (typeof transcribeFunction !== 'function') {
          throw new Error('Puter AI Transcription service is currently unavailable.');
        }

        text = await transcribeFunction(blob);
        console.log('[AI] Puter response received successfully.');
      }

      if (text && text.trim()) {
        const finalText = text.toString().trim();
        console.log(`[AI] Final Transcript: "${finalText.slice(0, 50)}..."`);

        const finalSegment = {
          speaker: 'Full Recording',
          timestamp: Date.now(),
          text: finalText,
        };
        socket.emit('transcript-segment', { roomId, segment: finalSegment });
        handleAISummary(finalText);
      } else {
        console.warn('[AI] Transcription returned empty text.');
      }

    } catch (err) {
      console.error('[AI] Transcription error:', err.message);
      if (socket) {
        socket.emit('transcript-segment', {
          roomId,
          segment: {
            speaker: 'System',
            timestamp: Date.now(),
            text: `⚠️ Transcription failed: ${err.message}`,
          },
        });
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleAISummary = async (overrideText = null) => {
    const textToProcess = overrideText || segments.map(s => `[${s.speaker}]: ${s.text}`).join('\n');
    if (!textToProcess) return;

    setIsProcessingAI(true);
    setAiSummary('Generating AI summary and extracting tasks...');

    try {
      // We emit the full transcript text to the backend, which will then use its own Gemini instance
      // to generate the summary and tasks, ensuring higher reliability than client-side Puter.
      socket?.emit('update-summary', { roomId, summary: textToProcess });

      // Update UI to show we sent it
      setAiSummary('AI processing started on server...');
      setShowTranscript(true);
    } catch (err) {
      console.error('[AI] Error triggering summary:', err);
      setAiSummary('⚠️ AI processing failed to start.');
    } finally {
      setIsProcessingAI(false);
    }
  };

  // Format recording duration
  const formatRecDuration = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(m)}:${pad(s)}`;
  };

  const participantCount = Object.keys(remoteStreams).length + 1;
  const tileCount = participantCount + (isScreenSharing ? 1 : 0);
  const nameMap = {};
  participants.forEach((p) => { nameMap[p.id] = p.name; });

  const avatarColors = [
    'from-pink-400 to-pink-600',
    'from-blue-400 to-blue-600',
    'from-amber-400 to-amber-600',
    'from-purple-400 to-purple-600',
    'from-teal-400 to-teal-600',
    'from-rose-400 to-rose-600',
  ];

  return (
    <div className={`flex flex-col h-screen bg-[#0A0A0A] transition-opacity duration-500 ${mounted ? 'opacity-100' : 'opacity-0'}`}>

      {/* Recording HUD */}
      {isRecording && (
        <div className="absolute top-4 right-4 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full frost-glass animate-fade-in">
          <div className="w-2 h-2 rounded-full bg-red-500 animate-rec-pulse" />
          <span className="text-red-400 text-xs font-satoshi font-bold uppercase tracking-wider">REC</span>
          <span className="text-white/50 text-xs font-cabinet tabular-nums">{formatRecDuration(recordingDuration)}</span>
        </div>
      )}

      {/* Stop Recording Confirm Dialog */}
      {showStopRecordConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="frost-glass-panel rounded-2xl p-6 max-w-xs mx-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center mx-auto mb-3">
              <Circle size={20} className="text-red-400" fill="currentColor" />
            </div>
            <h3 className="text-white/90 text-sm font-satoshi font-bold mb-1">Stop Recording?</h3>
            <p className="text-white/40 text-xs font-cabinet mb-4">The recording will be downloaded as a .webm file.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowStopRecordConfirm(false)}
                className="flex-1 py-2.5 rounded-xl frost-glass frost-glass-hover text-white/60 text-sm font-cabinet font-medium transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmStopRecording}
                className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-satoshi font-bold transition-all"
              >
                Stop & Download
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video Grid + Sidebar Panels */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-2 sm:p-4 overflow-hidden relative">
          <div className={`grid gap-2 sm:gap-3 h-full auto-rows-fr ${tileCount === 1
            ? 'grid-cols-1 max-w-lg sm:max-w-3xl mx-auto'
            : tileCount === 2
              ? 'grid-cols-1 md:grid-cols-2'
              : tileCount <= 4
                ? 'grid-cols-2'
                : 'grid-cols-2 lg:grid-cols-3'
            }`}>
            {/* Local Video */}
            <VideoPlayer
              stream={localStream}
              muted={true}
              label={userName || 'You'}
              isAudioMuted={isAudioMuted}
              isVideoOff={isVideoOff}
              isLocal={true}
              avatarColor="from-[#556B2F] to-[#6B8E3D]"
            />

            {/* Local Screen Share */}
            {isScreenSharing && screenStream && (
              <VideoPlayer
                stream={screenStream}
                muted={true}
                label={`${userName || 'You'}'s screen`}
                isAudioMuted={false}
                isVideoOff={false}
                isLocal={false}
                isScreenSharing={true}
                avatarColor="from-[#556B2F] to-[#6B8E3D]"
              />
            )}

            {/* Remote Videos */}
            {participants.map((p, idx) => {
              const stream = remoteStreams[p.id];
              const mediaState = remoteMediaState[p.id] || { audio: true, video: true };
              return (
                <VideoPlayer
                  key={p.id}
                  stream={stream}
                  muted={false}
                  label={p.name}
                  isAudioMuted={!mediaState.audio}
                  isVideoOff={!mediaState.video}
                  isLocal={false}
                  isScreenSharing={!!remoteScreenState[p.id]}
                  avatarColor={avatarColors[(idx + 1) % avatarColors.length]}
                />
              );
            })}
          </div>
        </div>

        {/* Sidebar panels (Transcript and ChatBox) */}
        {(showTranscript || showChat) && (
          <div className="w-80 sm:w-96 shrink-0 p-2 sm:p-4 flex flex-col gap-4 animate-[fade-in-right_0.2s_ease-out]">
            {showTranscript && (
              <TranscriptPanel
                roomId={roomId}
                segments={segments}
                interimText={interimText}
                aiSummary={aiSummary}
                isProcessingAI={isProcessingAI}
                isTranscribing={isTranscribing}
                useLocalWhisper={useLocalWhisper}
                onToggleLocal={() => setUseLocalWhisper(!useLocalWhisper)}
                onRunAI={() => handleAISummary()}
                onClose={() => setShowTranscript(false)}
              />
            )}

            {showChat && (
              <ChatBox
                socket={socket}
                roomId={roomId}
                userName={userName}
                messages={chatMessages}
                onClose={() => setShowChat(false)}
              />
            )}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="relative px-3 sm:px-5 py-3 sm:py-4 border-t border-white/[0.05]">
        <div className="flex items-end justify-between gap-3">

          {/* Left: Timer + Live + Room code */}
          <div className="flex flex-col gap-2 shrink-0">
            {/* Timer + Live */}
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full frost-glass">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-400 text-[10px] font-satoshi font-bold uppercase tracking-wider">Live</span>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full frost-glass">
                <Clock size={10} className="text-white/40" />
                <span className="text-white/50 text-[10px] font-cabinet font-medium tabular-nums">{elapsed}</span>
              </div>
            </div>

            {/* Room code */}
            <button
              onClick={handleCopyId}
              className="group flex items-center gap-2 px-3 py-2 rounded-2xl frost-glass frost-glass-hover transition-all duration-300"
            >
              <span className="text-white/40 text-[10px] font-cabinet uppercase tracking-wider">Room</span>
              <span className="text-white/90 text-sm font-satoshi font-bold tracking-widest">{roomId}</span>
              {copied ? (
                <Check size={12} className="text-emerald-400 transition-all duration-300" />
              ) : (
                <Copy size={12} className="text-white/30 group-hover:text-white/60 transition-all duration-300" />
              )}
            </button>
          </div>

          {/* Center: Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-[22px] frost-glass-strong">
            {/* Mic toggle */}
            <button
              onClick={toggleAudio}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 ${isAudioMuted
                ? 'bg-red-500/20 hover:bg-red-500/30'
                : 'bg-white/[0.08] hover:bg-white/[0.14]'
                }`}
              title={isAudioMuted ? 'Unmute' : 'Mute'}
            >
              {isAudioMuted ? <MicOff size={18} className="text-red-400" /> : <Mic size={18} className="text-white/80" />}
            </button>

            {/* Video toggle */}
            <button
              onClick={toggleVideo}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 ${isVideoOff
                ? 'bg-red-500/20 hover:bg-red-500/30'
                : 'bg-white/[0.08] hover:bg-white/[0.14]'
                }`}
              title={isVideoOff ? 'Turn on camera' : 'Turn off camera'}
            >
              {isVideoOff ? <VideoOff size={18} className="text-red-400" /> : <Video size={18} className="text-white/80" />}
            </button>

            {/* Screen Share */}
            <button
              onClick={isScreenSharing ? stopScreenShare : startScreenShare}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 ${isScreenSharing
                ? 'bg-[#556B2F]/30 hover:bg-[#556B2F]/40 ring-1 ring-[#556B2F]/50'
                : 'bg-white/[0.08] hover:bg-white/[0.14]'
                }`}
              title={isScreenSharing ? 'Stop sharing' : 'Share screen'}
            >
              {isScreenSharing
                ? <MonitorOff size={18} className="text-[#6B8E3D]" />
                : <MonitorUp size={18} className="text-white/80" />
              }
            </button>

            {/* Record button */}
            <button
              onClick={handleRecordToggle}
              disabled={!recorderSupported}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 ${isRecording
                ? 'bg-red-500/20 hover:bg-red-500/30 ring-1 ring-red-500/50'
                : 'bg-white/[0.08] hover:bg-white/[0.14]'
                } disabled:opacity-30 disabled:cursor-not-allowed`}
              title={!recorderSupported ? 'Recording not supported in this browser' : isRecording ? 'Stop recording' : 'Start recording'}
            >
              <Circle
                size={18}
                className={isRecording ? 'text-red-400' : 'text-white/80'}
                fill={isRecording ? 'currentColor' : 'none'}
              />
            </button>

            {/* Emoji Reactions */}
            <EmojiReactions socket={socket} roomId={roomId} />

            {/* Device Settings */}
            <div className="relative" ref={deviceMenuRef}>
              <button
                onClick={() => { setShowDeviceMenu(!showDeviceMenu); setShowParticipants(false); }}
                className={`w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all duration-300 ${showDeviceMenu ? 'bg-white/[0.16]' : 'bg-white/[0.08] hover:bg-white/[0.14]'
                  }`}
                title="Device settings"
              >
                <Settings size={18} className="text-white/80" />
              </button>

              {/* Device popover */}
              {showDeviceMenu && (
                <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-72 sm:w-80 rounded-2xl frost-glass-panel shadow-2xl z-50 overflow-hidden animate-[fade-in-up_0.2s_ease-out]">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                    <span className="text-white/90 text-sm font-satoshi font-bold">Devices</span>
                    <button onClick={() => setShowDeviceMenu(false)} className="text-white/30 hover:text-white/60 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="space-y-2">
                      <label className="flex items-center gap-1.5 text-white/50 text-xs font-cabinet font-medium">
                        <Mic size={12} /> Microphone
                      </label>
                      <div className="relative">
                        <select
                          value={selectedAudioId}
                          onChange={(e) => handleAudioDeviceChange(e.target.value)}
                          className="w-full appearance-none bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 pr-8 text-white/80 text-xs font-cabinet cursor-pointer hover:bg-white/[0.1] focus:outline-none focus:border-white/[0.2] transition-all duration-200"
                        >
                          {audioDevices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId} className="bg-[#1a1a1a] text-white">
                              {d.label || `Microphone ${d.deviceId.slice(0, 8)}`}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="flex items-center gap-1.5 text-white/50 text-xs font-cabinet font-medium">
                        <Video size={12} /> Camera
                      </label>
                      <div className="relative">
                        <select
                          value={selectedVideoId}
                          onChange={(e) => handleVideoDeviceChange(e.target.value)}
                          className="w-full appearance-none bg-white/[0.06] border border-white/[0.08] rounded-xl px-3 py-2.5 pr-8 text-white/80 text-xs font-cabinet cursor-pointer hover:bg-white/[0.1] focus:outline-none focus:border-white/[0.2] transition-all duration-200"
                        >
                          {videoDevices.map((d) => (
                            <option key={d.deviceId} value={d.deviceId} className="bg-[#1a1a1a] text-white">
                              {d.label || `Camera ${d.deviceId.slice(0, 8)}`}
                            </option>
                          ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Divider */}
            <div className="w-px h-7 bg-white/[0.1] mx-1" />

            {/* Leave */}
            <button
              onClick={handleLeave}
              disabled={isTranscribing}
              className={`flex items-center gap-3 px-6 h-11 sm:h-12 rounded-full transition-all duration-300 active:scale-[0.94] ${isTranscribing || isProcessingAI
                  ? 'bg-amber-500/20 text-amber-500 ring-1 ring-amber-500/50 cursor-wait'
                  : 'bg-red-500 hover:bg-red-600 text-white'
                }`}
              title={isTranscribing ? 'Finalizing your recording...' : 'Leave call'}
            >
              <PhoneOff size={18} />
              {(isTranscribing || isProcessingAI) && (
                <span className="text-sm font-satoshi font-bold animate-pulse">
                  Finalizing...
                </span>
              )}
            </button>
          </div>

          {/* Right: Chat + Participants + Transcript */}
          <div className="flex flex-col items-end gap-2 shrink-0">
            <div ref={participantsRef}>
              {showParticipants && (
                <div className="absolute bottom-full mb-3 right-0 w-64 sm:w-72 rounded-2xl frost-glass-panel shadow-2xl overflow-hidden animate-[fade-in-up_0.2s_ease-out] z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
                    <span className="text-white/90 text-sm font-satoshi font-bold">In this call</span>
                    <button onClick={() => setShowParticipants(false)} className="text-white/30 hover:text-white/60 transition-colors">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="max-h-52 overflow-y-auto scrollbar-thin">
                    {/* Local */}
                    <div className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#556B2F] to-[#6B8E3D] flex items-center justify-center">
                        <span className="text-white text-xs font-satoshi font-bold">
                          {(userName || 'Y')[0].toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-white/90 text-sm font-cabinet font-medium block truncate">{userName || 'You'}</span>
                        <span className="text-white/30 text-[10px] font-cabinet">You</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {isVideoOff && <VideoOff size={11} className="text-white/30" />}
                        {isAudioMuted && <MicOff size={11} className="text-red-400/60" />}
                      </div>
                    </div>

                    {/* Remote */}
                    {participants.map((p, idx) => {
                      const peerMedia = remoteMediaState[p.id];
                      const peerAudioMuted = peerMedia ? !peerMedia.audio : false;
                      const peerVideoOff = peerMedia ? !peerMedia.video : false;
                      return (
                        <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                          <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${avatarColors[idx % avatarColors.length]} flex items-center justify-center`}>
                            <span className="text-white text-xs font-satoshi font-bold">
                              {(p.name || 'G')[0].toUpperCase()}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-white/80 text-sm font-cabinet font-medium block truncate">{p.name || 'Guest'}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            {peerVideoOff && <VideoOff size={11} className="text-white/30" />}
                            {peerAudioMuted && <MicOff size={11} className="text-red-400/60" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* Toggle buttons row */}
            <div className="flex items-center gap-2">
              {/* Transcript toggle */}
              <button
                onClick={() => {
                  setShowTranscript(!showTranscript);
                  setShowDeviceMenu(false);
                }}
                className={`flex items-center gap-2 px-3 py-2 rounded-2xl transition-all duration-300 ${showTranscript
                  ? 'frost-glass-active border-[#6B8E3D]/50 text-[#6B8E3D]'
                  : 'frost-glass frost-glass-hover'
                  }`}
              >
                <FileText size={14} className={showTranscript ? "text-[#6B8E3D]" : "text-white/60"} />
                <span className={`text-sm font-cabinet font-medium ${showTranscript ? "text-[#6B8E3D]" : "text-white/70"}`}>Transcript</span>
              </button>

              {/* Chat toggle */}
              <button
                onClick={() => {
                  setShowChat(!showChat);
                  if (!showChat) setUnreadCount(0);
                  setShowDeviceMenu(false);
                }}
                className={`relative flex items-center gap-2 px-3 py-2 rounded-2xl transition-all duration-300 ${showChat
                  ? 'frost-glass-active border-[#6B8E3D]/50 text-[#6B8E3D]'
                  : 'frost-glass frost-glass-hover'
                  }`}
              >
                <MessageCircle size={14} className={showChat ? "text-[#6B8E3D]" : "text-white/60"} />
                <span className={`text-sm font-cabinet font-medium ${showChat ? "text-[#6B8E3D]" : "text-white/70"}`}>Chat</span>
                {unreadCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-[#556B2F] flex items-center justify-center">
                    <span className="text-white text-[9px] font-satoshi font-bold">{unreadCount > 9 ? '9+' : unreadCount}</span>
                  </span>
                )}
              </button>

              {/* Participants toggle */}
              <button
                onClick={() => { setShowParticipants(!showParticipants); setShowDeviceMenu(false); }}
                className={`flex items-center gap-2 px-3 py-2 rounded-2xl transition-all duration-300 ${showParticipants
                  ? 'frost-glass-active border-[#6B8E3D]/50 text-[#6B8E3D]'
                  : 'frost-glass frost-glass-hover'
                  }`}
              >
                <Users size={14} className={showParticipants ? "text-[#6B8E3D]" : "text-white/60"} />
                <span className={`text-sm font-cabinet font-medium ${showParticipants ? "text-[#6B8E3D]" : "text-white/70"}`}>{participantCount}</span>
                <ChevronUp size={12} className={`text-white/40 transition-transform duration-300 ${showParticipants ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}