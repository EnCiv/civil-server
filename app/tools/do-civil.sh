#/usr/bin/env bash
echo "Setting up directory template"
echo "If files exist you will be asked if you want to overwrite them"
cp -rip ./node_modules/civil-server/template/. .
echo "extracting node version"
export NODE_VERSION=$(cat ./node_modules/civil-server/package.json | grep '\"node\":' | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g')
nvs add $NODE_VERSION
source nvs.sh use $NODE_VERSION
node node_modules/civil-server/app/tools/civil-package-json.js
if [ ! -f .bashrc ]; then
    echo "Setting .bshrc"
    template/bashrcsetup.sh
fi
