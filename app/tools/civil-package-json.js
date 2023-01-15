#!/usr/bin/env node
const fs = require('fs')

const sections = ['optionalDependencies', 'devDependencies', 'peerDependencies', 'scripts']

function mergeDeps(newPackage, civilPackage, section, changes) {
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
    let newPackage = JSON.parse(fs.readFileSync('./package.json'))
    const civilPackage = JSON.parse(fs.readFileSync('./node_modules/civil-server/package.json'))
    let changes = { count: 0 }
    sections.forEach(section => mergeDeps(newPackage, civilPackage, section, changes))
    if (newPackage.dependencies['civil-server']) {
        newPackage.peerDependencies['civil-server'] = newPackage.dependencies['civil-server']
        delete newPackage.dependencies['civil-server']
        changes.count++
    }
    if (changes.count > 0)
        fs.writeFileSync('./package.json', JSON.stringify(newPackage, null, 2))
}
main()
