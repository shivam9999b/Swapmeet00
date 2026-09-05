const firebaseConfig = {
    apiKey: "AIzaSyCHpvPo3DfUXfSJCkqfzJPHuILirbGTA5o",
    authDomain: "swapmeet-d2115.firebaseapp.com",
    projectId: "swapmeet-d2115",
    storageBucket: "swapmeet-d2115.firebasestorage.app",
    messagingSenderId: "72138942976",
    appId: "1:72138942976:web:40e7fe285df4bf0bd206e5"
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore(); // Firestore Connection
const googleProvider = new firebase.auth.GoogleAuthProvider();

console.log('Firestore Initialized Successfully!');
