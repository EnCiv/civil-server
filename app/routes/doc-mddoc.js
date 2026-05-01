'use strict'

import fs from 'fs'
import path from 'path'
import { marked } from 'marked'

// Serve a markdown file from assets/md/ as rendered HTML.
// Route: GET /doc/:mddoc  (e.g. /doc/civil-server)
export default function getMarkDown() {
  this.app.get('/doc/:mddoc', (req, res, next) => {
    // Restrict to a plain filename (no slashes or dots that could traverse paths)
    const name = req.params.mddoc
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
      res.statusCode = 400
      return res.send('Invalid document name')
    }
    const mdDir = path.resolve(__dirname, '../../assets/md')
    const filePath = path.join(mdDir, name + '.md')
    fs.readFile(filePath, 'utf8', (err, data) => {
      if (err) {
        if (err.code === 'ENOENT') {
          res.statusCode = 404
          return res.send('Document not found')
        }
        return next(err)
      }
      const html = marked.parse(data)
      res.header({ 'Content-Type': 'text/html; charset=UTF-8' })
      res.send(html)
    })
  })
}
