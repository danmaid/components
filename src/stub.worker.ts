const sw = self as ServiceWorkerGlobalScope & Window & typeof globalThis

sw.addEventListener('install', () => {
  console.log('install.')
})

class PersistentArray<T> extends Array<T> {
  constructor(public key: string, ...items: T[]) {
    super()
    super.push(...(this.load() || items))
  }

  load(): T[] | void {
    const data = localStorage.getItem(this.key)
    if (!data) return
    return JSON.parse(data)
  }

  save(): void {
    localStorage.setItem(this.key, JSON.stringify(this))
  }

  push(...items: T[]): number {
    const result = super.push(...items)
    this.save()
    return result
  }
}

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

const todos: Todo[] = new PersistentArray(
  'todos',
  { id: '111', title: 'todo1' },
  { id: '222', title: 'todo2', status: 'do' },
  { id: '333', title: 'todo3' }
)

interface Event {
  id?: string
}

const events: Event[] = new PersistentArray('events')

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
      } else if (req.method === 'POST') {
        console.debug('POST /todos/')
        const id = new Date().toISOString()
        ev.respondWith(
          (async function () {
            const todo = await req.json()
            const event = { ...todo, id, date: new Date(), type: 'created' }
            events.push(event)
            todos.push({ ...todo, id, last_event: event })
            return new Response(JSON.stringify(event), {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            })
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
            const event = {
              id,
              date: new Date(),
              type: 'updated',
              keys: Object.keys(patch),
            }
            Object.assign(todo, patch, { last_event: event })
            return new Response(JSON.stringify(event), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          })()
        )
      } else if (req.method === 'GET') {
        console.log('GET /todos/:id', id)
        const todo = todos.find((v) => v.id === id)
        if (!todo) return ev.respondWith(new Response(null, { status: 404 }))
        ev.respondWith(
          new Response(JSON.stringify(todo), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
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
    } else if (/^\/todos\/[^\/]+\/events$/.test(url.pathname)) {
      const id = url.pathname.match(/^\/todos\/([^\/]+)/)?.[1]
      if (req.method === 'GET') {
        console.log('GET /todos/:id/events', id)
        const data = events.filter((v) => v.id === id)
        ev.respondWith(new Response(JSON.stringify(data), { status: 200 }))
      }
    }
  }
})
