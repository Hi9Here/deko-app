# Deko-App
## This is the Home Page of deko

### Issue by Issue
Issues are created on deko-app. When the testing below is done successfully we version to V1. We do not move on till we get to the stage below.

### Testing Protocol

Due to the nature of Polymer and Firebase it is extreamly difficult to do end to end testing. In this in mind I suggest this flow.

* Code Locally
* Create Fork
* Change Code
* Quick Check to see it works locally
* Put Pull Request In
* woisme pulls in the pull request and tests locally

#### Test 1
  - Login
  - View Deck
  - Navigate Decks
  - Add Card Title and Description
  - Add Image
  - Card Appears in Deck View
  - Title and Description in Card View
  - Edit Image
  - Image has changed in Card View before returning from Deck View
  - Image has changed in Deck View
  - Edit Title and Description
  - Title and Description has changed in Card View before returning from Deck View
  - Title and Descrioption changed in Deck View
  - Edit Quill
  - Text Changed in View
  - Text Stays Changed Returning from Deck View
  - Delete Card

#### Test 2
  - Open an Anon Link from another Account



* If it passes all this it then get's deployed and the coder is informed on Slack. If not then errors are passed back to the coder on Slack and the pull request is refused.

