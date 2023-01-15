#!/usr/bin/env node
const package = require('./package.json')
const civilPackage = require('node_modules/civil-server/package')
const cloneDeep = require('lodash').cloneDeep


const fs = require('fs')

const sections = ['optionalDependencies', 'devDependencies', 'peerDependencies', 'scripts']

function mergeDeps(newPackage, section, changes) {
    Object.keys(civilPackage[section]).forEach(key => {
        if (!newPackage[section]) {
            newPackage[section] = {}
            changes.count++
        }
        if (!newPackage[section][key]) {
            newPackage[section][key] = civilPackage[section][key]
            changes.count++
        } else if (newPackage[section][key] !== civilPackage[section][key]) {
            console.info(`package.${section}.${key} is ${newPackage[section][key]} should be ${civilPackage[section][key]}`)
        }
    })
}

function main() {
    let newPackage = cloneDeep(package)
    let changes = { count: 0 }
    sections.forEach(section => mergeDeps(newPackage, section, changes))
    if (changes.count > 0)
        fs.writeFileSync('./package.json', JSON.stringify(newPackage, null, 2))
}
main()
