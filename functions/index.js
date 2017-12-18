'use strict'
const functions = require('firebase-functions')
const express = require("express")
const Twig = require("twig")
var lunr = require("lunr")

const admin = require("firebase-admin")

// Modules that get used in image resizing
const gcs = require('@google-cloud/storage')()

const language = require('@google-cloud/language')

const spawn = require('child-process-promise').spawn
const path = require('path')
const os = require('os')
const fs = require('fs')

// vision Modules
const vision = require('node-cloud-vision-api')

// Initialize the db
admin.initializeApp(functions.config().firebase)
const db = admin.firestore()

const dbFiles = admin.database()

// [START generateThumbnail]
/**
 * When an image is uploaded in the Storage bucket We generate a thumbnail automatically using
 * ImageMagick.
 */
const generateThumbnail = functions.storage.object().onChange(event => {
  const object = event.data; // The Storage object.

  const fileBucket = object.bucket // The Storage bucket that contains the file.
  const filePath = object.name; // File path in the bucket.
  const contentType = object.contentType; // File content type.
  const resourceState = object.resourceState; // The resourceState is 'exists' or 'not_exists' (for file/folder deletions).
  const metageneration = object.metageneration; // Number of times metadata has been generated. New objects have a value of 1.

  // Exit if this is triggered on a file that is not an image.
  if (!contentType.startsWith('image/')) {
    console.log('This is not an image.')
    return
  }

  // Get the file name.
  const fileName = path.basename(filePath);
  // Exit if the image is already a thumbnail.
  if (fileName.startsWith('thumb_')) {
    console.log('Already a Thumbnail.')
    return 1
  }

  // Exit if this is a move or deletion event.
  if (resourceState === 'not_exists') {
    console.log('This is a deletion event.')
    return 2
  }

  // Exit if file exists but is not new and is only being triggered
  // because of a metadata change.
  if (resourceState === 'exists' && metageneration > 1) {
    console.log('This is a metadata change event.')
    return 3
  }

  // [START thumbnailGeneration]
  // Download file from bucket.
  const bucket = gcs.bucket(fileBucket)
  const tempFilePath = path.join(os.tmpdir(), fileName)
  return bucket.file(filePath).download({
    destination: tempFilePath
  }).then(() => {
    console.log('Image downloaded locally to', tempFilePath)
    // Generate a thumbnail using ImageMagick.
    return spawn('convert', [tempFilePath, '-thumbnail', '500x500>', tempFilePath])
  }).then(() => {
    console.log('Thumbnail created at', tempFilePath)
    // We add a 'thumb_' prefix to thumbnails file name. That's where we'll upload the thumbnail.
    const thumbFileName = `thumb_${fileName}`
    const thumbFilePath = path.join(path.dirname(filePath), thumbFileName)
    const uid = filePath.split("/")[0]
    const hash = filePath.split("/")[1]
    var theHash = {}
    theHash[hash] = true
    db.collection("Users").doc(uid).set({files: theHash}, {merge: true})
    db.collection("files").doc(hash).get().then(doc => {
      if (!doc.exists || (doc && doc.data() && !doc.data().vision)) {
        vision.init({auth: 'AIzaSyCKbNZem3UKzkWy8NST2Al7gKWpAXFduWU'})

        // construct parameters
        const reqV = new vision.Request({
          image: new vision.Image(tempFilePath),
          features: [
            new vision.Feature('FACE_DETECTION', 4),
            new vision.Feature('LABEL_DETECTION', 10),
            new vision.Feature('IMAGE_PROPERTIES', 10),
          ]
        })
        // send single request
        vision.annotate(reqV).then((resV) => {
          // handling response
          console.log(JSON.stringify(resV.responses))
          db.collection("files").doc(hash).set({vision: resV.responses}, {merge: true})
          theHash[uid] = 1
          db.collection("Users").doc(uid).set({files: theHash}, {merge: true})

        }, (e) => {
          console.log('Error: ', e)
        })
      } else {
        console.log('got it!', doc.data().vision)
      }

    }).then(() => {
      // Uploading the thumbnail.
      return bucket.upload(tempFilePath, { destination: thumbFilePath })
      
    }).then(() => {
      console.log("Make a new lunr index")
      var images = {}
      var loadImage = function (doc) {
        var words = []
        var synonyms = []
        if (doc.data().vision && doc.data().vision[0].labelAnnotations) {
          words = doc.data().vision[0].labelAnnotations.map(function(label) {
            return label.description
          })
        }
        if (doc.data().synonyms) {
          synonyms = Object.keys(doc.data().synonyms)
        }
        if (words.length || synonyms.length) {
          images[doc.data().path] = {
            words:words.join(" "),
            synonyms:synonyms.join(" "),
            path:doc.data().path,
          }
        }
      }
      return Promise.all([db.collection("files").where('type', '==', 'image/jpeg').get(),db.collection("files").where('type', '==', 'image/png').get()]).then(snapshot => {
        console.log("jpeg and png", snapshot)
        snapshot[0].forEach(loadImage)
        snapshot[1].forEach(loadImage)
      }).then(function(){
        console.log("list of images",images)
        return 1
      }).then(function(){
        console.log("creating index")
        var idx = lunr(function () {
          this.ref('path')
          this.field('synonyms', { boost: 10 })
          this.field('words')
          var that = this
          for (const prop in images) {
            that.add(images[prop])
          }
        })
      
        console.log("the index",JSON.stringify(idx))
        
        return db.collection("lunr_index").doc("images").set({idx:JSON.stringify(idx)})
      }).catch((e) => {
        console.log(e)
      })
    }).catch((e) => {
      console.log(e)
    })
    
  }).then(() => {
    console.log("deleted temporary file")
    fs.unlinkSync(tempFilePath)
    return 1
  }).catch((e) => console.log(e))
  // [END thumbnailGeneration]
})
// [END generateThumbnail]

const app = express()

const languageService = functions.firestore.document('Profiles/{pid}').onWrite(event => {
  console.log(event.data.data(), event.params)
  const text = 'Hello, world!'

  const document = {
    content: text,
    type: 'PLAIN_TEXT',
  }

  // Detects the sentiment of the text
  client.analyzeSentiment({document: document}).then(results => {
    const sentiment = results[0].documentSentiment
 
    console.log(`Text: ${text}`)
    console.log(`Sentiment score: ${sentiment.score}`)
    console.log(`Sentiment magnitude: ${sentiment.magnitude}`)
  }).catch(err => {
    console.error('ERROR:', err)
  });
})
const imageService = functions.firestore.document('Profiles/{pid}/cards/{cardId}').onWrite(event => {
  console.log(event.data.data())  
  var newCard = event.data.data()
  if (!newCard.image && newCard.title) {
    //get Images idx
    db.collection("lunr_index").doc("images").get().then((doc) => {
      var idx = JSON.parse(doc.data().idx)                                                
      var find = idx.search(newCard.title)
      if (find.length) { 
        var path = find[0].ref.path.split("/")[0] + "/" + find[0].ref.path.split("/")[1] + "/" + "thumb_" + find[0].ref.path.split("/")[2]
      } else {
        var path = "" // images[Math.floor(Math.random() * images.length)].path
      }
      console.log(path)
      
      if (path && newCard.image === '' && !newCard.autoImage) {
        event.data.ref.set({autoImage:path}, {merge: true})
      }
      return 1
    }).catch(e => {
      console.log(e)
    })
  }
  return 1
  // get title
  // get find image matching title
})

// Name of function that fires everytime a URL is passed to it. 
// That way it keeps hot and will run faster
var god = functions.https.onRequest(app)

app.use(express.static('files'))

// This is so we might use templating server side
app.set("twig options", {
  strict_variables: false
})

// USER FUNCTION
// get the list of users and render them. Add users at the end of the god function
app.get('/users', function(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  
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
app.get('/profiles', function(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  
  db.collection('Profiles').get().then(snapshot => {
    var profiles = []
    snapshot.forEach(doc => {
      profiles.push( {name:doc.data().displayName,id:doc.id} )
    })
    res.json(profiles)
  }).catch(e => {
    console.log(e)
  })
})
  // END OF USER FUNCTION
app.get("/pik/deko/Welcome,%F0%9F%98%8E%20tap%20here%20and%20I'll%20give%20you%20a%20card", function(req, res) {
  res.setHeader('Content-Type', 'application/json')
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  
  //Profiles/5dlcFyFDFMzhXFev4Inl/cards/Jvo3gk13xiZz9aAajYCw
  db.collection('Profiles').doc("5dlcFyFDFMzhXFev4Inl").collection('cards').doc("Jvo3gk13xiZz9aAajYCw").get().then(card => {
    console.log('Welcome =>', card.data())
    var addCard = card.data()
    card.ref.collection('quill').orderBy("time", "desc").limit(1).get().then(function(data) {
      if (data && data.size) {
        addCard.quill = data.docs[0].data().value
        res.json({add: addCard})
      }
    })
  }).catch(e => {
    console.log(e)
  })
})

// DELETE COLLECTION FUNCTION
// Collection's Documents cannot be deleted from Datastore
// If you delete a Collection the Documents remain
// So by batches the Documents of a Collections are iterated through and deleted
function deleteCollection(dbs, collectionPath, batchSize) {
  var collectionRef = dbs.collection(collectionPath);
  var query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(dbs, query, batchSize, resolve, reject);
  })
}

function deleteQueryBatch(dbs, query, batchSize, resolve, reject) {
  query.get()
    .then((snapshot) => {
      // When there are no documents left, we are done
      if (snapshot.size == 0) {
        return 0
      }

      // Delete documents in a batch
      var batch = dbs.batch()
      snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref)
      })

      return batch.commit().then(() => {
        return snapshot.size
      })
    }).then((numDeleted) => {
      if (numDeleted === 0) {
        resolve()
        return
      }

      // Recurse on the next process tick, to avoid
      // exploding the stack.
      process.nextTick(() => {
        deleteQueryBatch(dbs, query, batchSize, resolve, reject);
      })
    })
    .catch(reject);
}
// END OF DELETE COLLECTION FUNCTION

// GIVE FUNCTION
// The User gives a card. If it is a Pack card, meaning Pak=0 you give out 1 to each User
// you give it to. If it is Pak=1 then you can only give it away once to one User
// then of course it deletes on your path and you no longer can see it
// You send a URL to the function ie https://us-central1-deko-app-one.cloudfunctions.net/god/card/profileid/cardid
// That then fires that card under that profile to be given
app.get('/card/:profileid/:cardid', function(req, res) {
  // This is so you can render JSON back
  res.setHeader('Content-Type', 'application/json');
  // Get ProfileID from the URL
  const profileID = req.params.profileid
  console.log('profile id var is ', profileID)
  // Get CardID from the URL
  const cardID = req.params.cardid
  console.log('card id var is ', cardID)

  // This is the reference to the card with the ids you got from the URL
  const cardRef = db.collection('Profiles').doc(profileID).collection('cards').doc(cardID)

  // Get the Card Object from the reference
  cardRef.get()
    .then(card => {
      if (card.exists) {
        // cardStuff is equal to the data inside the Card collection
        var cardStuff = card.data()
          // givenArray is array of Profiles that have been chosen for the card to be given to
        const givenArray = cardStuff.given

        // every card can be given at least once. This prepopulates the object with default values
        let givenCard = {
            pak: 1,
          }
          // Go through the profiles in given array that the card will be given too
        Object.keys(cardStuff).forEach(key => {
            // Don't pass in given profiles and pak values to the new card data. 
            if (key !== "given" && key !== "pak") {
              givenCard[key] = cardStuff[key]
            }
          })
          // there are no fromProfile values as it has not been given before. Create a fromProfle object
          // ready for key values of Profiles : Timestamp
        if (!givenCard.fromProfile) {
          givenCard.fromProfile = {}
        }
        // add the profile the card is being given from to an Object listing the Profiles that the card
        // has been given from. Listed in time and date order
        givenCard.fromProfile[profileID] = Date.now()

        // there are profiles in the given array 
        if (givenArray) {
          // go through each profile in the given array
          givenArray.forEach(givenToProfileID => {
            // goto each card and allocate that to ref
            db.collection('Profiles').doc(givenToProfileID).collection('cards').add(givenCard).then(ref => {
              // find each trik under the card collection 
              Object.keys(cardStuff.triks).forEach(trik => {
                cardRef.collection(trik).orderBy("time", "desc").limit(1).get().then(cardTrikRef => {
                  // Make sure that there are triks there
                  if (cardTrikRef.docs.length) {
                    console.log('data is, ', cardTrikRef)
                      // goto most recent trik in each trik
                    ref.collection(trik).add(cardTrikRef.docs[0].data())
                  }
                }).then(function() {
                  // if the card can only be given once
                  if (cardStuff.pak === 1) {
                    // then delete all documents under the card collection and then the card
                    // using the DELETE COLLECTION FUNCTION 
                    // with the parameter specified
                    // remember not to use db to reference the path to the collection to delete
                    deleteCollection(cardRef, trik, 10)
                  }
                }).catch(e => {
                  console.log(e)
                })
              })
            }).then(function() {
              // then delete the card
              if (cardStuff.pak === 1) {
                cardRef.delete()
              }
            }).catch()
          })
        }
        console.log("Card Data:", cardStuff, 'and givenarray is', givenArray)
      } else {
        console.log("No such Card!")
      }
      // Fire back JSON so that the client knows that it has worked
      res.json({ success: true })
    }).catch(function(error) {
      console.log("Error getting Card:", error);
      // five back JSON to say there was an error
      res.json({ error: error })
    })

})

 app.use('/static', express.static('../public'))
 module.exports = {god, generateThumbnail, languageService, imageService}
