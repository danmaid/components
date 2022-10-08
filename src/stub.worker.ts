const sw = self as ServiceWorkerGlobalScope & Window & typeof globalThis

sw.addEventListener('install', () => {
  console.log('install.')
})

const todos: unknown[] = [
  { id: '111', title: 'todo1' },
  { id: '222', title: 'todo2', status: 'do' },
  { id: '333', title: 'todo3' },
]

sw.addEventListener('fetch', (ev) => {
  console.debug('fetch', ev.clientId, ev.request)
  const req = ev.request
  const url = new URL(ev.request.url)
  console.debug(req, url)

  if (url.pathname.startsWith('/todos')) {
    console.debug('todos')
    if (/^\/todos\/?$/.test(url.pathname) && req.method === 'GET') {
      console.debug('GET /todos/')
      const headers = { 'Content-Type': 'application/vnd.danmaid+json' }
      ev.respondWith(new Response(JSON.stringify(todos), { headers }))
    } else if (/^\/todos\/?$/.test(url.pathname) && req.method === 'POST') {
      console.debug('POST /todos/')
      ev.respondWith(
        (async function () {
          const todo = await req.json()
          todos.push({ ...todo, id: new Date().toISOString() })
          return new Response(null, { status: 200 })
        })()
      )
    }
  }
})
