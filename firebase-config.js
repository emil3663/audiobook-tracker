// ============================================================
//  AUDIOBOOK TRACKER – Firebase Configuration
// ============================================================
//
//  To enable cross-device sync (laptop ↔ phone):
//
//  1. Go to https://console.firebase.google.com/
//     • Create a new project (the free "Spark" plan is enough)
//
//  2. In your project, click "Web" (</>) to add a Web app.
//     Copy the firebaseConfig values into the object below.
//
//  3. Go to "Firestore Database" → "Create database"
//     Choose "production mode", then add these security rules:
//
//     rules_version = '2';
//     service cloud.firestore {
//       match /databases/{database}/documents {
//         match /users/{userId}/books/{bookId} {
//           allow read, write: if request.auth != null
//                              && request.auth.uid == userId;
//         }
//       }
//     }
//
//  4. Go to "Authentication" → "Sign-in method"
//     Enable "Email/Password".
//
//  5. Replace the placeholder strings below with your real values.
//     Once they are filled in, the "Sign In to Sync" button will
//     appear in the app header.
//
// ============================================================

const FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT_ID.firebaseapp.com",
  projectId:         "YOUR_PROJECT_ID",
  storageBucket:     "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
