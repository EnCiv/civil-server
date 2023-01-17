#!/usr/bin/env node
const fs = require('fs')

const sections = ['optionalDependencies', 'devDependencies', 'peerDependencies', 'scripts']
const npmTestDefault = 'echo "Error: no test specified" && exit 1'

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
  const civilServerPackage = JSON.parse(fs.readFileSync('./node_modules/civil-server/package.json'))
  let civilClientPackage = JSON.parse(fs.readFileSync('./node_modules/civil-client/package.json'))
  let civilPackage = {}
  // dependenciers and scrips from the server side will take presidence over those from the client side
  sections.forEach(section => {
    civilPackage[section] = { ...civilClientPackage[section], ...civilServerPackage[section] }
  })
  if (newPackage?.scripts?.test === npmTestDefault) newPackage.scripts.test = ''
  let changes = { count: 0 }
  sections.forEach(section => mergeDeps(newPackage, civilPackage, section, changes))
  if (newPackage.dependencies['civil-server']) {
    newPackage.peerDependencies['civil-server'] = newPackage.dependencies['civil-server']
    delete newPackage.dependencies['civil-server']
    changes.count++
  }
  if (changes.count > 0) fs.writeFileSync('./package.json', JSON.stringify(newPackage, null, 2))
}
main()
