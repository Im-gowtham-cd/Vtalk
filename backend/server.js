const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const authRouter = require('./auth');
const { verifyToken } = require('./authMiddleware');
const { router: historyRouter, saveSession } = require('./historyStore');
const { extractTasks } = require('./taskExtractor');

// Generate 5-char uppercase alphanumeric room ID
function generateRoomId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 5; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

const app = express();
const server = http.createServer(app);

// Allow multiple origins (local dev + production Vercel)
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  process.env.FRONTEND_URL,
  /\.vercel\.app$/,
  /\.onrender\.com$/,
].filter(Boolean);

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
  pingInterval: 10000,
  pingTimeout: 5000,
  perMessageDeflate: false,
  maxHttpBufferSize: 1e6,
});

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

// ── REST routes ──────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'SpiceZ-Cam signaling server running' });
});

app.use('/auth', authRouter);
app.use('/history', historyRouter);

// ── In-memory stores ─────────────────────────────────────────────────────────
const rooms = new Map();
const userNames = new Map();          // socketId -> userName
const socketRooms = new Map();        // socketId -> roomId
const socketUsers = new Map();        // socketId -> { id, name, email } (authenticated users)
const roomTranscripts = new Map();    // roomId -> [{ speaker, timestamp, text }]
const roomStartTimes = new Map();     // roomId -> epoch ms
const roomParticipants = new Map();   // roomId -> [{ id, name }] (for history)

const chatRateLimit = new Map();
const CHAT_RATE_MS = 200;

// ── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  // Authenticate socket if token provided in handshake
  const token = socket.handshake.auth?.token;
  if (token) {
    const decoded = verifyToken(token);
    if (decoded) {
      socketUsers.set(socket.id, { id: decoded.id, name: decoded.name, email: decoded.email });
      userNames.set(socket.id, decoded.name);
    }
  }

  // Create room
  socket.on('create-room', ({ password, userName }, callback) => {
    let roomId = generateRoomId();
    while (rooms.has(roomId)) roomId = generateRoomId();
    if (userName) userNames.set(socket.id, userName);
    rooms.set(roomId, {
      id: roomId,
      password: password || null,
      creator: socket.id,
      participants: new Set([socket.id]),
    });
    socket.join(roomId);
    socketRooms.set(socket.id, roomId);
    roomStartTimes.set(roomId, Date.now());
    roomTranscripts.set(roomId, []);
    roomParticipants.set(roomId, [{ id: socket.id, name: userNames.get(socket.id) || 'Anonymous' }]);
    callback({ roomId, success: true });
  });

  // Join room
  socket.on('join-room', ({ roomId, password, userName }, callback) => {
    const room = rooms.get(roomId);

    if (!room) {
      return callback({ success: false, error: 'Room not found' });
    }
    if (room.password && room.password !== password) {
      return callback({ success: false, error: 'Incorrect password' });
    }

    if (userName) userNames.set(socket.id, userName);
    room.participants.add(socket.id);
    socket.join(roomId);
    socketRooms.set(socket.id, roomId);

    // Track participant for history
    const rp = roomParticipants.get(roomId) || [];
    if (!rp.find((p) => p.id === socket.id)) {
      rp.push({ id: socket.id, name: userNames.get(socket.id) || 'Anonymous' });
      roomParticipants.set(roomId, rp);
    }

    const participantsList = [];
    for (const id of room.participants) {
      if (id !== socket.id) {
        participantsList.push({ id, name: userNames.get(id) || 'Anonymous' });
      }
    }

    callback({ success: true, participants: participantsList });
  });

  // WebRTC signaling: offer
  socket.on('offer', ({ to, offer }) => {
    const userName = userNames.get(socket.id) || 'Anonymous';
    socket.to(to).emit('offer', { from: socket.id, offer, userName });
  });

  // Ready signal
  socket.on('ready', ({ roomId }) => {
    const userName = userNames.get(socket.id) || 'Anonymous';
    socket.to(roomId).emit('user-joined', { userId: socket.id, userName });
  });

  // WebRTC signaling: answer
  socket.on('answer', ({ to, answer }) => {
    socket.to(to).emit('answer', { from: socket.id, answer });
  });

  // WebRTC signaling: single ICE candidate
  socket.on('ice-candidate', ({ to, candidate }) => {
    socket.to(to).emit('ice-candidate', { from: socket.id, candidate });
  });

  // WebRTC signaling: batched ICE candidates
  socket.on('ice-candidates', ({ to, candidates }) => {
    if (Array.isArray(candidates) && candidates.length > 0) {
      socket.to(to).emit('ice-candidates', { from: socket.id, candidates });
    }
  });

  // Toggle media state
  socket.on('toggle-media', ({ roomId, type, enabled }) => {
    socket.to(roomId).emit('user-toggle-media', {
      userId: socket.id,
      type,
      enabled,
    });
  });

  // Screen share state
  socket.on('screen-share-started', ({ roomId }) => {
    socket.to(roomId).emit('user-screen-share', { userId: socket.id, sharing: true });
  });

  socket.on('screen-share-stopped', ({ roomId }) => {
    socket.to(roomId).emit('user-screen-share', { userId: socket.id, sharing: false });
  });

  // Emoji reaction
  socket.on('emoji-reaction', ({ roomId, emoji }) => {
    const userName = userNames.get(socket.id) || 'Anonymous';
    socket.to(roomId).emit('emoji-reaction', {
      userId: socket.id,
      userName,
      emoji,
    });
  });

  // Chat message with rate limiting
  socket.on('chat-message', ({ roomId, message }) => {
    const now = Date.now();
    const lastMsg = chatRateLimit.get(socket.id) || 0;
    if (now - lastMsg < CHAT_RATE_MS) return;
    chatRateLimit.set(socket.id, now);

    const sanitized = typeof message === 'string' ? message.slice(0, 1000) : '';
    if (!sanitized) return;

    const userName = userNames.get(socket.id) || 'Anonymous';
    io.to(roomId).emit('chat-message', {
      id: `${socket.id}-${now}`,
      userId: socket.id,
      userName,
      message: sanitized,
      timestamp: now,
    });
  });

  // ── Transcript segment ─────────────────────────────────────────────────────
  socket.on('transcript-segment', ({ roomId, segment }) => {
    if (!roomId || !segment || !segment.text) return;

    const transcripts = roomTranscripts.get(roomId) || [];
    transcripts.push({
      speaker: segment.speaker || userNames.get(socket.id) || 'Anonymous',
      timestamp: segment.timestamp || Date.now(),
      text: segment.text,
    });
    roomTranscripts.set(roomId, transcripts);

    // Broadcast the updated transcript to all room members
    io.to(roomId).emit('transcript-update', { segments: transcripts });
  });

  // ── Export to Notion ───────────────────────────────────────────────────────
  socket.on('export-to-notion', async ({ roomId, summary }, callback) => {
    try {
      const { createNotionDoc } = require('./notion');
      const transcript = roomTranscripts.get(roomId) || [];
      const startTime = roomStartTimes.get(roomId) || Date.now();
      const tasks = extractTasks(transcript, startTime);

      const url = await createNotionDoc(
        roomId,
        summary || 'Automated meeting notes from Vtalk',
        tasks
      );

      callback({ success: true, url });
    } catch (err) {
      console.error('[Notion] Export failed:', err.message);
      callback({ success: false, error: err.message });
    }
  });

  // ── Leave room (explicit) ──────────────────────────────────────────────────
  socket.on('leave-room', ({ roomId }) => {
    handleLeave(socket, roomId);
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', () => {
    const roomId = socketRooms.get(socket.id);
    if (roomId) {
      handleLeave(socket, roomId);
    }
    userNames.delete(socket.id);
    socketUsers.delete(socket.id);
    chatRateLimit.delete(socket.id);
  });

  // ── Helper: handle room leave + session save ───────────────────────────────
  function handleLeave(sock, roomId) {
    console.log(`[Backend] User ${sock.id} leaving room ${roomId}`);
    const room = rooms.get(roomId);
    if (!room) {
      socketRooms.delete(sock.id);
      return;
    }

    // Save session for this specific user before they are fully removed
    saveUserSession(sock.id, roomId);

    if (room.creator === sock.id) {
      // Creator left → close room for everyone else
      io.to(roomId).emit('room-closed', { reason: 'Creator left the room' });
      finalizeRoom(roomId);
      rooms.delete(roomId);
    } else {
      room.participants.delete(sock.id);
      sock.to(roomId).emit('user-left', { userId: sock.id });

      // If room is now empty, finalize (cleanup state)
      if (room.participants.size === 0) {
        finalizeRoom(roomId);
        rooms.delete(roomId);
      }
    }

    socketRooms.delete(sock.id);
  }

  function saveUserSession(socketId, roomId) {
    const authUser = socketUsers.get(socketId);
    if (!authUser) {
      console.log(`[Backend] User ${socketId} is not authenticated. Skipping DB save.`);
      return;
    }

    const startTime = roomStartTimes.get(roomId) || Date.now();
    const duration = Math.floor((Date.now() - startTime) / 1000);
    const transcriptSegments = roomTranscripts.get(roomId) || [];
    const participantsList = roomParticipants.get(roomId) || [];
    const tasks = extractTasks(transcriptSegments, startTime);

    const sessionData = {
      sessionId: uuidv4(),
      roomId,
      date: new Date().toISOString(),
      duration,
      participants: participantsList,
      transcript: transcriptSegments,
      tasks,
    };

    console.log(`[Backend] Individual save for ${authUser.email} in room ${roomId}`);
    saveSession(authUser.id, sessionData);
  }

  function finalizeRoom(roomId) {
    console.log(`[Backend] Finalizing room: ${roomId}`);
    const startTime = roomStartTimes.get(roomId) || Date.now();
    const duration = Math.floor((Date.now() - startTime) / 1000);
    const transcriptSegments = roomTranscripts.get(roomId) || [];
    const participantsList = roomParticipants.get(roomId) || [];

    console.log(`[Backend] Room stats: ${transcriptSegments.length} segments, ${participantsList.length} participants`);

    // Extract tasks from transcript
    const tasks = extractTasks(transcriptSegments, startTime);

    // Emit tasks to the room before it closes
    io.to(roomId).emit('tasks-extracted', { tasks });

    // Save session for each authenticated participant
    const sessionData = {
      sessionId: uuidv4(),
      roomId,
      date: new Date().toISOString(),
      duration,
      participants: participantsList,
      transcript: transcriptSegments,
      tasks,
    };

    // Save for all participants that have an authenticated user entry
    const room = rooms.get(roomId);
    let saveCount = 0;
    if (room) {
      for (const socketId of room.participants) {
        const authUser = socketUsers.get(socketId);
        if (authUser) {
          console.log(`[Backend] Saving session for user: ${authUser.email}`);
          saveSession(authUser.id, { ...sessionData });
          saveCount++;
        }
      }
    }

    // Also try to save for the creator if they're authenticated
    if (room?.creator) {
      const creatorUser = socketUsers.get(room.creator);
      if (creatorUser) {
        // Check if we already saved for the creator (they'd be in participants)
        if (!room.participants.has(room.creator)) {
          console.log(`[Backend] Saving session for creator: ${creatorUser.email}`);
          saveSession(creatorUser.id, { ...sessionData });
          saveCount++;
        }
      }
    }

    console.log(`[Backend] Room ${roomId} finalized. Triggered ${saveCount} saves.`);

    // Cleanup
    roomTranscripts.delete(roomId);
    roomStartTimes.delete(roomId);
    roomParticipants.delete(roomId);
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`SpiceZ-Cam server running on port ${PORT}`);
});
