const functions = require('firebase-functions');
const express = require("express")
const Twig = require("twig")
const admin = require("firebase-admin")
admin.initializeApp(functions.config().firebase);

var db = admin.firestore();

const app = express()
var god = functions.https.onRequest(app)
    /* Express */

app.use(express.static('files'))

app.set("twig options", {
    strict_variables: false
})

// get the 
app.get('/users', function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    db.collection('Users').get().then(snapshot => {
        var users = []
        snapshot.forEach(doc => {
            users.push(doc.data().details)
            console.log(doc.id, '=>', doc.data())
        })
        res.json(users)
    }).catch(e => {
        console.log(e)
    })
})

//Get the name of the profiles and add to an array
app.get('/profiles', function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    db.collection('Profiles').get().then(snapshot => {
        var profiles = []
        snapshot.forEach(doc => {
            //doc.date().displayName is the field value in the data under the profile
            profiles.push(doc.data().displayName)
                //doc.id is the id of the document
                //doc.data is what is inside it
            console.log(doc.id, '=>', doc.data())
        })
        res.json(profiles)
    }).catch(e => {
        console.log(e)
    })
})

//Check Card for any instructions
app.get('/card/:profileid/:cardid', function(req, res) {
    res.setHeader('Content-Type', 'application/json');
    // Get ProfileID
    const profileID = req.params.profileid;
    console.log('profile id var is ', profileID);
    // Get CardID
    const cardID = req.params.cardid;
    console.log('card id var is ', cardID);

    const cardRef = db.collection('Profiles').doc(profileID).collection('cards').doc(cardID);

    cardRef.get()
        .then(card => {
            if (card.exists) {
                var cardStuff = card.data()
                const givenArray = cardStuff.given
                delete(cardStuff.given)
                cardStuff.fromProfile = profileID
                    // cardStuff.pak = 1
                const givenCard = cardStuff
                givenArray.forEach(givenToProfileID => {
                    db.collection('Profiles').doc(givenToProfileID).collection('cards').add(givenCard)
                })
                console.log("Card Data:", cardStuff, 'and givenarray is', givenArray)
            } else {
                console.log("No such Card!");
            }
            res.json({ success: true })
        }).catch(function(error) {
            console.log("Error getting Card:", error);
            res.json({ error: error })
        });


    // // Go over the profile IDs
    // var givenarray = carddoc['given'];

    // function createProfiles() {
    //     for (var giveprofiles of givenarray) {
    //         console.log(giveprofiles);
    //     };
    // }

})

app.use('/static', express.static('../public'))
module.exports = {
    god,
}