'use strict'
const moment = require('moment')
const _ = require('lodash')
const uuid = require('uuid')
const expect = require('chai').expect
const Promise = require('bluebird')
const debug = require('debug')
const cache = require('../../oada-app-cache')

// Get a token from client.oada-dev.com.
// 1. Use the third input box to enter the URL of the oada server 
//    (see oada-api-server) and click 'Get Access Token' (scopes 
//    currently do not matter and are disabled).
// 2. For testing, use the suggested username "frank" and password
//    "pass" to login and allow access to the given scopes.
// 3. After being redirected back to client.oada-dev.com, paste 
//    the token below.
const token = 'ZJXV5zQX0dAKUYbtCq6XJZnB7NlgfvobnGghrcvW';
const domain = 'localhost:3000';
/*
describe('Testing recursive setup given a data tree', () => {
  it('handles wildcard "*" in the setup data tree', done=> {
    var treeA = {
      rocks: {
        _type: 'application/vnd.oada.rocks.1+json',
        'list-index': {
          '*': { 
            _type: 'application/vnd.oada.rock.1+json',
            'some-prop': false
          }
        },
      },
      blocks: {
        _type: 'application/vnd.oada.blocks.1+json',
        'list-index': {}
      }
    }
    cache.setup(domain, token, treeA, uuid.v4(), 50)
    .then((result) => {
      expect(result.rocks['list-index']['*']).to.equal(undefined)
      var bookmarksUrl = 'https://'+domain+'/bookmarks/rocks/list-index/def/'
      var body = { _id:'def' }
      cache.put(domain, token, bookmarksUrl, body, treeA)
      .then((res) => { 
        cache.setup(domain, token, treeA, uuid.v4(), 50)
        .then((re) => {
          expect(re.rocks['list-index']['def']['some-prop']).to.equal(false)
          return done()
        })
      })
    })
  })

  afterEach(() => {
    return cache.destroyLocalDb()
    .then(() => {
      return cache.delete('https://'+domain+'/bookmarks/rocks/', token)
      .then(() => { 
        return cache.delete('https://'+domain+'/bookmarks/blocks', token)
      })
    })
  })
})
*/
describe('Another recursive setup test...', () => {
  it('handles deep PUTs given wildcard "*" in the setup data tree', done=> {
    var treeB = {
      rocks: {
        _type: 'application/vnd.oada.rocks.1+json',
        'A-index': {
          '*': { 
            _type: 'application/vnd.oada.rocks-A.1+json',
            'B-index': {
              '*': {
                _type: 'application/vnd.oada.rock.1+json',
              }
            }
          },
        },
      },
      blocks: {
        _type: 'application/vnd.oada.blocks.1+json',
        'list-index': {}
      }
    }
    cache.setup(domain, token, treeB, uuid.v4(), 50)
    .then((result) => {
      var bookmarksUrl = 'https://'+domain+'/bookmarks/rocks/A-index/def/B-index/abc/'
      var body = {_id:'abc', 'some-prop':false}
      cache.put(domain, token, bookmarksUrl, body, treeB)
      .then(() => {
        console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~')
        return Promise.all([
          cache.get('https://'+domain+'/bookmarks/rocks/A-index/def/', token).then((res) => {
            console.log('def 1111', res)
            expect(res._id).to.exist
            expect(res._rev).to.exist
          }),
          cache.get('https://'+domain+'/bookmarks/rocks/A-index/def/B-index/', token).then((res) => {
            console.log('B-index 3333', res)
            expect(res._id).to.not.exist
          }),
          cache.get('https://'+domain+'/bookmarks/rocks/A-index/def/B-index/abc/', token).then((res) => {
            console.log('abc 4444', res)
            expect(res._id).to.exist
            expect(res._rev).to.exist
            expect(res['some-prop']).to.equal(false)
          }),
        ]).then(() => {
          return done()
        })
      }).catch((err) => {console.log(err);return err})
    })
  })

  afterEach(() => {
    return cache.destroyLocalDb()
//    .then(() => {
//      return cache.delete('https://'+domain+'/bookmarks/rocks/', token)
//      .then(() => { 
//        return cache.delete('https://'+domain+'/bookmarks/blocks', token)
//      })
//    })
  })
})
