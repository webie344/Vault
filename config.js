

// ─────────────────────────────────────────────────────────────
// FILL THESE IN. Nothing here is secret — Firebase client config
// and Cloudinary cloud name/preset are meant to be public; access
// control happens via Firestore rules and Cloudinary preset settings.
// The Groq key is NOT here — it lives server-side in /api, as a
// Vercel environment variable (see README).
// ─────────────────────────────────────────────────────────────

export const firebaseConfig = {
  apiKey: "AIzaSyC9jF-ocy6HjsVzWVVlAyXW-4aIFgA79-A",
    authDomain: "crypto-6517d.firebaseapp.com",
    projectId: "crypto-6517d",
    storageBucket: "crypto-6517d.firebasestorage.app",
    messagingSenderId: "60263975159",
    appId: "1:60263975159:web:bd53dcaad86d6ed9592bf2"
};

export const cloudinaryConfig = {
  cloudName: "YOUR_CLOUD_NAME",
  // Create an UNSIGNED upload preset in Cloudinary settings
  // (Settings → Upload → Add upload preset → Signing mode: Unsigned).
  // This lets the browser upload directly without exposing your API secret.
  uploadPreset: "YOUR_UNSIGNED_PRESET",
};

// TEMPORARY: calling Groq directly from the browser for now, so this key
// ships inside the JS bundle and is readable by anyone who opens devtools.
// Fine for building/testing solo — before real users touch this, move
// these calls behind a serverless function (api/extract.js and
// api/search.js already exist from the earlier pass, unused right now)
// so the key stays server-side.
export const groqConfig = {
  apiKey: "YOUR_GROQ_API_KEY",
};
