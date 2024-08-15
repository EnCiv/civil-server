#!/usr/bin/env node
'use strict'

var ObjectId = require('mongodb').ObjectId

console.log(new ObjectId().toHexString())
