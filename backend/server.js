const express = require('express');
const https = require('https');
const fs = require('fs');

// Replace filenames if you used mkcert
const credentials = {
  key:  fs.readFileSync('172.27.126.200-key.pem'),
  cert: fs.readFileSync('172.27.126.200.pem'),
};
const { Server } = require('socket.io');
const os = require('os');

const app = express();
const server = https.createServer(credentials, app);
const io = new Server(server, { cors: { origin: '*' } });

// Get local IP automatically
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) return net.address;
    }
  }
  return 'localhost';
}
const LOCAL_IP = getLocalIP();

// Serve laptop viewer
app.get('/', (req, res) => res.send(laptopHTML(LOCAL_IP)));
// Serve mobile page
app.get('/mobile', (req, res) => res.send(mobileHTML(LOCAL_IP)));

const rooms = {}; // store pending offers

io.on('connection', (socket) => {
  console.log('Connected:', socket.id, socket.handshake.headers['user-agent']?.slice(0, 40));

  // If a pending offer exists, send it to newly connected laptop
  socket.on('register-laptop', () => {
    socket.join('laptop');
    if (rooms['pending-offer']) {
      socket.emit('offer', rooms['pending-offer']);
    }
  });

  socket.on('offer', (data) => {
    rooms['pending-offer'] = data; // store it
    socket.to('laptop').emit('offer', data);
  });

  socket.on('answer', (data) => {
    socket.broadcast.emit('answer', data);
  });

  socket.on('ice-candidate', (data) => {
    socket.broadcast.emit('ice-candidate', data);
  });

  socket.on('switch-camera', () => {
    socket.broadcast.emit('switch-camera');
  });

  socket.on('disconnect', () => {
    console.log('Disconnected:', socket.id);
  });
});

server.listen(3001, '0.0.0.0', () => {
  console.log(`\n✅ Server running!`);
  console.log(`💻 Laptop: http://localhost:3001`);
  console.log(`📱 Phone:  http://${LOCAL_IP}:3001/mobile\n`);
});

// ── HTML pages embedded in server so no React needed ──────────────────

function laptopHTML(ip) {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<title>Camera Viewer</title>
<style>
  body { margin:0; background:#111; color:#fff; font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; }
  video { width:90vw; max-width:900px; border-radius:12px; background:#000; }
  #status { margin:12px; font-size:14px; color:#aaa; }
  #status.connected { color:#4caf50; }
  #status.error { color:#f44336; }
</style>
</head><body>
<h2 style="margin-bottom:8px">📷 Live Camera Feed</h2>
<div id="status">Waiting for phone to connect...</div>
<video id="video" autoplay playsinline></video>
<p style="font-size:12px;color:#555;margin-top:8px">
  Open on phone: <strong>http://${ip}:3001/mobile</strong>
</p>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
const status = document.getElementById('status');
const video = document.getElementById('video');
let pc;

socket.emit('register-laptop');

socket.on('connect', () => {
  socket.emit('register-laptop');
  log('Connected to server, waiting for phone...');
});

socket.on('offer', async (offer) => {
  log('Got offer from phone, connecting...', 'connecting');
  try {
    pc = new RTCPeerConnection({ iceServers: [] });

    pc.ontrack = (e) => {
      log('Stream received!', 'connected');
      video.srcObject = e.streams[0];
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) socket.emit('ice-candidate', candidate);
    };

    pc.onconnectionstatechange = () => {
      log('Connection: ' + pc.connectionState,
        pc.connectionState === 'connected' ? 'connected' : '');
    };

    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    socket.emit('answer', answer);
  } catch(err) {
    log('Error: ' + err.message, 'error');
    console.error(err);
  }
});

socket.on('ice-candidate', async (c) => {
  if (pc) try { await pc.addIceCandidate(c); } catch(e) {}
});

function log(msg, cls='') {
  console.log(msg);
  status.textContent = msg;
  status.className = cls;
}
</script>
</body></html>`;
}

function mobileHTML(ip) {
  return `<!DOCTYPE html><html><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Camera Source</title>
<style>
  body { margin:0; background:#111; color:#fff; font-family:sans-serif; display:flex; flex-direction:column; align-items:center; padding:20px; }
  video { width:100%; max-width:400px; border-radius:10px; background:#000; }
  button { margin:10px; padding:12px 24px; font-size:16px; border:none; border-radius:8px; background:#2196f3; color:#fff; cursor:pointer; }
  #status { margin:8px; font-size:13px; color:#aaa; text-align:center; }
  #status.ok { color:#4caf50; }
  #status.error { color:#f44336; }
</style>
</head><body>
<h2>📱 Camera Source</h2>
<div id="status">Starting camera...</div>
<video id="preview" autoplay muted playsinline></video>
<button onclick="switchCamera()">🔄 Switch Camera</button>

<script src="/socket.io/socket.io.js"></script>
<script>
const socket = io();
let stream, pc;
let facing = 'environment';

async function startCamera() {
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    document.getElementById('preview').srcObject = stream;
    log('Camera ready. Connecting to laptop...', '');
    return true;
  } catch(err) {
    log('Camera error: ' + err.message, 'error');
    console.error(err);
    return false;
  }
}

async function startWebRTC() {
  if (pc) { pc.close(); pc = null; }
  pc = new RTCPeerConnection({ iceServers: [] });

  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  pc.onicecandidate = ({ candidate }) => {
    if (candidate) socket.emit('ice-candidate', candidate);
  };

  pc.onconnectionstatechange = () => {
    const s = pc.connectionState;
    if (s === 'connected') log('Streaming to laptop!', 'ok');
    else if (s === 'failed') { log('Connection failed, retrying...', 'error'); setTimeout(startWebRTC, 2000); }
    else log('Status: ' + s, '');
  };

  try {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('offer', offer);
    log('Waiting for laptop to answer...', '');
  } catch(err) {
    log('Offer error: ' + err.message, 'error');
  }
}

socket.on('connect', async () => {
  log('Connected to server', '');
  const ok = await startCamera();
  if (ok) startWebRTC();
});

socket.on('answer', async (answer) => {
  try {
    await pc.setRemoteDescription(answer);
    log('Laptop connected!', 'ok');
  } catch(err) {
    log('Answer error: ' + err.message, 'error');
  }
});

socket.on('ice-candidate', async (c) => {
  if (pc) try { await pc.addIceCandidate(c); } catch(e) {}
});

socket.on('switch-camera', () => switchCamera());

async function switchCamera() {
  facing = facing === 'environment' ? 'user' : 'environment';
  await startCamera();
  if (pc) {
    const sender = pc.getSenders().find(s => s.track?.kind === 'video');
    if (sender) sender.replaceTrack(stream.getVideoTracks()[0]);
  }
}

function log(msg, cls) {
  console.log(msg);
  const el = document.getElementById('status');
  el.textContent = msg;
  el.className = cls;
}
</script>
</body></html>`;
}