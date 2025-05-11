// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBRXsNSQ-0dtA9fLzL7F46Q4M_lEtv590",
  authDomain: "englio-e8842.firebaseapp.com",
  projectId: "englio-e8842",
  storageBucket: "englio-e8842.appspot.com",
  messagingSenderId: "433326535991",
  appId: "1:433326535991:web:6fa8fc8bc134fff485d6b2"
};

// Инициализация Firebase
const app = initializeApp(firebaseConfig);

// Инициализация Firestore
export const db = getFirestore(app);
