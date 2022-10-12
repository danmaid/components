const sw = self as ServiceWorkerGlobalScope & Window & typeof globalThis

sw.addEventListener('install', () => {
  console.log('install.')
})

interface Todo {
  id: string
  title: string
  status?: 'doing' | 'done' | 'paused'
  last_action?: {
    date: Date
    type: 'created' | 'updated'
    keys?: string[]
    message?: string
  }
  comments?: string[]
}

interface DmEvent extends Record<string, unknown> {
  date: Date
  type: 'created'
}

const dbOpen = new Promise<IDBDatabase>((resolve, reject) => {
  const req = indexedDB.open('stub', 1)
  req.onupgradeneeded = async () => {
    console.debug('req.onupgradeneeded')
    const db = req.result
    await new Promise<void>((resolve, reject) => {
      db.createObjectStore('events', {
        keyPath: 'event_id',
        autoIncrement: true,
      }).createIndex('id_index', 'id')
      const store = db.createObjectStore('todos', { keyPath: 'id' })
      store.transaction.oncomplete = () => resolve()
      store.transaction.onerror = () => reject(store.transaction.error)
    })

    console.log('store created.')
    const tran = db.transaction(['events', 'todos'], 'readwrite')
    const events = tran.objectStore('events')
    const todos = tran.objectStore('todos')

    const data: Todo[] = [
      { id: '111', title: 'todo1' },
      { id: '222', title: 'todo2', status: 'doing' },
      { id: '333', title: 'todo3' },
    ]
    data.map(async (todo) => {
      const eventId = await new Promise<IDBValidKey>((resolve, reject) => {
        const req = events.add({ date: new Date(), type: 'created', ...todo })
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      const last_event = await new Promise((resolve, reject) => {
        const req = events.get(eventId)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
      await new Promise((resolve, reject) => {
        const req = todos.add({ ...todo, last_event })
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    })
    await new Promise<void>((resolve, reject) => {
      tran.oncomplete = () => resolve()
      tran.onerror = () => reject(tran.error)
    })
  }
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

const eventStream = new EventTarget()

sw.addEventListener('fetch', (ev) => {
  console.debug('fetch', ev.clientId, ev.request)
  const req = ev.request
  const url = new URL(ev.request.url)
  console.debug(req, url)

  if (url.pathname.startsWith('/todos')) {
    console.debug('todos')
    if (/^\/todos\/?$/.test(url.pathname)) {
      if (req.method === 'GET') {
        if (req.headers.get('Accept') === 'text/event-stream') {
          console.debug('SSE /todos/')
          ev.respondWith(
            (async function () {
              const stream = new ReadableStream({
                start(controller) {
                  eventStream.addEventListener('event', (ev) => {
                    console.debug('event received.', ev)
                    const e = (ev as CustomEvent).detail
                    const t = `id: ${e.event_id}\ndata: ${JSON.stringify(
                      e
                    )}\n\n`
                    controller.enqueue(
                      Uint8Array.from(t, (x) => x.charCodeAt(0))
                    )
                  })
                },
              })
              return new Response(stream, {
                headers: {
                  'Content-Type': 'text/event-stream',
                  'Transfer-Encoding': 'chunked',
                  Connection: 'keep-alive',
                },
              })
            })()
          )
          return
        }
        console.debug('GET /todos/')
        ev.respondWith(
          (async function () {
            const db = await dbOpen
            const store = db.transaction('todos').objectStore('todos')
            const todos = await new Promise((resolve, reject) => {
              const req = store.getAll()
              req.onsuccess = () => resolve(req.result)
              req.onerror = () => reject(req.error)
            })
            const headers = { 'Content-Type': 'application/json' }
            return new Response(JSON.stringify(todos), { headers })
          })()
        )
      } else if (req.method === 'POST') {
        console.debug('POST /todos/')
        ev.respondWith(
          (async function () {
            const id = new Date().toISOString()
            const todo = { ...(await req.json()), id }
            const db = await dbOpen
            const tran = db.transaction(['events', 'todos'], 'readwrite')
            const events = tran.objectStore('events')
            const todos = tran.objectStore('todos')

            const eventId = await new Promise<IDBValidKey>(
              (resolve, reject) => {
                const req = events.add({
                  date: new Date(),
                  type: 'created',
                  ...todo,
                })
                req.onsuccess = () => resolve(req.result)
                req.onerror = () => reject(req.error)
              }
            )
            const last_event = await new Promise((resolve, reject) => {
              const req = events.get(eventId)
              req.onsuccess = () => resolve(req.result)
              req.onerror = () => reject(req.error)
            })
            const result = await new Promise((resolve, reject) => {
              const req = todos.add({ ...todo, last_event })
              req.onsuccess = () => resolve(req.result)
              req.onerror = () => reject(req.error)
            })
            await new Promise<void>((resolve, reject) => {
              tran.oncomplete = () => resolve()
              tran.onerror = () => reject(tran.error)
            })
            eventStream.dispatchEvent(
              new CustomEvent('event', { detail: last_event })
            )
            return new Response(JSON.stringify(result), {
              status: 201,
              headers: { 'Content-Type': 'application/json' },
            })
          })()
        )
      }
    } else if (/^\/todos\/[^\/]+$/.test(url.pathname)) {
      const id = url.pathname.match(/^\/todos\/([^\/]+)$/)?.[1]
      if (!id) throw Error('invalid id.')
      if (req.method === 'PATCH') {
        console.log('PATCH /todos/:id', id)
        ev.respondWith(
          (async function () {
            const patch = await req.json()
            const db = await dbOpen
            const tran = db.transaction(['events', 'todos'], 'readwrite')
            const events = tran.objectStore('events')
            const todos = tran.objectStore('todos')

            const todo = await new Promise<Todo | undefined>(
              (resolve, reject) => {
                const req = todos.get(id)
                req.onsuccess = () => resolve(req.result)
                req.onerror = () => reject(req.error)
              }
            )
            if (!todo) return new Response(null, { status: 404 })

            const eventId = await new Promise<IDBValidKey>(
              (resolve, reject) => {
                const req = events.add({
                  date: new Date(),
                  type: 'updated',
                  id,
                  keys: Object.keys(patch),
                  ...patch,
                })
                req.onsuccess = () => resolve(req.result)
                req.onerror = () => reject(req.error)
              }
            )
            const last_event = await new Promise((resolve, reject) => {
              const req = events.get(eventId)
              req.onsuccess = () => resolve(req.result)
              req.onerror = () => reject(req.error)
            })
            const result = await new Promise((resolve, reject) => {
              const req = todos.put({ ...todo, ...patch, last_event })
              req.onsuccess = () => resolve(req.result)
              req.onerror = () => reject(req.error)
            })
            await new Promise<void>((resolve, reject) => {
              tran.oncomplete = () => resolve()
              tran.onerror = () => reject(tran.error)
            })
            eventStream.dispatchEvent(
              new CustomEvent('event', { detail: last_event })
            )
            return new Response(JSON.stringify(result), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          })()
        )
      } else if (req.method === 'GET') {
        console.log('GET /todos/:id', id)
        ev.respondWith(
          (async function () {
            const db = await dbOpen
            const store = db.transaction('todos').objectStore('todos')
            const todo = await new Promise((resolve, reject) => {
              const req = store.get(id)
              req.onsuccess = () => resolve(req.result)
              req.onerror = () => reject(req.error)
            })

            return todo
              ? new Response(JSON.stringify(todo), {
                  status: 200,
                  headers: { 'Content-Type': 'application/json' },
                })
              : new Response(null, { status: 404 })
          })()
        )
      }
    } else if (/^\/todos\/[^\/]+\/comments$/.test(url.pathname)) {
      const id = url.pathname.match(/^\/todos\/([^\/]+)/)?.[1]
      if (!id) throw Error('invalid id.')
      if (req.method === 'POST') {
        console.log('POST /todos/:id/comments', id)
        ev.respondWith(
          (async function () {
            const comment = await req.text()
            const db = await dbOpen
            const tran = db.transaction(['events', 'todos'], 'readwrite')
            const events = tran.objectStore('events')
            const todos = tran.objectStore('todos')

            const todo = await new Promise<Todo | undefined>(
              (resolve, reject) => {
                const req = todos.get(id)
                req.onsuccess = () => resolve(req.result)
                req.onerror = () => reject(req.error)
              }
            )
            if (!todo) return new Response(null, { status: 404 })

            const eventId = await new Promise<IDBValidKey>(
              (resolve, reject) => {
                const req = events.add({
                  date: new Date(),
                  type: 'updated',
                  id,
                  keys: ['comments'],
                  message: comment,
                })
                req.onsuccess = () => resolve(req.result)
                req.onerror = () => reject(req.error)
              }
            )
            const last_event = await new Promise((resolve, reject) => {
              const req = events.get(eventId)
              req.onsuccess = () => resolve(req.result)
              req.onerror = () => reject(req.error)
            })
            const result = await new Promise((resolve, reject) => {
              if (!Array.isArray(todo.comments)) todo.comments = []
              todo.comments.push(comment)
              const req = todos.put({ ...todo, last_event })
              req.onsuccess = () => resolve(req.result)
              req.onerror = () => reject(req.error)
            })
            await new Promise<void>((resolve, reject) => {
              tran.oncomplete = () => resolve()
              tran.onerror = () => reject(tran.error)
            })
            eventStream.dispatchEvent(
              new CustomEvent('event', { detail: last_event })
            )
            return new Response(JSON.stringify(result), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          })()
        )
      }
    } else if (/^\/todos\/[^\/]+\/events$/.test(url.pathname)) {
      const id = url.pathname.match(/^\/todos\/([^\/]+)/)?.[1]
      if (!id) throw Error('invalid id.')
      if (req.method === 'GET') {
        console.log('GET /todos/:id/events', id, typeof id)
        ev.respondWith(
          (async function () {
            const db = await dbOpen
            const ids = db
              .transaction('events')
              .objectStore('events')
              .index('id_index')

            const data = await new Promise((resolve, reject) => {
              const req = ids.getAll(id)
              req.onsuccess = () => resolve(req.result)
              req.onerror = () => reject(req.error)
            })

            return new Response(JSON.stringify(data), { status: 200 })
          })()
        )
      }
    }
  }
})
