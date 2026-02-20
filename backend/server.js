const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const authRouter = require('./auth');
const { verifyToken } = require('./authMiddleware');
const { router: historyRouter, saveSession } = require('./historyStore');
const { extractTasks, extractTasksFromText } = require('./taskExtractor');

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
const roomSummaries = new Map();      // roomId -> latest AI summary string
const roomStartTimes = new Map();     // roomId -> epoch ms
const roomParticipants = new Map();   // roomId -> [{ id, name }] (for history)

const chatRateLimit = new Map();
const CHAT_RATE_MS = 200;

// Store session IDs and participants for rooms that were recently closed (60s shelf life)
// This allows late-arriving transcription summaries to still save to the database.
const closedRoomSessions = new Map(); // roomId -> { sessionId, participants: [{id, name}], expires: timestamp }

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
      sessionId: uuidv4(), // Stable ID for this meeting session
    });
    socket.join(roomId);
    socketRooms.set(socket.id, roomId);
    roomStartTimes.set(roomId, Date.now());
    roomTranscripts.set(roomId, []);
    roomSummaries.set(roomId, '');
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

  // ── Update AI Summary ──────────────────────────────────────────────────────
  socket.on('update-summary', async ({ roomId, summary }) => {
    if (!roomId || !summary) return;
    console.log(`[Backend] Received summary update for room ${roomId}`);
    roomSummaries.set(roomId, summary);

    // Also re-extract tasks from both transcript AND the new summary
    const transcript = roomTranscripts.get(roomId) || [];
    const startTime = roomStartTimes.get(roomId) || Date.now();

    // Standard extraction from transcript segments
    const transcriptTasks = await extractTasks(transcript, startTime);

    // Advanced extraction from the meeting context (transcript and summary)
    const summaryTasks = await extractTasksFromText(summary);

    // Combine and deduplicate
    const combinedTasks = [...transcriptTasks, ...summaryTasks];
    console.log(`[Backend] update-summary: Extracted ${combinedTasks.length} total tasks for room ${roomId}`);

    // Store in-memory so finalizeRoom doesn't have to re-extract
    roomTranscripts.set(roomId + '_tasks', combinedTasks);

    // Broadcast to active room members
    io.to(roomId).emit('tasks-extracted', { tasks: combinedTasks });

    // ✅ CRITICAL PERSISTENCE: Save to DB even if the room was just finalized
    const room = rooms.get(roomId);
    const closedSession = closedRoomSessions.get(roomId);

    if (room || closedSession) {
      const sessionId = room?.sessionId || closedSession?.sessionId;
      const participants = room ? roomParticipants.get(roomId) : closedSession?.participants;
      const transcript = roomTranscripts.get(roomId) || [];

      // We use the roomParticipants map if it exists, otherwise the cached one from closedRoomSessions
      if (participants) {
        console.log(`[Backend] update-summary: Persisting tasks to Supabase for ${participants.length} participants.`);
        for (const p of participants) {
          const authUser = socketUsers.get(p.id);
          if (authUser) {
            await saveSession(authUser.id, {
              sessionId,
              roomId,
              date: new Date().toISOString(),
              duration: 0, // Duration is already set in the initial save
              participants,
              transcript,
              tasks: combinedTasks,
              summary,
            });
          }
        }
      }
    }
  });

  // ── Export to Notion ───────────────────────────────────────────────────────
  socket.on('export-to-notion', async ({ roomId, summary }, callback) => {
    try {
      const { createNotionDoc } = require('./notion');
      const transcript = roomTranscripts.get(roomId) || [];
      const startTime = roomStartTimes.get(roomId) || Date.now();
      const tasks = await extractTasks(transcript, startTime);

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
  socket.on('leave-room', async ({ roomId }) => {
    await handleLeave(socket, roomId);
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────
  socket.on('disconnect', async () => {
    const roomId = socketRooms.get(socket.id);
    if (roomId) {
      await handleLeave(socket, roomId);
    }
    userNames.delete(socket.id);
    socketUsers.delete(socket.id);
    chatRateLimit.delete(socket.id);
  });

  // ── Helper: handle room leave + session save ───────────────────────────────
  async function handleLeave(sock, roomId) {
    console.log(`[Backend] User ${sock.id} leaving room ${roomId}`);
    const room = rooms.get(roomId);
    if (!room) {
      socketRooms.delete(sock.id);
      return;
    }

    // Save session for this specific user before they are fully removed
    await saveUserSession(sock.id, roomId);

    if (room.creator === sock.id) {
      // Creator left → close room for everyone else
      io.to(roomId).emit('room-closed', { reason: 'Creator left the room' });
      await finalizeRoom(roomId);
      rooms.delete(roomId);
    } else {
      room.participants.delete(sock.id);
      sock.to(roomId).emit('user-left', { userId: sock.id });

      // If room is now empty, finalize (cleanup state)
      if (room.participants.size === 0) {
        await finalizeRoom(roomId);
        rooms.delete(roomId);
      }
    }

    socketRooms.delete(sock.id);
  }

  async function saveUserSession(socketId, roomId) {
    const authUser = socketUsers.get(socketId);
    if (!authUser) {
      console.log(`[Backend] User ${socketId} is not authenticated. Skipping DB save.`);
      return;
    }

    const startTime = roomStartTimes.get(roomId) || Date.now();
    const duration = Math.floor((Date.now() - startTime) / 1000);
    const transcriptSegments = roomTranscripts.get(roomId) || [];
    const roomSummary = roomSummaries.get(roomId) || '';
    const participantsList = roomParticipants.get(roomId) || [];

    // Extract from both sources
    const transcriptTasks = await extractTasks(transcriptSegments, startTime);
    const summaryTasks = await extractTasksFromText(roomSummary);
    const tasks = [...transcriptTasks, ...summaryTasks];

    const room = rooms.get(roomId);
    if (!room) return;

    const sessionData = {
      sessionId: room.sessionId, // Use stable ID
      roomId,
      date: new Date().toISOString(),
      duration,
      participants: participantsList,
      transcript: transcriptSegments,
      tasks,
      summary: roomSummary,
    };

    console.log(`[Backend] saveUserSession: Saving for ${authUser.email} in room ${roomId}. Tasks found: ${tasks.length}`);
    await saveSession(authUser.id, sessionData);
  }

  async function finalizeRoom(roomId) {
    console.log(`[Backend] Finalizing room: ${roomId}`);
    const startTime = roomStartTimes.get(roomId) || Date.now();
    const duration = Math.floor((Date.now() - startTime) / 1000);
    const transcriptSegments = roomTranscripts.get(roomId) || [];
    const roomSummary = roomSummaries.get(roomId) || '';
    const participantsList = roomParticipants.get(roomId) || [];

    const room = rooms.get(roomId);
    console.log(`[Backend] Room stats: ${transcriptSegments.length} segments, ${participantsList.length} participants`);

    // ✅ Optimization: Check if we already extracted tasks during a recent summary update
    let tasks = roomTranscripts.get(roomId + '_tasks');

    if (!tasks) {
      console.log(`[Backend] finalizeRoom: No cached tasks, performing final extraction...`);
      // Extract tasks from BOTH transcript and summary (Gemini AI)
      const transcriptTasks = await extractTasks(transcriptSegments, startTime);
      const summaryTasks = await extractTasksFromText(roomSummary);
      tasks = [...transcriptTasks, ...summaryTasks];
    } else {
      console.log(`[Backend] finalizeRoom: Using ${tasks.length} cached tasks.`);
    }

    // Emit tasks to the room before it closes
    console.log(`[Backend] finalizeRoom: Emitting ${tasks.length} tasks to room ${roomId}`);
    io.to(roomId).emit('tasks-extracted', { tasks });

    // Save session for each authenticated participant
    const sessionData = {
      sessionId: room.sessionId, // Always use the room's unique stable ID
      roomId,
      date: new Date().toISOString(),
      duration,
      participants: participantsList,
      transcript: transcriptSegments,
      tasks,
      summary: roomSummary,
    };

    // Save for all participants that have an authenticated user entry
    let saveCount = 0;
    for (const socketId of room.participants) {
      const authUser = socketUsers.get(socketId);
      if (authUser) {
        console.log(`[Backend] finalizeRoom: Saving session for user: ${authUser.email}. Tasks: ${tasks.length}`);
        await saveSession(authUser.id, { ...sessionData });
        saveCount++;
      }
    }

    console.log(`[Backend] finalizeRoom: Room ${roomId} finalized. Successfully triggered ${saveCount} upserts.`);
    if (room?.creator) {
      const creatorUser = socketUsers.get(room.creator);
      if (creatorUser) {
        // Check if we already saved for the creator (they'd be in participants)
        if (!room.participants.has(room.creator)) {
          console.log(`[Backend] Saving session for creator: ${creatorUser.email}`);
          await saveSession(creatorUser.id, { ...sessionData });
          saveCount++;
        }
      }
    }

    console.log(`[Backend] Room ${roomId} finalized. Triggered ${saveCount} saves.`);

    // ✅ PRESERVE SESSION INFO for 60 seconds to catch late AI summaries
    closedRoomSessions.set(roomId, {
      sessionId: room.sessionId,
      participants: participantsList,
      expires: Date.now() + 60000
    });

    // Automated cleanup
    setTimeout(() => {
      const session = closedRoomSessions.get(roomId);
      if (session && Date.now() >= session.expires) {
        closedRoomSessions.delete(roomId);
        console.log(`[Backend] Cleanup: Removed session info for expired room ${roomId}`);
      }
    }, 65000);

    // Cleanup active stores
    roomTranscripts.delete(roomId);
    roomSummaries.delete(roomId);
    roomStartTimes.delete(roomId);
    roomParticipants.delete(roomId);
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('[Backend Error]:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`[Backend] Vtalk signaling server running on port ${PORT}`);
});
