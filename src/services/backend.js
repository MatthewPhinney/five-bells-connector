'use strict'

const config = require('./config')
const Backend = require('../backends/' + config.get('backend'))
const infoCache = require('./info-cache')

if (!Backend) {
  throw new Error('Backend not found. The backend ' +
    'module specified by CONNECTOR_BACKEND was not found in /backends')
}

module.exports = new Backend({
  currencyWithLedgerPairs: config.get('tradingPairs'),
  backendUri: config.get('backendUri'),
  spread: config.get('fxSpread'),
  infoCache: infoCache
})
