// This bootstrap runs before the client bundle. Script elements execute callback
// source without eval/unsafe-eval, and executable code stays out of React props.
function installCookieHandlers(definitions, initialScripts) {
  function run(source) {
    if (!source) return
    const script = document.createElement('script')
    script.text = source
    document.head.appendChild(script)
    script.remove()
  }

  window.encivCookieHandlers = Object.create(null)
  for (const { id, onAccepted, onRevoked } of definitions) {
    window.encivCookieHandlers[id] = {
      onAccepted: () => run(onAccepted),
      onRevoked: () => run(onRevoked),
    }
  }
  for (const source of initialScripts) run(source)
}

export default function cookieHandlersScript(definitions = [], initialScripts = []) {
  // Preserve arbitrary callback source without letting closing script tags in
  // callback strings or names terminate the surrounding HTML script element.
  const encode = value => JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  return `(${installCookieHandlers.toString()})(${encode(definitions)}, ${encode(initialScripts)});`
}
