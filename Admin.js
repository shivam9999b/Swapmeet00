// ============================================
// ADMIN PANEL FULL CONTROL (FIRESTORE)
// ============================================

const ADMIN_EMAILS = ['admin@swapmeet.com', 'your-email@gmail.com'];

// 1. Check Admin Auth
auth.onAuthStateChanged(async (user) => {
    if (user && ADMIN_EMAILS.includes(user.email)) {
        console.log("Admin Authorized:", user.email);
        loadDashboardStats();
        listenToUsers();
        listenToReports();
    } else {
        alert("Access Denied: Admins Only!");
        window.location.href = "index.html";
    }
});

// 2. Load Real-time Stats
function loadDashboardStats() {
    // Total Users Count
    db.collection('users').onSnapshot(snap => {
        document.getElementById('totalUsers').innerText = snap.size;
    });

    // Total Reports Count
    db.collection('reports').onSnapshot(snap => {
        document.getElementById('totalReports').innerText = snap.size;
    });
}

// 3. READ & MANAGE USERS (Full Control)
function listenToUsers() {
    const userTable = document.getElementById('userTableBody');
    
    db.collection('users').onSnapshot(snapshot => {
        if (!userTable) return;
        userTable.innerHTML = '';
        
        snapshot.forEach(doc => {
            const user = doc.data();
            const id = doc.id;
            
            const row = `
                <tr>
                    <td>${user.displayName || 'N/A'}</td>
                    <td>${user.email}</td>
                    <td><span class="status ${user.isBanned ? 'banned' : 'active'}">${user.isBanned ? 'Banned' : 'Active'}</span></td>
                    <td>
                        <button onclick="toggleBanUser('${id}', ${user.isBanned || false})" class="btn-warning">
                            ${user.isBanned ? 'Unban' : 'Ban'}
                        </button>
                        <button onclick="deleteUserDoc('${id}')" class="btn-danger">Delete</button>
                    </td>
                </tr>
            `;
            userTable.innerHTML += row;
        });
    });
}

// UPDATE: Ban / Unban User
async function toggleBanUser(userId, currentStatus) {
    try {
        await db.collection('users').doc(userId).update({
            isBanned: !currentStatus
        });
        alert(`User status updated!`);
    } catch (err) {
        console.error("Error updating user:", err);
    }
}

// DELETE: Delete User Document
async function deleteUserDoc(userId) {
    if (confirm("Are you sure you want to delete this user record?")) {
        try {
            await db.collection('users').doc(userId).delete();
            alert("User deleted successfully!");
        } catch (err) {
            console.error("Error deleting user:", err);
        }
    }
}

// 4. READ & RESOLVE REPORTS
function listenToReports() {
    const reportContainer = document.getElementById('reportsList');
    
    db.collection('reports').orderBy('timestamp', 'desc').onSnapshot(snapshot => {
        if (!reportContainer) return;
        reportContainer.innerHTML = '';
        
        snapshot.forEach(doc => {
            const report = doc.data();
            const id = doc.id;
            
            const item = `
                <div class="report-card">
                    <p><strong>Reported User:</strong> ${report.reportedUserId}</p>
                    <p><strong>Reason:</strong> ${report.reason}</p>
                    <button onclick="dismissReport('${id}')" class="btn-secondary">Dismiss</button>
                    <button onclick="toggleBanUser('${report.reportedUserId}', false)" class="btn-danger">Ban User</button>
                </div>
            `;
            reportContainer.innerHTML += item;
        });
    });
}

// DELETE: Dismiss Report
async function dismissReport(reportId) {
    try {
        await db.collection('reports').doc(reportId).delete();
    } catch (err) {
        console.error("Error deleting report:", err);
    }
}
