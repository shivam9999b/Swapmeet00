// ============================================
// FULLY UPDATED & FIXED CHAT.JS (FIRESTORE)
// ============================================

let localStream = null;
let peerConnection = null;
let currentRoomId = null;
let userId = null;
let unsubscribeRoom = null;
let unsubscribeMessages = null;
let unsubscribeCallerCandidates = null;
let unsubscribeCalleeCandidates = null;
let messageCounter = 0;

const servers = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
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

// 1. CAMERA & MIC INITIALIZATION
async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
            audio: true
        });
        if (localVideo) localVideo.srcObject = localStream;
        if (localOverlay) localOverlay.style.display = "none";

        document.getElementById('loadingOverlay')?.classList.add('hidden');
        document.getElementById('chatContainer')?.setAttribute('style', 'display: flex !important');
    } catch (err) {
        console.error("Camera/Mic Permission Error:", err);
        alert("Camera and Microphone access is required for video chat!");
    }
}

// 2. FIRESTORE MATCHMAKING
async function findStranger() {
    await resetConnection();
    updateStatus("Searching...", "searching");
    if (remoteOverlay) remoteOverlay.style.display = "flex";

    try {
        const waitingRef = db.collection('waitingUsers');
        const snapshot = await waitingRef.limit(1).get();

        if (!snapshot.empty) {
            // SCENARIO A: Partner Found (Join existing queue)
            const waitingDoc = snapshot.docs[0];
            const strangerId = waitingDoc.id;

            if (strangerId !== userId) {
                currentRoomId = `${strangerId}_${userId}`;
                await waitingRef.doc(strangerId).delete();
                await joinRoom(currentRoomId);
                return;
            }
        }

        // SCENARIO B: No Partner Found (Create waiting slot & room)
        currentRoomId = userId;
        await waitingRef.doc(userId).set({
            created: firebase.firestore.FieldValue.serverTimestamp()
        });
        await createRoom(currentRoomId);
    } catch (error) {
        console.error("Matchmaking Error:", error);
        updateStatus("Connection Error", "disconnected");
    }
}

// 3. CREATE ROOM (CALLER / OFFERER)
async function createRoom(roomId) {
    const roomRef = db.collection('rooms').doc(roomId);

    peerConnection = new RTCPeerConnection(servers);
    setupPeerListeners();

    const callerCandidates = roomRef.collection('callerCandidates');
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            callerCandidates.add(event.candidate.toJSON());
        }
    };

    // Create WebRTC Offer
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);

    await roomRef.set({
        offer: {
            type: offer.type,
            sdp: offer.sdp
        },
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    // Listen for Callee Answer
    unsubscribeRoom = roomRef.onSnapshot(async (snapshot) => {
        const data = snapshot.data();
        if (data && data.answer && !peerConnection.currentRemoteDescription) {
            const rtcSessionDescription = new RTCSessionDescription(data.answer);
            await peerConnection.setRemoteDescription(rtcSessionDescription);
        }
    });

    // Listen for Callee ICE Candidates
    unsubscribeCalleeCandidates = roomRef.collection('calleeCandidates').onSnapshot((snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
            if (change.type === 'added') {
                const candidate = new RTCIceCandidate(change.doc.data());
                await peerConnection.addIceCandidate(candidate);
            }
        });
    });

    listenForMessages(roomId);
}

// 4. JOIN ROOM (CALLEE / ANSWERER)
async function joinRoom(roomId) {
    const roomRef = db.collection('rooms').doc(roomId);
    const roomDoc = await roomRef.get();

    if (roomDoc.exists) {
        peerConnection = new RTCPeerConnection(servers);
        setupPeerListeners();

        const calleeCandidates = roomRef.collection('calleeCandidates');
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                calleeCandidates.add(event.candidate.toJSON());
            }
        };

        const offer = roomDoc.data().offer;
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

        // Create WebRTC Answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        // Update Parent Document with Answer
        await roomRef.update({
            answer: {
                type: answer.type,
                sdp: answer.sdp
            }
        });

        // Listen for Caller ICE Candidates
        unsubscribeCallerCandidates = roomRef.collection('callerCandidates').onSnapshot((snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
                if (change.type === 'added') {
                    const candidate = new RTCIceCandidate(change.doc.data());
                    await peerConnection.addIceCandidate(candidate);
                }
            });
        });

        listenForMessages(roomId);
    }
}

// 5. MEDIA TRACKS & REMOTE STREAM SETUP
function setupPeerListeners() {
    if (localStream) {
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });
    }

    peerConnection.ontrack = (event) => {
        if (remoteVideo) remoteVideo.srcObject = event.streams[0];
        if (remoteOverlay) remoteOverlay.style.display = "none";
        updateStatus("Connected", "connected");
    };

    peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'disconnected' || peerConnection.connectionState === 'failed') {
            updateStatus("Partner Disconnected", "disconnected");
            if (remoteOverlay) remoteOverlay.style.display = "flex";
        }
    };
}

// 6. FIRESTORE REALTIME CHAT
function sendMessage() {
    if (!chatInput) return;
    const text = chatInput.value.trim();
    if (text && currentRoomId) {
        db.collection('rooms').doc(currentRoomId).collection('messages').add({
            sender: userId,
            text: text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        chatInput.value = '';
    }
}

function listenForMessages(roomId) {
    unsubscribeMessages = db.collection('rooms').doc(roomId).collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    if (!chatMessages) return;

                    const msgDiv = document.createElement('div');
                    msgDiv.className = `msg ${data.sender === userId ? 'self' : 'other'}`;
                    msgDiv.innerText = data.text;

                    chatMessages.appendChild(msgDiv);
                    chatMessages.scrollTop = chatMessages.scrollHeight;

                    messageCounter++;
                    if (msgCount) msgCount.innerText = messageCounter;
                }
            });
        });
}

// 7. RESET CONNECTION & CLEANUP
async function resetConnection() {
    if (unsubscribeRoom) unsubscribeRoom();
    if (unsubscribeMessages) unsubscribeMessages();
    if (unsubscribeCallerCandidates) unsubscribeCallerCandidates();
    if (unsubscribeCalleeCandidates) unsubscribeCalleeCandidates();

    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }

    if (currentRoomId) {
        try {
            await db.collection('rooms').doc(currentRoomId).delete();
        } catch (e) { console.error("Room Cleanup Error:", e); }
    }

    if (userId) {
        try {
            await db.collection('waitingUsers').doc(userId).delete();
        } catch (e) { console.error("Waiting Slot Cleanup Error:", e); }
    }

    currentRoomId = null;

    if (remoteVideo) remoteVideo.srcObject = null;
    if (chatMessages) {
        chatMessages.innerHTML = '<div class="system-msg"><i class="fas fa-info-circle"></i> Connected with new partner!</div>';
    }

    messageCounter = 0;
    if (msgCount) msgCount.innerText = 0;
}

function updateStatus(text, statusClass) {
    if (statusText) statusText.innerText = text;
    if (statusBadge) {
        const dot = statusBadge.querySelector('.status-dot');
        if (dot) dot.className = `status-dot ${statusClass}`;
    }
}

// 8. EVENT LISTENERS
document.getElementById('micToggle')?.addEventListener('click', function () {
    if (!localStream) return;
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        this.classList.toggle('muted', !audioTrack.enabled);
    }
});

document.getElementById('camToggle')?.addEventListener('click', function () {
    if (!localStream) return;
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        this.classList.toggle('muted', !videoTrack.enabled);
        if (localOverlay) localOverlay.style.display = videoTrack.enabled ? "none" : "flex";
    }
});

document.getElementById('nextBtn')?.addEventListener('click', findStranger);
document.getElementById('endBtn')?.addEventListener('click', async () {
    await resetConnection();
    updateStatus("Disconnected", "disconnected");
    if (remoteOverlay) remoteOverlay.style.display = "flex";
});
document.getElementById('sendBtn')?.addEventListener('click', sendMessage);

chatInput?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

// Report System
document.getElementById('reportBtn')?.addEventListener('click', () => {
    if (reportModal) reportModal.style.display = 'flex';
});

document.getElementById('closeReport')?.addEventListener('click', () => {
    if (reportModal) reportModal.style.display = 'none';
});

document.querySelectorAll('.report-option').forEach(btn => {
    btn.addEventListener('click', async function () {
        const reason = this.getAttribute('data-reason');
        if (currentRoomId && userId) {
            await db.collection('reports').add({
                reporter: userId,
                roomId: currentRoomId,
                reason: reason,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert('User reported successfully.');
        }
        if (reportModal) reportModal.style.display = 'none';
        findStranger();
    });
});

document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await resetConnection();
    auth.signOut();
});

// 9. AUTH STATE LISTENER
auth.onAuthStateChanged(async (user) => {
    if (user) {
        userId = user.uid;
        await startLocalStream();
        findStranger();
    } else {
        window.location.href = 'index.html';
    }
});
    
