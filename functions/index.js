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
const dialogflow = require('dialogflow')
const sessionClient = new dialogflow.SessionsClient()

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
 
  console.log(filePath, contentType)
  
  // Exit if this is triggered on a file that is not an image.
  if (contentType && !contentType.startsWith('image/')) {
    console.log('This is not an image.')
 //   return 1
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
  // Get the file name.
  const fileName = path.basename(filePath);
  // Exit if the image is already a thumbnail.
  if (fileName.startsWith('thumb_')) {
    console.log(fileName)
    console.log('Already a Thumbnail.')
    
    if (fileName.startsWith('thumb_500')) {
      return "Make Luna index on the 200 size and now not to the 500"
    }
    
    console.log("Make a new lunr index")
    var images = {}
    var loadImage = function (doc) {
      const data = doc.data()
      var words = []
      var synonyms = []
      if (data.vision && data.vision[0].labelAnnotations) {
        words = data.vision[0].labelAnnotations.map(function(label) {
          return label.description
        })
      }
      if (data.synonyms) {
        synonyms = Object.keys(data.synonyms)
        console.log("adding synonyms ", synonyms)
      }
      const profileIds = Object.keys(data).filter(key => {
        return data[key] === "profileId"
      })
      
      profileIds.forEach(profileId => {
        console.log("adding Image ", data.path)
        if (!images[profileId]) {
          images[profileId] = {}
        }
        images[profileId][data.path] = {
          words:words.join(" "),
          synonyms:synonyms.join(" "),
          path:data.path+"",
          name:path.basename(data.path).replace("thumb_500_", " ").replace("-"," ").replace("_"," ").replace(".", " "),
        }
      })
    }
    return Promise.all([db.collection("files").where('type', '==', 'image/jpeg').get(),db.collection("files").where('type', '==', 'image/png').get()]).then(snapshot => {
      console.log("jpeg and png")
      snapshot[0].forEach(loadImage)
      return snapshot[1].forEach(loadImage)
    }).then(function(){
      console.log("list of images",images)
      return 1
    }).then(function(){
      console.log("creating indexs")
      Object.keys(images).forEach(profileId => {
        console.log("creating index for ", profileId)
        const idx = lunr(function () {
          this.ref('path')
          this.field('name')
          this.field('synonyms')
          this.field('words')
          var that = this
          for (const prop in images[profileId]) {
            that.add(images[profileId][prop])
          }
        })
      
        console.log("the index for", profileId, "is", JSON.stringify(idx))
        
        return db.collection("Profiles").doc(profileId).collection("lunr_index").doc("images").set({idx:JSON.stringify(idx)}).then(function(){
          return console.log("upload index for ", profileId)
        }).catch((e) => {
          return console.log(e)
        })
      })
    }).then(() => {
      return console.log("Job Done!!")
    }).catch((e) => {
      return console.log(e)
    })
  }

  // [START thumbnailGeneration]
  // Download file from bucket.
  const bucket = gcs.bucket(fileBucket)
  const tempFilePath500 = path.join(os.tmpdir(), fileName) + "_500"
  const tempFilePath200 = path.join(os.tmpdir(), fileName) + "_200"
  const tempFilePath = path.join(os.tmpdir(), fileName)
  
  return bucket.file(filePath).download({
    destination: tempFilePath
  }).then(() => {
    console.log('Image downloaded locally to', tempFilePath)
    
    // Generate a thumbnail using ImageMagick.
    return spawn('convert', [tempFilePath, '-thumbnail', '500x500>', tempFilePath500])
  }).then(() => {
    console.log('Thumbnail created at', tempFilePath500)
    // Generate a thumbnail using ImageMagick.
    return spawn('convert', [tempFilePath, '-thumbnail', '200x200>', tempFilePath200])
  }).then(() => {
    console.log('Thumbnail created at', tempFilePath200)
    
    // We add a 'thumb_' prefix to thumbnails file name. That's where we'll upload the thumbnail.
    
    const thumbFileName500 = `thumb_500_${fileName}`
    const thumbFileName200 = `thumb_200_${fileName}`
    
    const thumbFilePath500 = path.join(path.dirname(filePath), thumbFileName500)
    const thumbFilePath200 = path.join(path.dirname(filePath), thumbFileName200)
    
    const uid = filePath.split("/")[0]
    const hash = filePath.split("/")[1]
    var theHash = {}
    theHash[hash] = true
    return Promise.all([db.collection("Users").doc(uid).set({files: theHash}, {merge: true}), db.collection("files").doc(hash).get().then(doc => {
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

    })]).then(() => { // Promise All
      // Uploading the thumbnail.
      console.log('Thumbnail Uploading to', thumbFilePath500)
      return bucket.upload(tempFilePath500, { destination: thumbFilePath500 })
    }).then(() => {
      console.log('Thumbnail Uploaded', thumbFilePath500)
      console.log('Thumbnail Uploading to', thumbFilePath200)
      return bucket.upload(tempFilePath200, { destination: thumbFilePath200 })
    }).then(() => {
      console.log('Thumbnail Uploaded', thumbFilePath200)
      return 4
    }).catch((e) => {
      return console.log(e)
    })
    
  }).then(() => {
    console.log("deleted temporary file")
    fs.unlinkSync(tempFilePath)
    fs.unlinkSync(tempFilePath200)
    fs.unlinkSync(tempFilePath500)
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
const giveService = functions.firestore.document('Profiles/{pid}/cards/{cardId}').onWrite(event => {
  console.log("Started")
   
      var cardStuff = event.data.data()
      // there are profiles in the given array 
      if (cardStuff.given) {
        var givenArray = Object.keys(cardStuff.given)
        if (givenArray.length) {
          var cardRef = event.data.ref
          var givenCard = {
            pak: 1,
          }
          // Go through the profiles in given array that the card will be given too
          Object.keys(cardStuff).forEach(key => {
           // Don't pass in given profiles and pak values to the new card data. 
            if (key !== "given" && key !== "pak") {
              givenCard[key] = cardStuff[key]
            }
          })
          
          
          if (!cardStuff.pak) {
            cardStuff.pak = 1
          }
      
          if (!cardStuff.triks) {
            cardStuff.triks = {}
            cardStuff.triks.quill = true
          }
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
                  } else {
                    cardRef.set({pak: cardStuff.pak-1}, {merge:true})
                  }
                }).catch(e => {
                  console.log(e)
                })
              })
            }).then(function() {
              // then delete the card
              if (cardStuff.pak === 1) {
                cardRef.delete()
                console.log("Card Delete")
              }
            }).catch()
          })
        }  
      } else {
        return 0
      }
      console.log("Card Data:", cardStuff)
})

// Name of function that fires everytime a URL is passed to it. 
// That way it keeps hot and will run faster
var god = functions.https.onRequest(app)

app.use(express.static('files'))

// This is so we might use templating server side
app.set("twig options", {
  strict_variables: false
})


app.get('/detect/:msg/:sig', function(req, res) {
  console.log(req.params)
  res.setHeader('Content-Type', 'application/json')
  res.header("Access-Control-Allow-Origin", "*")
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept")
  const projectId = 'deko-app-one'
  const sessionId = req.params.sig.replace(/[0-9+/\=]/g, '')
  const sessionPath = sessionClient.sessionPath(projectId, sessionId)
  const query = req.params.msg
  const languageCode = 'en-GB'
  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: query,
        languageCode: languageCode,
      },
    },
  }
  console.log(request)
  sessionClient.detectIntent(request).then(responses => {
    console.log('Detected intent');
    const result = responses[0].queryResult;
    console.log(`  Query: ${result.queryText}`);
    console.log(`  Response: ${result.fulfillmentText}`);

    if (result.intent) {
      res.json(result.fulfillmentText)
      console.log(`  Intent: ${result.intent.displayName}`);
    } else {
      res.json(false)
      console.log(`  No intent matched.`);
    }
  })
  .catch(err => {
    console.error('ERROR:', err);
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

function deleteCollection(dbs, collectionPath, batchSize) {
  var collectionRef = dbs.collection(collectionPath);
  var query = collectionRef.orderBy('__name__').limit(batchSize);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(dbs, query, batchSize, resolve, reject);
  })
}
// END OF DELETE COLLECTION FUNCTION

 app.use('/static', express.static('../public'))
 module.exports = {god, generateThumbnail, giveService}
