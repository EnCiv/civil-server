#/usr/bin/env bash
echo "Setting up directory template"
echo "If files exist you will be asked if you want to overwrite them"
cp -rip ./node_modules/civil-server/template/. .
echo "extracting node version"
export NVS_PATH=`which nvs 2> /dev/null`
if [[ -n "$NVS_PATH" ]]
then
    export NODE_VERSION=$(cat ./node_modules/civil-server/package.json | grep '\"node\":' | head -1 | awk -F: '{ print $2 }' | sed 's/[",]//g')
    nvs add $NODE_VERSION
    source nvs.sh use $NODE_VERSION
    node node_modules/civil-server/app/tools/civil-package-json.js
else
    node node_modules/civil-server/app/tools/civil-package-json.js
fi
if [[ ! -f .bashrc ]] then
    echo "Setting .bshrc"
    ./bashrcsetup.sh
    if [[ -n "$NVS_PATH" ]] then
        echo 'export NODE_VERSION=$(cat ./node_modules/civil-server/package.json | grep '"'"'\"node\":'"'"' | head -1 | awk -F: '"'"'{ print $2 }'"'"' | sed '"'"'s/[",]//g'"'"')' >> .bashrc
        echo 'nvs add $NODE_VERSION' >> .bashrc
        echo 'source nvs.sh use $NODE_VERSION' >> .bashrc
    fi
fi
source ./.bashrc
echo "Running npm install after updating package.json this may take a while"
npm install
