/**
 * STUDY SPRINT: FIND THE IMPOSTER - FIREBASE ENGINE INITIALIZATION
 * Realtime configuration mapping for serverless edge deployment.
 */

const firebaseConfig = {
  apiKey: "AIzaSyBONSQrksGAIgTuqI8bNWcw2mHshnV5FqY",
  authDomain: "find-the-imposter-4f0cd.firebaseapp.com",
  databaseURL: "https://find-the-imposter-4f0cd-default-rtdb.firebaseio.com", 
  projectId: "find-the-imposter-4f0cd",
  storageBucket: "find-the-imposter-4f0cd.firebasestorage.app",
  messagingSenderId: "619830069",
  appId: "1:619830069:web:1ff9aab42facbb3ab10a7c",
  measurementId: "G-QFB4F2Z75F"
};

// Guard initialization checklist routing
if (firebaseConfig.apiKey.includes("YOUR_")) {
    console.warn("SYSTEM CRITICAL: Replace placeholders in `firebase-config.js` with functional Firebase Web Configuration credentials.");
}

// Global scope initialization mapping for app engine context mapping
firebase.initializeApp(firebaseConfig);
const database = firebase.database();