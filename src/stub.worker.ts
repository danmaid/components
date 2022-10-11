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
      })
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
    await Promise.all(
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
    )
  }
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

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
        // } else if (req.method === 'POST') {
        //   console.debug('POST /todos/')
        //   const id = new Date().toISOString()
        //   ev.respondWith(
        //     (async function () {
        //       const todo = await req.json()
        //       const event = { ...todo, id, date: new Date(), type: 'created' }
        //       events.push(event)
        //       todos.push({ ...todo, id, last_event: event })
        //       return new Response(JSON.stringify(event), {
        //         status: 201,
        //         headers: { 'Content-Type': 'application/json' },
        //       })
        //     })()
        //   )
      }
    } else if (/^\/todos\/[^\/]+$/.test(url.pathname)) {
      const id = url.pathname.match(/^\/todos\/([^\/]+)$/)?.[1]
      if (!id) throw Error('invalid id.')
      if (req.method === 'PATCH') {
        console.log('PATCH /todos/:id', id)
        //     const todo = todos.find((v) => v.id === id)
        //     if (!todo) return ev.respondWith(new Response(null, { status: 404 }))
        //     ev.respondWith(
        //       (async function () {
        //         const patch = await req.json()
        //         const event = {
        //           id,
        //           date: new Date(),
        //           type: 'updated',
        //           keys: Object.keys(patch),
        //         }
        //         Object.assign(todo, patch, { last_event: event })
        //         return new Response(JSON.stringify(event), {
        //           status: 200,
        //           headers: { 'Content-Type': 'application/json' },
        //         })
        //       })()
        //     )
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
      // } else if (/^\/todos\/[^\/]+\/comments$/.test(url.pathname)) {
      //   const id = url.pathname.match(/^\/todos\/([^\/]+)/)?.[1]
      //   if (req.method === 'POST') {
      //     console.log('POST /todos/:id/comments', id)
      //     const todo = todos.find((v) => v.id === id)
      //     if (!todo) return ev.respondWith(new Response(null, { status: 404 }))
      //     ev.respondWith(
      //       (async function () {
      //         const comment = await req.text()
      //         if (!Array.isArray(todo.comments)) todo.comments = []
      //         todo.comments.push(comment)
      //         todo.last_action = {
      //           date: new Date(),
      //           type: 'updated',
      //           keys: ['comments'],
      //           message: comment,
      //         }
      //         return new Response(null, { status: 200 })
      //       })()
      //     )
      //   }
      // } else if (/^\/todos\/[^\/]+\/events$/.test(url.pathname)) {
      //   const id = url.pathname.match(/^\/todos\/([^\/]+)/)?.[1]
      //   if (req.method === 'GET') {
      //     console.log('GET /todos/:id/events', id)
      //     const data = events.filter((v) => v.id === id)
      //     ev.respondWith(new Response(JSON.stringify(data), { status: 200 }))
      //   }
    }
  }
})
