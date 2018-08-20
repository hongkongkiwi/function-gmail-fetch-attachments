"use strict"

require('dotenv').config()

;(async () => {
  try {
    const GoogleGmail = require('../index')
    const gmail = new GoogleGmail()
    console.log('Load Credentials')
    const creds = await config.loadCredentials(process.env.GOOGLE_CLOUD_CREDENTIALS)

    console.log('List Labels')
    const listLabels = await gmail.listLabels()
    console.log(listLabels)

    console.log('List Messages')
    const messageIds = await gmail.listMessages()
    console.log(messageIds)

    if (messageIds.length == 0) return;

    console.log('Get Message')
    const message = await gmail.getMessage(messageIds[0])
    console.log(message)

    console.log('Get All Message Attachments')
    const attachments = await gmail.getAllMessageAttachments(message)
    console.log(attachments)

  } catch (e) {
    // Deal with the fact the chain failed
    console.error(e)
    throw e
  }
})()
