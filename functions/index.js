const functions = require('firebase-functions');
const firestore = require('firebase-functions/lib/providers/datastore');
const admin = require('firebase-admin')
admin.initializeApp(functions.config().firebase)
const ref = admin.database().ref();

// Copy a value when it is changed or created
exports.makeCopy = functions.database.ref('/profiles/{anyDocument}/deks/{anyDocument}/cards/{anyDocument}')
    .onWrite(event => {
        const copy = event.data.val();
        return event.data.ref.parent.child('/profiles/river').set(copy);
    });