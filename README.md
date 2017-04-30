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
  - Login
  - View Page
  - Add Card
  - Add Text
  - Add Image
  - See Text Change in View
  - See Change in Card on Deck
  - Delete Card

* The deck is then shared as Anon and viewed in an Icognito browser.

* If it passes all this it then get's deployed and the coder is informed on Slack. If not then errors are passed back to the coder on Slack and the pull request is refused.

