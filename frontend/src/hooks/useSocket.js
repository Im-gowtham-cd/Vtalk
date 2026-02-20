import { useEffect, useState } from 'react';
import io from 'socket.io-client';

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';

// Singleton socket — survives across component mounts/unmounts
let globalSocket = null;

function getSocket() {
  if (!globalSocket) {
    // Pass auth token if available so the server auto-identifies the user
    const token = typeof window !== 'undefined' ? localStorage.getItem('vtalk_token') : null;
    globalSocket = io(SOCKET_URL, {
      // Low-latency transport: skip long-polling, go straight to WebSocket
      transports: ['websocket'],
      // Faster reconnection
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
      reconnectionAttempts: 10,
      // Reduce overhead
      upgrade: false,
      // Larger buffer for batched messages
      perMessageDeflate: false,
      // Auth handshake
      auth: token ? { token } : {},
    });
  }
  return globalSocket;
}

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setIsConnected(true);
    };

    const onDisconnect = () => {
      setIsConnected(false);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      if (err.message === 'xhr poll error') {
        console.warn('[Socket] Server might be down or unreachable at:', SOCKET_URL);
      }
    });

    // If already connected, sync state
    if (socket.connected) setIsConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      // Do NOT disconnect — singleton stays alive
    };
  }, []);

  // Force socket to reconnect with new auth token
  const refreshSocket = (token) => {
    if (globalSocket) {
      console.log('[Socket] Refreshing connection with new token...');
      globalSocket.auth = token ? { token } : {};
      globalSocket.disconnect().connect();
    } else {
      // If it hasn't been created yet, getSocket will pick up the token from localStorage
      getSocket();
    }
  };

  return {
    socket: getSocket(),
    isConnected,
    refreshSocket,
  };
}
