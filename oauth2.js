const {promisify} = require('util')
const mkdir = promisify(require('fs').mkdir)
const writeFile = promisify(require('fs').writeFile)
const readFile = promisify(require('fs').readFile)
const {join,dirname,basename} = require('path')
const googleAuth = require('google-auth-library')
const openurl = require('openurl2')
const express = require('express')
const getPort = require('get-port')
let app = express()

// These probably do not need to change
const DEFAULT_REDIRECT_PORT = 3000
const REDIRECT_HOST = 'localhost'
const REDIRECT_PATH = '/result'

/**
 * Get and store new token after prompting for user authorization, and then
 * execute the given callback with the authorized OAuth2 client.
 *
 * @param {google.auth.OAuth2} oauth2Client The OAuth2 client to get token for.
 * @param {getEventsCallback} callback The callback to call with the authorized
 *     client.
 */
async function getNewToken(oauth2Client, tokenFile, scopes, callback) {
  const port = await getPort({port: DEFAULT_REDIRECT_PORT})
  const redirectUrl = 'http://' + REDIRECT_HOST + ':' + port + REDIRECT_PATH
  oauth2Client._redirectUri = redirectUrl
  const server = await app.listen(port)
  app.get(REDIRECT_PATH, async (req, res) => {
    if (req.query.error) {
      console.log('FAILED! Got Error',req.query.error)
      res.send('Failed to get code :-( Please retry!')
      res.end()
      await server.close()
      return callback(new Error('Failed to get token code!'))
    }
    const code = req.query.code
    console.log('SUCCESS! Got Authorization')
    res.send('Successfully Got Code. You can close this page now :-)')
    res.end()
    // Gracefully close the server
    await server.close()
    let token;
    try {
      token = await oauth2Client.getToken(code)
    } catch(err) {
      console.error('Error while trying to retrieve access token', err)
      return callback(err)
    }
    oauth2Client.credentials = token
    await module.exports.storeToken(tokenFile, token)
    callback(null, oauth2Client)
  })

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: scopes
  })
  console.log('Please Accept Access to this app')
  openurl.open(authUrl)
  console.log('Waiting for Authorization...')
}

/**
 * Store token to disk be used in later program executions.
 *
 * @param {Object} token The token to store to disk.
 */
async function storeToken(tokenFile, token, callback) {
  try {
    await mkdir(dirname(tokenFile))
  } catch (err) {
    if (err.code != 'EEXIST') {
      return callback(err)
    }
  }
  try {
    await writeFile(tokenFile, JSON.stringify(token), {})
    console.log('Token stored to ' + tokenFile)
    callback(null, token)
  } catch(err) {
    return callback(err)
  }
}



/**
 * Create an OAuth2 client with the given credentials, and then execute the
 * given callback function.
 *
 * @param {Object} credentials The authorization client credentials.
 * @param {function} callback The callback to call with the authorized client.
 */
async function authorize(clientSecret, clientId, tokenFile, scopes, callback) {
  const auth = new googleAuth()
  let oauth2Client = new auth.OAuth2(clientId, clientSecret)
  let storedCreds
  try {
    oauth2Client.getAccessToken = promisify(oauth2Client.getAccessToken)
    oauth2Client.getToken = promisify(oauth2Client.getToken)

    // Check if we have previously stored a token.
    try {
      const token = await readFile(tokenFile, {encoding: 'utf8'})
      console.log('Found stored token!')
      storedCreds = JSON.parse(token)
      oauth2Client.credentials = JSON.parse(token)
      const access_token = await oauth2Client.getAccessToken()
      if (storedCreds.access_token !== access_token) {
        console.log('Token has changed. Saving new token to disk.')
        await module.exports.storeToken(tokenFile, oauth2Client.credentials)
      }
    } catch(err) {
      if (err.code !== 'ENOENT') {
        return callback(err)
      }
      oauth2Client = await module.exports.getNewToken(oauth2Client, tokenFile, scopes)
    }
    callback(null, oauth2Client)
  } catch(err) {
    callback(err)
  }
}

module.exports = {
  storeToken: promisify(storeToken),
  getNewToken: promisify(getNewToken),
  authorize: promisify(authorize)
}
