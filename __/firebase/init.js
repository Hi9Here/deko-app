if (typeof firebase === 'undefined') throw new Error('hosting/init-error: Firebase SDK not detected. You must include it before /__/firebase/init.js');
firebase.initializeApp({
  "apiKey": "AIzaSyCKbNZem3UKzkWy8NST2Al7gKWpAXFduWU",
  "databaseURL": "https://deko-app-one.firebaseio.com",
  "storageBucket": "deko-app-one.appspot.com",
  "authDomain": "deko-app-one.firebaseapp.com",
  "messagingSenderId": "725126605692",
  "projectId": "deko-app-one"
})
