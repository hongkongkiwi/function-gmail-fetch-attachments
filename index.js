'use strict'

//http://localhost:8010/squashed-melon/asia-northeast1/gmail-fetch-attachments/check?email=hkdrivesync%40sphero.com&label=jetta-production-daily-bolt

const path = require('path')
const {OAuth2Client} = require('google-auth-library')
const {has,isNull,isUndefined,isArray,isObject} = require('lodash')
const fs = require('mz/fs')
//const {Buffer} = require('safe-buffer')
//const path = require('path')
//const os = require('os')

// Lazy load global variables
let bucket
let token
let keys
let oAuth2Client
let gmail
let tmp
let url
let querystring
let Storage
let GoogleGmail

/** Used when running on simulator **/
const yamlFile = path.join(__dirname, '.env.yaml')

if (fs.existsSync(yamlFile)) {
  const yaml = require('js-yaml')
  try {
    const config = yaml.safeLoad(fs.readFileSync(yamlFile, 'utf8'))
    for (let varName in config) {
      process.env[varName] = config[varName]
    }
  } catch (e) {
    console.error(e)
    process.exit(1)
  }
  process.env.HTTP_TRIGGER_ENDPOINT = 'http://localhost:8010/squashed-melon/asia-northeast1/' + process.env.FUNCTION_NAME
}

// Variables
const redirectCheckPath = "/check"
const projectId = process.env.GCP_PROJECT
const bucketName = process.env.OAUTH2_STORAGE_BUCKET
const credsOauthClient = process.env.CREDENTIALS_OAUTH_CLIENT ? path.join(__dirname, process.env.CREDENTIALS_OAUTH_CLIENT.split('/').join(path.sep)) : null
const credsStorageService = process.env.CREDENTIALS_STORAGE_SERVICE ? path.join(__dirname, process.env.CREDENTIALS_STORAGE_SERVICE.split('/').join(path.sep)) : null
const encryptionKey = process.env.OAUTH2_ENCRYPTION_KEY ? Buffer.from(process.env.OAUTH2_ENCRYPTION_KEY, 'base64') : null

if (isNull(bucketName) ||
    isNull(credsOauthClient) ||
    isNull(credsStorageService)) {
      throw new Error("Environment Variables not available!")
    }

const verifyAndExtractToken = async (id_token) => {
  const ticket = await oAuth2Client.verifyIdToken({
      idToken: id_token,
      audience: keys.installed.client_id,  // Specify the CLIENT_ID of the app that accesses the backend
  })
  return ticket.getPayload()
  // console.log(payload)
  // const userid = payload.sub
  // const domain = payload.hd
}

const debugLog = (msg) => {
  console.log(msg)
}

const createTempFile = async () => {
  tmp = tmp || require('tmp-promise')
  return await tmp.tmpName()
}

const getTokenFile = async (srcFile, encKey) => {
  const tempFile = await createTempFile()
  const file = bucket.file(srcFile)
  const checkFileExists = _=>{
    return file.exists().then((data)=>{ return data[0] })
  }
  if (!await checkFileExists()) {
    debugLog('Token does not exist!')
    return null
  }
  let options = {
    destination: tempFile
  }
  if (encKey) options.encryptionKey = encKey
  debugLog('File Exists trying to download')
  await file.download(options)
  debugLog(`File ${srcFile} downloaded to ${tempFile}.`);
  return tempFile
}

const getToken = async (email) => {
  const storageTokenFile = 'tokens/' + email + '.json'
  debugLog("Attempting to get token: " + storageTokenFile)
  const tempTokenFile = await getTokenFile(storageTokenFile, encryptionKey)
  if (isNull(tempTokenFile)) {
    debugLog("No Token file available from Cloud Storage")
    return null
  }
  debugLog("Got Token File from Cloud Storage")
  const tokenFileContents = await fs.readFile(tempTokenFile)
  const newToken = JSON.parse(tokenFileContents)
  await fs.unlink(tempTokenFile)
  return newToken
}

const storeToken = async (srcFilename, dstFilename, encKey) => {
  let options = {
    destination: dstFilename
  }
  if (encKey) options.encryptionKey = encKey
  await bucket.upload(srcFilename, options)
  debugLog(`File ${srcFilename} uploaded to gs://${bucketName}/${dstFilename}.`)
}

const getKeys = async () => {
  const keysFileContents = await fs.readFile(credsOauthClient)
  const keys = JSON.parse(keysFileContents)
  if (!has(keys, 'installed') ||
      !has(keys.installed, 'client_id') ||
      !has(keys.installed, 'client_secret') ||
      !has(keys.installed, 'redirect_uris') ||
      !isArray(keys.installed.redirect_uris) ||
      keys.installed.redirect_uris.length === 0) {
        throw new Error('Invalid keys file!')
      }
  return keys
}

const handleGet = async (req, res) => {
  querystring = querystring || require('querystring')
  url = url || require('url')
  const urlPath = url.parse(req.url).path.split('?')[0]

  if (urlPath === '/' || (urlPath !== redirectCheckPath)) {
    debugLog('Invalid path passed: ' + urlPath)
    return handleError('Invalid path passed', res)
  } else {
    const urlQS = querystring.parse(url.parse(req.url).query)
    if (!has(urlQS, 'label') || isNull(urlQS.label)) {
      debugLog('Invalid label passed: ' + JSON.stringify(urlQS))
      return handleError('Invalid label passed', res)
    }
    if (!has(urlQS, 'email') || isNull(urlQS.email)) {
      debugLog('Invalid email passed: ' + JSON.stringify(urlQS))
      return handleError('Invalid email passed', res)
    }
    Storage = Storage || require('@google-cloud/storage')
    bucket = bucket || new Storage({
                            projectId: projectId,
                            keyFilename: credsStorageService
                        }).bucket(bucketName)
    debugLog("Initialized bucket")
    keys = keys || await getKeys()
    debugLog("Initialized keys" + JSON.stringify(keys,null,0))
    oAuth2Client = oAuth2Client || new OAuth2Client(
                                      keys.installed.client_id,
                                      keys.installed.client_secret)
    const email = urlQS.email
    token = token || await getToken(email)
    if (!token) {
      return handleError("No Auth token available", res)
    } else if (isNull(token) || !isObject(token) || !has(token, 'id_token')) {
      return handleError("Invalid Auth Token", res)
    }
    // Handle the refresh event
    oAuth2Client.on('tokens', async (tokens) => {
      if (tokens.refresh_token) {
        token = tokens
        const tempFile = createTempFile()
        await fs.writeFile(tempFile, JSON.stringify(token,null,0), {encoding: 'utf8', flag: 'w'})
        const storageTokenFile = 'tokens/' + email + '.json'
        await storeToken(tempFile, storageTokenFile)
        await fs.unlink(tempFile)
      }
    })
    oAuth2Client.setCredentials(token)
    const details = await verifyAndExtractToken(token.id_token)
    await oAuth2Client.refreshAccessToken()
    const label = urlQS.label
    debugLog('Downloading Messages for label ' + label)
    GoogleGmail = GoogleGmail || require('./gmail')
    gmail = new GoogleGmail({
      authClient: oAuth2Client,
      userId: email
    })
    try {
      const label = await gmail.getLabelWithName('Testing/SPRK+')
      console.log('Label ID:',label.id,'for name "' + label.name + '"')
      const labelIds = [label.id]
      const messageIds = await gmail.listMessages(1, null, labelIds, false)
      console.log('Got Message ID', messageId)
      for (let messageId in messageIds) {
        console.log('Found messageId: ', messageId)
        const message = await gmail.getMessage(messageId.id)
        console.log('Message', message)
        const attachments = await gmail.getAttachmentsFromMessage(message)
        console.log('Message Attachments', attachments)
      }
    } catch(err) {
      console.error(err)
      return handleError('Error trying to get or save token', res)
    }
    handleSuccess('Successfully downloaded messages', res)
  }
}

const handleSuccess = (msg, res) => {
  res.status(200).end(msg)
}

const handleError = (msg, res) => {
  console.error(msg)
  res.status(400).end('An error occured')
}

/*
*  @function http
*  @param {object} request object received from the caller
*  @param {object} response object created in response to the request
*/
exports.http = async (req, res) => {
  switch (req.method) {
    case 'GET':
      handleGet(req, res)
      break
    default:
      handleError(`Invalid Method ${req.method}`, res)
      break
  }
}

/*
*
*  @function eventHelloWorld
*  @param { Object } event read event from configured pubsub topic
*  @param { Function } callback function
*/
// exports.eventHelloWorld = (event, callback) => {
//   callback(`Hello ${event.data.name || 'World'}!`)
// }
