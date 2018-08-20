const isArray = require('lodash.isarray')
const isNumber = require('lodash.isnumber')
const isString = require('lodash.isstring')
const assign = require('lodash.assign')
const gmail = require('googleapis').gmail('v1')

class GoogleGmail() {
  constructor(newOpts) {
    let opts = {
      Promise: Promise,
      userId: "me",
      authClient: null
    }
    assign(this, opts, newOpts)

    if (!this.authClient) {
      return new Error("No Auth Client passed")
    }

    // var RateLimiter = require('limiter').RateLimiter
    // if (!isNull(this.RateLimiter) && !isUndefined(this.RateLimiter)) {
    //   this.limiter = new RateLimiter(1, 250)
    // }
    // var limiter = new RateLimiter(1, 250)
    // var requestsToday = 0 // Gets reset on each "new" day
    // var requestsLimitPerDay = 200
  }

  // async loadCredentials(credentialsFile) {
  //   let credentials
  //   if (isString(credentialsFile)) {
  //     credentials = JSON.parse(await readFileAsync(credentialsFile, 'utf8'))
  //   }
  //   if (isEmpty(credentials) || !isObject(credentials)) {
  //     return Promise.reject("No credentials passed")
  //   }
  //   this.credentials = credentials
  //   this.authClient = new google.auth.JWT(
  //     this.credentials.client_email,
  //     null,
  //     this.credentials.private_key,
  //     this.authScopes
  //   )
  //   return Promise.resolve()
  // }

  /**
   * Lists the labels in the user's account.
   */
  async listLabels() {
    const params = {
      auth: this.authClient,
      userId: this.userId
    }
    return await gmail.users.messages.list(params)
  }

  /**
   * Get Attachments from a given Message.
   *
   * @param  {String} messageId ID of Message with attachments.
   */
  async getAllMessageAttachments(messageId) {
    const parts = messsage.payload.parts;
    let attachments = []
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      if (part.filename && part.filename.length > 0) {
        const attachment = await getMessageAttachment(part.body.attachmentId, messageId)
        attachments.push(attachment)
      }
    }
    return attachments
  }

  async getMessageAttachment(attachmentId, messageId) {
    const params = {
      auth: this.authClient,
      userId: this.userId,
      id: attachmentId,
      messageId: messageId
    }
    return await gmail.users.messages.get(params)
  }

  /**
   * Get Message with given ID.
   *
   * @param  {String} messageId ID of Message to get.
   * @param  {Function} callback Function to call when the request is complete.
   */
  async getMessage(messageId) {
    const params = {
      auth: this.authClient,
      userId: this.userId,
      id: messageId
    }
    return await gmail.users.messages.get(params)
  }

  /**
   * Trash the specified message.
   */
  async trashMessage(messageId) {
    const params = {
      auth: this.authClient,
      userId: this.userId,
      id: messageId
    }
    return await gmail.users.messages.trash(params)
  }

  /**
   * Retrieve Messages in user's mailbox matching query.
   */
  async listMessages(maxResults, query, labelIds, includeSpamTrash) {
    let params = {
      auth: this.authClient,
      userId: this.userId,
      includeSpamTrash: includeSpamTrash || false,
    }
    if (labelIds && isArray(labelIds)) params.labelIds = labelIds
    if (maxResults && isNumber(maxResults) && maxResults >= 0) params.maxResults = maxResults
    if (query && isString(query)) params.query = query
    let messageIds = []
    // Keep getting messages as long as we have a pageToken
    while {
      const response = await gmail.users.messages.list(params)
      params.pageToken = response.nextPageToken
      messageIds.concat(response.messages)
      if (!params.pageToken) break
    }
    return messageIds
  }
}

module.exports = GoogleGmail
