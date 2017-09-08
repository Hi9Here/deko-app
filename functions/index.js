const functions = require('firebase-functions');
const admin = require('firebase-admin')
admin.initializeApp(functions.config().firebase)
const ref = admin.database().ref();

// Copy a value when it is changed or created
exports.makeCopy = functions.database.ref('/profiles/{pushId}/deck/{pushId}/card')
    .onWrite(event => {
        const copy = event.data.val();
        return event.data.ref.parent.child('/profiles/river').set(copy);
    });