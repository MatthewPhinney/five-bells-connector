'use strict'

const _ = require('lodash')
const nock = require('nock')
nock.enableNetConnect(['localhost'])
const ratesResponse = require('./data/fxRates.json')
const appHelper = require('./helpers/app')
const logger = require('five-bells-connector')._test.logger
const logHelper = require('./helpers/log')
const wsHelper = require('./helpers/ws')
const subscriptions = require('../src/models/subscriptions')
const sinon = require('sinon')

const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

const env = _.cloneDeep(process.env)

describe('Subscriptions', function () {
  logHelper(logger)

  beforeEach(function * () {
    appHelper.create(this)
    yield this.backend.connect(ratesResponse)
    yield this.routeBroadcaster.reloadLocalRoutes()

    nock('http://usd-ledger.example').get('/')
      .reply(200, {
        precision: 10,
        scale: 4
      })

    nock('http://eur-ledger.example').get('/')
      .reply(200, {
        precision: 10,
        scale: 4
      })

    nock('http://usd-ledger.example').get('/accounts/mark')
      .reply(200, {
        ledger: 'http://usd-ledger.example',
        name: 'mark',
        connector: 'http://localhost'
      })

    nock('http://eur-ledger.example').get('/accounts/mark')
      .reply(200, {
        ledger: 'http://eur-ledger.example',
        name: 'mark',
        connector: 'http://localhost'
      })

    nock('http://cad-ledger.example:1000').get('/accounts/mark')
      .reply(200, {
        ledger: 'http://cad-ledger.example:1000',
        name: 'mark',
        connector: 'http://localhost'
      })

    nock('http://cny-ledger.example').get('/accounts/mark')
      .reply(200, {
        ledger: 'http://cny-ledger.example',
        name: 'mark',
        connector: 'http://localhost'
      })

    this.setTimeout = setTimeout
    this.clock = sinon.useFakeTimers(START_DATE)

    this.wsCadLedger = new wsHelper.Server('ws://cad-ledger.example:1000/accounts/mark/transfers')
    this.wsUsdLedger = new wsHelper.Server('ws://usd-ledger.example/accounts/mark/transfers')
    this.wsEurLedger = new wsHelper.Server('ws://eur-ledger.example/accounts/mark/transfers')
    this.wsEurLedger.on('connection', () => null)
    this.wsCnyLedger = new wsHelper.Server('ws://cny-ledger.example/accounts/mark/transfers')
    yield subscriptions.subscribePairs(require('./data/tradingPairs.json'),
      this.core, this.config, this.routeBuilder)

    this.transferUsdPrepared = _.cloneDeep(require('./data/transferUsdPrepared.json'))
    this.transferEurProposed = _.cloneDeep(require('./data/transferEurProposed.json'))
    this.notificationSourceTransferPrepared =
      _.cloneDeep(require('./data/notificationSourceTransferPrepared.json'))
    this.notificationWithConditionFulfillment =
      _.cloneDeep(require('./data/notificationWithConditionFulfillment.json'))
  })

  afterEach(function * () {
    nock.cleanAll()
    this.clock.restore()
    process.env = _.cloneDeep(env)
  })

  it('should initiate and complete a universal mode payment', function * () {
    const sourceTransfer = this.transferUsdPrepared
    const destinationTransfer = this.transferEurProposed

    const sendSpy = sinon.spy(
      this.core.getPlugin(destinationTransfer.ledger),
      'send')

    const fulfillSpy = sinon.spy(
      this.core.getPlugin(sourceTransfer.ledger),
      'fulfillCondition')

    yield this.core.getPlugin(sourceTransfer.ledger)
      .emitAsync('receive', {
        id: sourceTransfer.id,
        direction: 'incoming',
        ledger: sourceTransfer.ledger,
        account: sourceTransfer.debits[0].account,
        amount: sourceTransfer.debits[0].amount,
        executionCondition: sourceTransfer.debits[0].execution_condition,
        expiresAt: sourceTransfer.debits[0].expires_at,
        data: {
          ilp_header: {
            amount: destinationTransfer.credits[0].amount,
            account: destinationTransfer.credits[0].account
          }
        }
      })

    sinon.assert.calledOnce(sendSpy)

    const sourceId = sourceTransfer.id.substring(sourceTransfer.id.length - 36)
    yield this.core.getPlugin(sourceTransfer.ledger)
      .emitAsync('fulfill_execution_condition', {
        id: destinationTransfer.id,
        direction: 'outgoing',
        ledger: destinationTransfer.ledger,
        account: destinationTransfer.debits[0].account,
        amount: destinationTransfer.debits[0].amount,
        executionCondition: destinationTransfer.debits[0].execution_condition,
        noteToSelf: {
          source_transfer_ledger: sourceTransfer.ledger,
          source_transfer_id: sourceId
        }
      }, 'cf:0:')

    sinon.assert.calledOnce(fulfillSpy)
    sinon.assert.calledWith(fulfillSpy, sourceId, 'cf:0:')
  })
})
