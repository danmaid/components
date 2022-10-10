const sw = self as ServiceWorkerGlobalScope & Window & typeof globalThis

sw.addEventListener('install', () => {
  console.log('install.')
})

interface Todo {
  id: string
  title: string
  status?: 'do' | 'done' | 'pause'
  last_action?: {
    date: Date
    type: 'created' | 'updated'
    keys?: string[]
    message?: string
  }
  comments?: string[]
}

const todos: Todo[] = [
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
    if (/^\/todos\/?$/.test(url.pathname)) {
      if (req.method === 'GET') {
        console.debug('GET /todos/')
        const headers = { 'Content-Type': 'application/vnd.danmaid+json' }
        ev.respondWith(new Response(JSON.stringify(todos), { headers }))
      }
      if (req.method === 'POST') {
        console.debug('POST /todos/')
        ev.respondWith(
          (async function () {
            const todo = await req.json()
            todos.push({
              ...todo,
              id: new Date().toISOString(),
              last_action: { date: new Date(), type: 'created' },
            })
            return new Response(null, { status: 201 })
          })()
        )
      }
    } else if (/^\/todos\/[^\/]+$/.test(url.pathname)) {
      const id = url.pathname.match(/^\/todos\/([^\/]+)$/)?.[1]
      if (req.method === 'PATCH') {
        console.log('PATCH /todos/:id', id)
        const todo = todos.find((v) => v.id === id)
        if (!todo) return ev.respondWith(new Response(null, { status: 404 }))
        ev.respondWith(
          (async function () {
            const patch = await req.json()
            Object.assign(todo, patch, {
              last_action: {
                date: new Date(),
                type: 'updated',
                keys: Object.keys(patch),
              },
            })
            return new Response(null, { status: 200 })
          })()
        )
      }
    } else if (/^\/todos\/[^\/]+\/comments$/.test(url.pathname)) {
      const id = url.pathname.match(/^\/todos\/([^\/]+)/)?.[1]
      if (req.method === 'POST') {
        console.log('POST /todos/:id/comments', id)
        const todo = todos.find((v) => v.id === id)
        if (!todo) return ev.respondWith(new Response(null, { status: 404 }))
        ev.respondWith(
          (async function () {
            const comment = await req.text()
            if (!Array.isArray(todo.comments)) todo.comments = []
            todo.comments.push(comment)
            todo.last_action = {
              date: new Date(),
              type: 'updated',
              keys: ['comments'],
              message: comment,
            }
            return new Response(null, { status: 200 })
          })()
        )
      }
    }
  }
})
