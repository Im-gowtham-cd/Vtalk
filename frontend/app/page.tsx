'use client';

import { useState } from 'react';
import { AuthProvider, useAuth } from '@/components/Auth/AuthContext';
import AuthModal from '@/components/Auth/AuthModal';
import Landing from '@/components/Landing';
import CreateRoom from '@/components/CreateRoom';
import JoinRoom from '@/components/JoinRoom';
import PreJoinLobby from '@/components/PreJoinLobby';
import VideoCall from '@/components/VideoCall';
import HistoryDashboard from '@/components/History/HistoryDashboard';
import SessionDetail from '@/components/History/SessionDetail';
import TasksDashboard from '@/components/Tasks/TasksDashboard';

type View = 'landing' | 'create' | 'join' | 'lobby' | 'call' | 'history' | 'tasks' | 'session-detail';

interface MediaPrefs {
  initialAudioMuted: boolean;
  initialVideoOff: boolean;
}

interface AuthUser {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<any>;
  signup: (name: string, email: string, password: string) => Promise<any>;
  logout: () => void;
}

function AppContent() {
  const { user, token, isAuthenticated, isLoading, logout } = useAuth() as AuthState;
  const [view, setView] = useState<View>('landing');
  const [roomId, setRoomId] = useState<string | null>(null);
  const [userName, setUserName] = useState<string>('');
  const [mediaPrefs, setMediaPrefs] = useState<MediaPrefs>({ initialAudioMuted: false, initialVideoOff: false });
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  // Use authenticated user name if available
  const effectiveUserName = user?.name || userName;

  const handleRoomCreated = (id: string, name: string) => {
    setRoomId(id);
    setUserName(name);
    setView('lobby');
  };

  const handleRoomJoined = (id: string, name: string) => {
    setRoomId(id);
    setUserName(name);
    setView('lobby');
  };

  const handleJoinCall = (prefs: MediaPrefs) => {
    setMediaPrefs(prefs);
    setView('call');
  };

  const handleLeave = () => {
    setRoomId(null);
    setUserName('');
    setMediaPrefs({ initialAudioMuted: false, initialVideoOff: false });
    setView('landing');
  };

  // Loading state
  if (isLoading) {
    return (
      <main className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#556B2F]/30 border-t-[#6B8E3D] rounded-full animate-spin" />
      </main>
    );
  }

  // Auth gate
  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-[#0A0A0A] text-white">
        <AuthModal />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0A0A0A] text-white">
      {view === 'landing' && (
        <Landing
          onCreateRoom={() => setView('create')}
          onJoinRoom={() => setView('join')}
          onHistory={() => setView('history')}
          onTasks={() => setView('tasks')}
          user={user}
          onLogout={logout}
        />
      )}
      {view === 'create' && (
        <CreateRoom
          onRoomCreated={handleRoomCreated}
          onBack={() => setView('landing')}
        />
      )}
      {view === 'join' && (
        <JoinRoom
          onRoomJoined={handleRoomJoined}
          onBack={() => setView('landing')}
        />
      )}
      {view === 'lobby' && roomId && (
        <PreJoinLobby
          userName={effectiveUserName}
          onJoinCall={handleJoinCall}
        />
      )}
      {view === 'call' && roomId && (
        <VideoCall
          roomId={roomId}
          userName={effectiveUserName}
          onLeave={handleLeave}
          initialAudioMuted={mediaPrefs.initialAudioMuted}
          initialVideoOff={mediaPrefs.initialVideoOff}
        />
      )}
      {view === 'history' && (
        <HistoryDashboard
          token={token}
          onBack={() => setView('landing')}
          onSelectSession={(id: string) => {
            setSelectedSessionId(id);
            setView('session-detail');
          }}
        />
      )}
      {view === 'tasks' && (
        <TasksDashboard
          token={token}
          onBack={() => setView('landing')}
          onSelectSession={(id: string) => {
            setSelectedSessionId(id);
            setView('session-detail');
          }}
        />
      )}
      {view === 'session-detail' && selectedSessionId && (
        <SessionDetail
          sessionId={selectedSessionId}
          token={token}
          onBack={() => setView('history')}
        />
      )}
    </main>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
