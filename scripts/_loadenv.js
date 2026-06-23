const fs = require('fs')
const path = require('path')

function loadEnv(file = '.env.script-local') {
  const full = path.join(process.cwd(), file)
  const txt = fs.readFileSync(full, 'utf8')
  for (const line of txt.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) process.env[m[1]] = m[2].trim()
  }
}

module.exports = { loadEnv }
