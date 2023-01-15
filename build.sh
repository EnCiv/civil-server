#!/bin/bash
#
# create the WebComponents index files
#
# we need to do this before we can babel-transpile the whole project
# first we need to babel-transpile the web-components template so we can use it in the indexer
babel app/components/web-components-template.jsx app/components/data-components-template.js --ignore **/__tests__ --out-dir dist/components --source-maps
# then we need to babel-transpile the indexer, and create the web-components index 
babel app/tools/react-directory-indexer.js --ignore **/__tests__ --out-dir dist/tools --source-maps
node dist/tools/react-directory-indexer.js app/web-components/
node dist/tools/react-directory-indexer.js --data app/data-components/

npm run transpile  || {
  echo Could not transpile;
  exit 1
}
echo "transpile ok"

# these are being exported by packages.json.bin{} make them executable it seems to matter more on heroku 
chmod a+x dist/tools/react-directory-indexer.js dist/tools/mongo-id.js dist/tools/logwatch.js
# don't run webpack if this is a dependency of another project - the memory usage will blow out heroku build 
if test \"$NPM_PROJECT\" = \"\" || test \"$NPM_PROJECT\" == \"civil-server\" ; then {
  npm run packbuild  || {
    echo Could not webpack;
    exit 1
  }
}; fi



