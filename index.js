import { Promise } from 'bluebird';
import uuid from 'uuid';
import _ from 'lodash';
let agent = require('superagent-promise')(require('superagent'), Promise);
import pointer from 'json-pointer';
import PouchDB from 'pouchdb';
let db_singleton = null;



let simplePut = function(resourcesUrl, bookmarksUrl, resourcesBody, bookmarksBody, token) {
  // PUT the data at /resources
  return agent('PUT', resourcesUrl)
  .set('Authorization', 'Bearer '+ token)
  .send(resourcesBody)
  .end()
  .then((res) => {
// Hacky solution. The server struggles to overwrite lower-level objects and turn
// them into resources, which must be done with recursion.
    return agent('DELETE', bookmarksUrl)
    .set('Authorization', 'Bearer '+ token)
    .end()
    .then((res) => {
      // Now create links in /bookmarks
      return agent('PUT', bookmarksUrl)
      .set('Authorization', 'Bearer '+ token)
      .send(bookmarksBody)
      .end()
      .then((result) => {
        // Return the resources result (not sure which is preferred...)
        return result
      }).catch((err) => {console.log(err);return err})
    }).catch((err) => {console.log(err);return err})
  }).catch((err) => {console.log(err);return err})
}

// This function is capable of performing deep PUTs, and, using the given tree,
// will create the resources as necessary.
// domain: e.g., 'localhost:3000', 'trialstracker.oada-dev.com'
// token: hash token returned by oada-client-id
// pathArray: array of keys used to index into the data and construct the url
let smartPutSetup = function(domain, token, pathArray, body, tree) {
  let subTree = _.cloneDeep(tree);
  let treePointer = '/' + pathArray[0] + '/';
  let bookmarksUrl = 'https://'+domain+ '/bookmarks/';
  let resourcesUrl = 'https://'+domain+'/resources/';
  // walk along the pathArray
  return Promise.each(pathArray, (pathElement, i) => {
    //get the subtree at this subpath
    subTree = subTree[pathElement]; 
    bookmarksUrl += pathElement + '/';
    let bookData;
    // if not at the end of the path
    if (pathArray[i+1]) {
      // if the subTree has * at this position, 
      if (subTree['*']) { 
        console.log('found star', pathArray[i])
        // Create the data if the given url path doesn't exist in the data tree
        if (!subTree[pathArray[i+1]]) {  
        console.log('now here', pathArray, subTree)
        console.log('now here 2', pathArray[i+1])
          // create the path key and copy the subtree contents of * to it 
          subTree[pathArray[i+1]] = subTree['*'];
          //Update keys to the tree
          pointer.set(tree, treePointer+pathArray[i+1], pathArray[i+1])
          treePointer += '*/';
          // Create a new resource if the item has _type
          if (subTree['*']._type) {
            let id = uuid.v4();
            let resData = {
              _id: id,
              _rev: '0-0',
            };
            Object.keys(subTree['*']).forEach((element) => {
              resData[element] = subTree['*'][element];
            })
            resData._type = subTree['*']._type;
            bookData = {
              _id: resData._id,
              _rev: resData._rev
            };
            return simplePut(resourcesUrl+id, bookmarksUrl+pathArray[i+1]+'/', resData, bookData, token)
          } return false // Else no need to PUT anything, the server will make it an empty object
        } else {
          console.log('returning at ', subTree)
          return false
        }
      } else {
        treePointer += pathArray[i+1] + '/';
        return false
      }
    } else {
      let bookData = {
        _id: body._id || uuid.v4(),
        _rev: '0-0'
      }
      return simplePut(resourcesUrl+bookData._id, bookmarksUrl, body, bookData, token)
    }
  })
}

let recursiveSmartPutSetup = function(domain, token, keysArray, body, tree, i) {
  let key = keysArray[i]
  // if there are additional keys, proceed with recursion; else PUT the body
  if (key) {
    //get the subtree at this subpath
    let subTree;
    // if the subTree has * at this position, clone the tree 
    if (tree['*']) {
      subTree = _.cloneDeep(tree['*'])
    } else if (tree[key]) {
      subTree = _.cloneDeep(tree[key])
    }
//TODO: handle the case where niether of the two if statements above are satisfied
    return recursiveSmartPutSetup(domain, token, keysArray, body, subTree, i+1)
    .then((result) => {
      // if its a resource, check if it exists already
      if (result.cacheStatus === 'done') {
        return result
      }
      if (result.cacheStatus === 'end') {
        delete result.cacheStatus
        var thing = { body: {[key] : result.body }}
        return thing
      }
      if (subTree._type) {
        let pieces = keysArray.slice(0,i+1)
        let bookmarksUrl = 'https://'+domain+'/bookmarks/'+pieces.join('/')+'/'
        return agent('GET', bookmarksUrl)
        .set('Authorization', 'Bearer '+ token)
        .end()
        .then((res) => {
          if (res.body) {
            if (res.body._type) {
              res.cacheStatus = 'done'
              return res
            }
          }
          // Resource doesn't exist yet. Create it by merging in the lower links
          // with any additional contents in the subTree (pruned to remove *)
          let resBody = result.body;
          resBody._id = uuid.v4();
          resBody._rev = '0-0';
          let bookmarksBody = {
            _id: resBody._id,
            _rev: resBody._rev
          }
          let resourcesUrl = 'https://'+domain+'/resources/'+resBody._id;
          return simplePut(resourcesUrl, bookmarksUrl, resBody, bookmarksBody, token) 
          .then((res) => {
            var thing = { body: {[key]: bookmarksBody }}
            return thing
          }).catch((err) => {console.log(err);return err})
        }).catch((err) => {console.log(err);return err})
      } else {
        return {body: {[key]: result.body}}
      }
    }).catch((err) => {console.log(err);return err})
// This handles the end deepest path where the body is PUT. No recursion remaining.
  } else {
    body._id = body._id || uuid.v4()
    body._rev = '0-0'
    let bookmarksBody = {
      _id: body._id,
      _rev: body._rev
    }
    let resourcesUrl = 'https://'+domain+'/resources/'+body._id;
    let bookmarksUrl = 'https://'+domain+'/bookmarks/'+keysArray.join('/')+'/'
    return simplePut(resourcesUrl, bookmarksUrl, body, bookmarksBody, token)
    .then((res) => {
      return { body: bookmarksBody, cacheStatus: 'end' } 
    }).catch((err) => {console.log(err);return err})
  }
}

let putSetup = function(domain, token, bookmarksUrl, body, tree) {
  let pieces = (bookmarksUrl).split('/')
  pieces.splice(0,4)// leave only the pieces beyond bookmarks
  pieces.splice(pieces.length-1,1)
  // Assume no children resources
//  return smartPutSetup(domain, token, pieces, body, _.cloneDeep(tree))
  return recursiveSmartPutSetup(domain, token, pieces, body, _.cloneDeep(tree), 0)
  .then(() => {
    return cache.get(bookmarksUrl, token)
    .catch((err) => {console.log(err);return err})
  }).catch((err) => {console.log(err);return err})
}

let handleStarSetup = function(subTree, serverId, keysArray){
  return agent('GET', serverId.bookmarksUrl + pointer.compile(keysArray) + '/')
  .set('Authorization', 'Bearer '+ serverId.token)
  .end()
  .then(function(response) {
    if (response.body) {
      return Promise.mapSeries(Object.keys(response.body), (key) => {
        let cloneArray = _.clone(keysArray);
        cloneArray.push(key);
        return recursiveSetup(subTree['*'], serverId, cloneArray)
        .then((res) => {
          return appendResult(res, key)
        })
      })
    } else return []
  })
}

// Recursively construct the given data tree on the OADA server. Keys with a 
// _type property will be made into resources. A key of * will fetch all existing
// content at that position and continue to construct the tree as specified below
// the * key. Recursion ultimately returns the data that was created/found on
// the OADA server.
let recursiveSetup = function(subTree, serverId, keysArray) {
  return Promise.mapSeries(Object.keys(subTree), function(key) {
    // Encountered a *, fill out the tree with all keys at this position.
    if (key === '*') {
      return handleStarSetup(subTree, serverId, keysArray)
      .then((result) => {
      // Handling * requires a modified append step. We don't want to put the returned
      // result under the * key.
        let returnTree = {}
        result.forEach((item) => {
          Object.keys(item).forEach((k) => {
            returnTree[k] = item[k]
          }) 
        })
        return returnTree
      })
    }
    let content = subTree[key];
    if (typeof content === 'object') {
      let cloneArray = _.clone(keysArray);
      cloneArray.push(key);
      let url = serverId.bookmarksUrl + pointer.compile(keysArray) + '/' + key + '/';
      return agent('GET', url)
      .set('Authorization', 'Bearer '+ serverId.token)
      .end()
      .then((response) => {
        // content is empty, make sure if its a resource it gets created
        if (_.isEmpty(response.body)) {
          return createResource(content, key, serverId, keysArray)
          .then((result) => {
            // Now continue and try this step of the recursive setup over again.
            return recursiveSetup(content, serverId, cloneArray)
            .then((res) => {
              return appendResult(res, key)
            })
          })
        }
        // Server already has content
        return recursiveSetup(content, serverId, cloneArray)
        .then((res) => {
          return appendResult(res, key)
        })
      // content wasn't on the server; replace links, create it (and continue recursion within)
      }).catch((error) => {
        return createResource(content, key, serverId, keysArray)
        .then((result) => {
          // Now continue and try this step of the recursive setup over again.
          return recursiveSetup(content, serverId, cloneArray)
          .then((res) => {
            return appendResult(res, key)
          })
        })
      })
    } else {
      let obj = {};
      obj[key] = subTree[key]
      return obj
    }
  })
}

// Used in recursiveSetup, this function is used to prepare the object returned
// from each recursion.
let appendResult = (result, key) => {
  let returnTree = {}
  returnTree[key] = {}
  result.forEach((item) => {
    Object.keys(item).forEach((k, i) => {
      returnTree[key][k] = item[k]
    })
  })
  return returnTree
}

// Used in recursiveSetup, this function creates the data on the server if it
// is missing. Resources will be created for keys with a _type prop, and the
// data will be linked at a bookmarks url. 
let createResource = function(subTree, key, serverId, keysArray) {
  let resource = {}
  let bookmark = {};
  bookmark[key] = {};
// If its a resource (has _type), add _id and _rev to resource and bookmark,
// and PUT the resource
  return Promise.try(() => {
    if (subTree._type) {
      Object.keys(subTree).forEach((k) => {
        resource[k] = {}
      })
      resource['_id'] = uuid.v4();
      resource['_rev'] = '0-0';
      resource['_type'] = subTree._type;
      bookmark[key] = {
        _id: resource._id,
        _rev: resource._rev,
      }; 
      let resourceUrl = serverId.resourcesUrl + resource._id + '/';
      return agent('PUT', resourceUrl)
      .set('Authorization', 'Bearer '+ serverId.token)
      .send(resource)
      .end()
    } else return null
  }).then(() => {
    // Also add the bookmarks link
    let bookmarkUrl = serverId.bookmarksUrl + pointer.compile(keysArray) + '/';
    return agent('PUT', bookmarkUrl)
    .set('Authorization', 'Bearer '+ serverId.token)
    .send(bookmark)
    .end()
  })
}

let pouchPutNew = function(token, url) {
  if (token) {
    return agent('GET', url)
    .set('Authorization', 'Bearer '+ token)
    .end()
    .then((response) => {
      return cache.db().put({
        doc: response.body,
        _id: url, 
      }).then(() => {
        return response.body
      }).catch((err) => {console.log(err); return err})
    }).catch((err) => {console.log(err); return err})
  } else return new Error('No token specified')
}

let cache = {
  
// Get data from pouch; if not in pouch, get from server and store in pouch.
  get: function(url, token) {
    // Make sure the url ends in / for consistency
    url = url.trim()
    if (url[url.length-1] !== '/') url +='/';
    // Lookup the resource id from the url
    console.log('getting', url)
    return cache.db().get(url).then((result) => {
    console.log('got', result)
      return result.doc;
    }).catch((err) => {
      console.log('caught', url)
      return pouchPutNew(token, url).then((res)=> {
        return res
      }).catch((err) => {console.log(err);return err})
    })
  },

  delete: function(url, token) {
    return agent('DELETE', url)
    .set('Authorization', 'Bearer '+ token)
    .end()
    .then((res) => {
      return res
    })
  },

  destroyLocalDb: () => {
    return Promise.try(() => {
      if (db_singleton) {
        return db_singleton.destroy().then(() => {
          return db_singleton = null;
        })
      } else return false
    })
  },

// Return the database singleton
  db: (name, size) => {
    if (!db_singleton) { 
      name = name || uuid.v4();
      size = size || 50;
      db_singleton = new PouchDB(name, { size });
    }
    return db_singleton;
  },

  put: function(domain, token, bookmarksUrl, body, tree) {
    // Use the bookmarks lookup to get the resource id; remove from pouch, update 
    // server, and pouch will update 
    return cache.db().get(bookmarksUrl).then(function(resId) {
      // now get the actual data doc
      return cache.db().get(resId.doc).then(function(content) {
        return putSetup(domain, token, bookmarksUrl, body, tree)
        .catch((err) => {console.log(err);return err})
      }).catch(function(err) {
      	return err;
      })
    // The bookmarksUrl doesn't exist in the db, put it to the server
    }).catch(function(err) {
      return putSetup(domain, token, bookmarksUrl, body, tree)
      .catch((err) => {console.log(err);return err})
    })
  },

// setup takes the tree  object and recursively PUTS keys to the oada server. 
// Resources are created as necessary for objects that have a _type key.
  setup: function(domain, token, tree, name, size) {
    let resourcesUrl = 'https://' + domain + '/resources/';
    let bookmarksUrl = 'https://' + domain + '/bookmarks';
    let serverId = { domain: domain, token: token, resourcesUrl: resourcesUrl, bookmarksUrl: bookmarksUrl };
    let pouchdata = cache.db(name, size); //create the pouchdb
    return recursiveSetup(tree, serverId, []).then((res) => {
      let returnTree = {}
      res.forEach((item) => {
        Object.keys(item).forEach((key, i) => {
          returnTree[key] = item[key]
        })
      })
      return returnTree
    }).catch((err) => {
      return err
    })
  },
}

module.exports = cache;
