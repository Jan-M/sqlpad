var Joi = require('joi')
var db = require('../lib/db.js')
var _ = require('lodash')
var cipher = require('../lib/cipher.js')
var config = require('../lib/config.js')

var POSTGRES_DISCOVERY_ENABLED = false
var OPERATOR_URL = ''

if (config.get('postgresOperatorUrl') != '') {
  var request = require('request')
  OPERATOR_URL = config.get('postgresOperatorUrl')
  console.log('Operator URL: ' + OPERATOR_URL)
  POSTGRES_DISCOVERY_ENABLED = true
  POSTGRES_USER = config.get('postgresDefaultUser')
  POSTGRES_PASSWORD = config.get('postgresDefaultPassword')
}

var schema = {
  _id: Joi.string().optional(), // will be auto-gen by nedb
  name: Joi.string().required(),
  driver: Joi.string().required(), // postgres, mysql, etc
  host: Joi.string().optional(),
  port: Joi.any().optional(),
  database: Joi.string()
    .optional()
    .allow(''),
  username: Joi.string().default('', 'Database Username'), // decrypt for presentation, encrypted for storage
  password: Joi.string().default('', 'Database Password'), // decrypt for presentation, encrypted for storage
  domain: Joi.string()
    .optional()
    .allow(''),
  sqlserverEncrypt: Joi.boolean().default(false, 'SQL Server Encrypt'),
  postgresSsl: Joi.boolean().default(false, 'Postgres SSL'),
  postgresCert: Joi.string().optional(),
  postgresKey: Joi.string().optional(),
  postgresCA: Joi.string().optional(),
  useSocks: Joi.boolean().default(
    false,
    'Connect to database through SOCKS proxy'
  ),
  socksHost: Joi.string().optional(),
  socksPort: Joi.string().optional(),
  socksUsername: Joi.string().optional(),
  socksPassword: Joi.string().optional(),
  mysqlInsecureAuth: Joi.boolean().default(false, 'Mysql Insecure Auth'),
  prestoCatalog: Joi.string()
    .optional()
    .allow(''),
  prestoSchema: Joi.string()
    .optional()
    .allow(''),
  createdDate: Joi.date().default(new Date(), 'time of creation'),
  modifiedDate: Joi.date().default(new Date(), 'time of modifcation')
}

var Connection = function Connection(data) {
  this._id = data._id
  this.name = data.name
  this.driver = data.driver
  this.host = data.host
  this.port = data.port
  this.database = data.database
  this.username = data.username
  this.password = data.password
  this.domain = data.domain // this is sql server only for now, but could apply to other dbs in future?
  this.sqlserverEncrypt = data.sqlserverEncrypt
  this.postgresSsl = data.postgresSsl
  this.postgresCert = data.postgresCert
  this.postgresKey = data.postgresKey
  this.useSocks = data.useSocks
  this.socksHost = data.socksHost
  this.socksPort = data.socksPort
  this.socksUsername = data.socksUsername
  this.socksPassword = data.socksPassword
  this.mysqlInsecureAuth = data.mysqlInsecureAuth
  this.prestoCatalog = data.prestoCatalog
  this.prestoSchema = data.prestoSchema
  this.createdDate = data.createdDate
  this.modifiedDate = data.modifiedDate
}

Connection.prototype.save = function ConnectionSave(callback) {
  var self = this
  this.modifiedDate = new Date()
  // TODO - build in auto cypher if rawUsername and rawPassword set?
  var joiResult = Joi.validate(self, schema)
  if (joiResult.error) return callback(joiResult.error)
  if (self._id) {
    db.connections.update({ _id: self._id }, joiResult.value, {}, function(
      err
    ) {
      if (err) return callback(err)
      Connection.findOneById(self._id, callback)
    })
  } else {
    db.connections.insert(joiResult.value, function(err, newDoc) {
      if (err) return callback(err)
      return callback(null, new Connection(newDoc))
    })
  }
}

/*  Query methods
============================================================================== */
var operatorToConnection = function(database, cluster) {
  return new Connection({
    host: cluster,
    _id: cluster + '-' + database,
    name: cluster + '-' + database,
    database: database,
    postgresSsl: true,
    username: cipher(POSTGRES_USER),
    password: cipher(POSTGRES_PASSWORD),
    driver: 'postgres'
  })
}

Connection.findOneById = function ConnectionFindOneById(id, callback) {
  if (POSTGRES_DISCOVERY_ENABLED) {
    console.log('looking for single database:' + id)
    Connection.findAll((err, clusters) => {
      c = _.filter(clusters, e => {
        return e._id == id
      })
      if (c) {
        return callback(false, c[0])
      } else {
        return callback()
      }
    })
    return
  }

  db.connections.findOne({ _id: id }).exec(function(err, doc) {
    if (err) return callback(err)
    if (!doc) return callback()
    return callback(err, new Connection(doc))
  })
}

Connection.findAll = function ConnectionFindAll(callback) {
  if (POSTGRES_DISCOVERY_ENABLED) {
    request(OPERATOR_URL + '/databases', { json: true }, (err, res, body) => {
      if (err) {
        console.error('request to operator failed: ' + err)
        return callback(null, [])
      } else {
        clusters = []
        _.map(body, (cs, d) => {
          _.map(cs, c => {
            clusters.push(operatorToConnection(c, d))
          })
        })

        console.log(
          'retrieved ' + clusters.length + ' clusters from operator API'
        )
        return callback(null, clusters)
      }
    })
    return
  }

  db.connections.find({}).exec(function(err, docs) {
    if (err) return callback(err)
    var connections = docs.map(function(doc) {
      return new Connection(doc)
    })
    connections = _.sortBy(connections, function(c) {
      return c.name.toLowerCase()
    })
    return callback(null, connections)
  })
}

Connection.removeOneById = function ConnectionRemoveOneById(id, callback) {
  db.connections.remove({ _id: id }, callback)
}

Connection._removeAll = function _removeAllConnections(callback) {
  db.connections.remove({}, { multi: true }, callback)
}

module.exports = Connection
