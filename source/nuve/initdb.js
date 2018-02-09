#!/usr/bin/env node
'use strict';

var dbURL = process.env.DB_URL;
if (!dbURL) {
  throw 'DB_URL not found';
}

var fs = require('fs');
var path = require('path');
var configFile = path.join(__dirname, 'nuve.toml');
try {
  fs.statSync(configFile);
} catch (e) {
  console.error('config file not found');
  process.exit(1);
}

require('./data_access');
var Service = require('./data_access/model/serviceModel');
var cipher = require('./cipher');

function prepareService (serviceName, next) {
  Service.findOne({name: serviceName}, function cb (err, service) {
    if (err || !service) {
      var crypto = require('crypto');
      var key = crypto.pbkdf2Sync(crypto.randomBytes(64).toString('hex'), crypto.randomBytes(32).toString('hex'), 4000, 128, 'sha256').toString('base64');
      service = {name: serviceName, key: cipher.encrypt(cipher.k, key), encrypted: true, rooms: []};
      Service.create(service, function cb (err, saved) {
        if (err) {
          console.log('mongodb: error in adding', serviceName);
          Service.base.connection.close();
          return;
        }
        service = saved.toObject();
        service.key = key;
        next(service);
      });
    } else {
      if (typeof service.__v !== 'number') {
        console.log(`The existed service "${serviceName}" is not in 4.0 format.`);
        console.log('Please use nuve/SchemaUpdate3to4.js to upgrade your database.');
        setTimeout(()=>Service.base.connection.close(), 2000);
        return;
      }

      service = service.toObject();
      if (service.encrypted === true) {
        service.key = cipher.decrypt(cipher.k, service.key);
      }
      next(service);
    }
  });
}

prepareService('superService', function (service) {
  var superServiceId = service._id+'';
  var superServiceKey = service.key;
  console.log('superServiceId:', superServiceId);
  console.log('superServiceKey:', superServiceKey);
  fs.readFile(configFile, 'utf8', function (err, data) {
    if (err) {
      return console.log(err);
    }
    data = data.replace(/\ndataBaseURL =[^\n]*\n/, '\ndataBaseURL = "'+dbURL+'"\n');
    data = data.replace(/\nsuperserviceID =[^\n]*\n/, '\nsuperserviceID = "'+superServiceId+'"\n');
    fs.writeFile(configFile, data, 'utf8', function (err) {
      if (err) return console.log('Error in saving configuration:', err);
    });
  });

  prepareService('sampleService', function (service) {
    var sampleServiceId = service._id+'';
    var sampleServiceKey = service.key;
    console.log('sampleServiceId:', sampleServiceId);
    console.log('sampleServiceKey:', sampleServiceKey);

    Service.base.connection.close();
    var sampleAppFile = path.resolve(__dirname, '../extras/basic_example/basicServer.js');
    fs.readFile(sampleAppFile, 'utf8', function (err, data) {
      if (err) {
        return console.log(err);
      }
      data = data.replace(/N\.API\.init\('[^']*', '[^']*'/, 'N.API.init(\''+sampleServiceId+'\', \''+sampleServiceKey+'\'');
      fs.writeFile(sampleAppFile, data, 'utf8', function (err) {
         if (err) return console.log(err);
      });
    });
    var sampleServiceFile = path.resolve(__dirname, '../extras/basic_example/sampleRTCService.js');
    fs.readFile(sampleServiceFile, 'utf8', function (err, data) {
      if (err) {
        return console.log(err);
      }
      data = data.replace(/icsREST\.API\.init\('[^']*', '[^']*'/, 'icsREST.API.init(\''+sampleServiceId+'\', \''+sampleServiceKey+'\'');
      fs.writeFile(sampleServiceFile, data, 'utf8', function (err) {
         if (err) return console.log(err);
      });
    });
  });
});
