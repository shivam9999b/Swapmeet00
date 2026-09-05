// ============================================
// CHAT.JS - SINGLE COMPLETE FILE
// ============================================

let localStream;
let peerConnection;
let currentRoomId = null;
let userId = null;

const servers = {
    iceServers: [{ urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'] }]
};

// UI Elements
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const remoteOverlay = document.getElementById('remoteOverlay');
const localOverlay = document.getElementById('localOverlay');
const statusText = document.getElementById('statusText');
const statusBadge = document.getElementById('statusBadge');
const chatMessages = document.getElementById('chatMessages');
const chatInput = document.getElementById('chatInput');
const msgCount = document.getElementById('msgCount');
const reportModal = document.getElementById('reportModal');
let messageCounter = 0;

// 1. INITIALIZE LOCAL CAMERA & MIC
async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: true
        });
        if (localVideo) localVideo.srcObject = localStream;
        if (localOverlay) localOverlay.style.display = "none";
        
        const loadingOverlay = document.getElementById('loadingOverlay');
        if (loadingOverlay) loadingOverlay.classList.add('hidden');
        
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) chatContainer.style.display = 'flex';
    } catch (err) {
        console.error("Camera/Mic permission error:", err);
        alert("Camera & Microphone access is required to use video chat!");
    }
}

// 2. MATCHMAKING VIA REALTIME DATABASE
async function findStranger() {
    resetConnection();
    if (statusText) statusText.innerText = "Searching...";
    if (statusBadge) {
        const dot = statusBadge.querySelector('.status-dot');
        if (dot) dot.className = "status-dot searching";
    }
    if (remoteOverlay) remoteOverlay.style.display = "flex";

    const waitingRef = database.ref('waitingUsers');
    const snap = await waitingRef.once('value');
    const waitingUsers = snap.val();

    if (waitingUsers) {
        // Match with an existing user in the waiting queue
        const strangerId = Object.keys(waitingUsers)[0];
        if (strangerId !== userId) {
            currentRoomId = `${strangerId}_${userId}`;
            await waitingRef.child(strangerId).remove();
            createPeerConnection(currentRoomId, false);
            return;
        }
    }

    // No waiting user found; place self into waiting queue
    currentRoomId = userId;
    await waitingRef.child(userId).set(true);

    database.ref(`rooms/${userId}`).on('value', async (snap) => {
        const data = snap.val();
        if (data && data.offer && !peerConnection) {
            createPeerConnection(userId, true);
        }
    });
}

// 3. WEBRTC HANDSHAKE & SIGNALING
async function createPeerConnection(roomId, isAnswerer) {
    peerConnection = new RTCPeerConnection(servers);

    // Add local tracks to WebRTC
    if (localStream) {
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    // Display remote stream when received
    peerConnection.ontrack = (event) => {
        if (remoteVideo) remoteVideo.srcObject = event.streams[0];
        if (remoteOverlay) remoteOverlay.style.display = "none";
        if (statusText) statusText.innerText = "Connected";
        if (statusBadge) {
            const dot = statusBadge.querySelector('.status-dot');
            if (dot) dot.className = "status-dot connected";
        }
    };

    const roomRef = database.ref(`rooms/${roomId}`);

    // Send ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            roomRef.child(isAnswerer ? 'answerCandidates' : 'offerCandidates').push(event.candidate.toJSON());
        }
    };

    if (!isAnswerer) {
        // Offerer Flow
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        await roomRef.set({ offer: { type: offer.type, sdp: offer.sdp } });

        roomRef.child('answer').on('value', async (snap) => {
            const answer = snap.val();
            if (answer && !peerConnection.currentRemoteDescription) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });

        roomRef.child('answerCandidates').on('child_added', (snap) => {
            peerConnection.addIceCandidate(new RTCIceCandidate(snap.val()));
        });
    } else {
        // Answerer Flow
        const roomData = (await roomRef.once('value')).val();
        if (roomData && roomData.offer) {
            await peerConnection.setRemoteDescription(new RTCSessionDescription(roomData.offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            await roomRef.child('answer').set({ type: answer.type, sdp: answer.sdp });

            roomRef.child('offerCandidates').on('child_added', (snap) => {
                peerConnection.addIceCandidate(new RTCIceCandidate(snap.val()));
            });
        }
    }

    listenForMessages(roomId);
}

// 4. REAL-TIME TEXT CHAT
function sendMessage() {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (text && currentRoomId) {
        database.ref(`messages/${currentRoomId}`).push({
            sender: userId,
            text: text,
            timestamp: Date.now()
        });
        chatInput.value = '';
    }
}

function listenForMessages(roomId) {
    database.ref(`messages/${roomId}`).on('child_added', (snap) => {
        const data = snap.val();
        if (!chatMessages) return;

        const msgDiv = document.createElement('div');
        msgDiv.className = `msg ${data.sender === userId ? 'self' : 'other'}`;
        msgDiv.innerText = data.text;
        
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        messageCounter++;
        if (msgCount) msgCount.innerText = messageCounter;
    });
}

// 5. RESET & CLEANUP
function resetConnection() {
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    if (currentRoomId) {
        database.ref(`rooms/${currentRoomId}`).remove();
        database.ref(`messages/${currentRoomId}`).remove();
        database.ref('waitingUsers').child(userId).remove();
    }
    if (remoteVideo) remoteVideo.srcObject = null;
    if (chatMessages) {
        chatMessages.innerHTML = '<div class="system-msg"><i class="fas fa-info-circle"></i> Connected with new partner!</div>';
    }
    messageCounter = 0;
    if (msgCount) msgCount.innerText = 0;
}

// 6. MEDIA CONTROL EVENT LISTENERS
document.getElementById('micToggle')?.addEventListener('click', function() {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        this.classList.toggle('muted', !audioTrack.enabled);
    }
});

document.getElementById('camToggle')?.addEventListener('click', function() {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        this.classList.toggle('muted', !videoTrack.enabled);
        if (localOverlay) localOverlay.style.display = videoTrack.enabled ? "none" : "flex";
    }
});

// Navigation & Actions
document.getElementById('nextBtn')?.addEventListener('click', findStranger);
document.getElementById('endBtn')?.addEventListener('click', resetConnection);
document.getElementById('sendBtn')?.addEventListener('click', sendMessage);
chatInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Report Modal Listeners
document.getElementById('reportBtn')?.addEventListener('click', () => {
    if (reportModal) reportModal.style.display = 'flex';
});

document.getElementById('closeReport')?.addEventListener('click', () => {
    if (reportModal) reportModal.style.display = 'none';
});

document.querySelectorAll('.report-option').forEach(btn => {
    btn.addEventListener('click', async function() {
        const reason = this.getAttribute('data-reason');
        if (currentRoomId && userId) {
            await database.ref('reports').push({
                reporter: userId,
                roomId: currentRoomId,
                reason: reason,
                timestamp: Date.now()
            });
            alert('User reported successfully.');
        }
        if (reportModal) reportModal.style.display = 'none';
        findStranger();
    });
});

document.getElementById('logoutBtn')?.addEventListener('click', () => {
    resetConnection();
    auth.signOut();
});

// 7. FIREBASE AUTH STATE LISTENER
auth.onAuthStateChanged(async (user) => {
    if (user) {
        userId = user.uid;
        await startLocalStream();
        findStranger();
    } else {
        window.location.href = 'index.html';
    }
});
