const functions = require('firebase-functions');
const express = require("express")
const Twig = require("twig")
const admin = require("firebase-admin")
admin.initializeApp(functions.config().firebase);

var db = admin.firestore();

const app = express()
var api1 = functions.https.onRequest(app)
/* Express */

app.use(express.static('files'))

app.set("twig options", {
  strict_variables: false
})

app.get('/users', function(req, res){
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

app.use('/static', express.static('../public'))
module.exports = {
  api1,
}
