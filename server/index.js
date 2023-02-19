const express = require('express')
const app = express()
const server = require('http').createServer(app)
const WebSocket = require('ws') 
const fs = require('fs');

const cors = require('cors')
app.use(cors())

const wss = new WebSocket.Server({ server: server })

const queueFile = './_queue-info.txt'

app.get('/', function (req, res) {
    res.send('Hello World')
})

app.get('/windows/:num/queue', (req, res) => {
    queue(req.params.num).then(queue => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(queue));
    })
})

app.get('/windows/:num/queue/next', (req, res) => {
    callNextQueue(req.params.num).then(allQueue => {
        let q = allQueue.filter(a => a.window == req.params.num && a.serving == 1).shift()
        broadcast()
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(q||[]));
    })
})

app.get('/windows/:num/queue/:queue/finish', (req, res) => {
    finish(req.params.num, req.params.queue)
    res.end(JSON.stringify({ success: true }))
})


app.get('/queue', function (req, res) {
    getCurrentQueue().then(data => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    })
})

app.get('/queue/all', function (req, res) {
    getQueueData().then(data => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    })
})

wss.on('connection', function connection(ws) {
    ws.on('error', console.error)
    console.log('client connected')
})

function updateQueueInfo(queueInfo) {
    fs.writeFileSync(queueFile, JSON.stringify(queueInfo))
}

function callNextQueue(window) {
    return new Promise(resolve => {
        getQueueData().then(qdata => {
            // set serving = 1 and remove the currently being served queue
            let done = 0;
            updateQueueInfo(
                qdata.map(q => {
                    if (window == q.window && q.serving == 1) {
                        q.serving = -1
                    }
                    if (window == q.window && q.serving == 0 && !done) {
                        q.serving = 1
                        done = 1
                    }
                    return q
                })
            )
            resolve(qdata)
        })
    })
}

function queueData(data) {
    return {
        queueNumber: data.queueNumber || null, 
        window: data.window || null,
        serving: data.serving || 0, 
        date: data.date || new Date
    }
}

function getQueueData() {
    return new Promise(resolve => {
        fs.readFile(queueFile, 'utf8', function(err, queueStr) {
            let output = JSON.parse(queueStr)
            output = output.map(q => new queueData(q))
            resolve(output)
        })
    })
}

// create queue
function queue(window) {
    return new Promise(resolve => {
        fs.readFile(queueFile, 'utf8', function(err, queueStr) {
            getQueueData().then(qinfo => {

                let qnumber = qinfo.reduce((acc, curval) => acc = curval.queueNumber, 0)

                let newQueue = new queueData({
                    queueNumber: qnumber + 1,
                    window: window
                })
    
                qinfo.push(newQueue)

                updateQueueInfo(qinfo)
                broadcast()
                resolve(newQueue)
            })
        })
    })
}

// finish queue
function finish(window, queue) {
    fs.readFile(queueFile, 'utf8', function(err, queueStr) {
        let queueInfo = JSON.parse(queueStr)
        queueInfo = queueInfo.map(q => {
            if (q.queueNumber == queue) {
                q.serving = -1
            }
            return q
        })
        updateQueueInfo(queueInfo)
        broadcast()
    });
}

// broadcast to clients
function broadcast() {
    getCurrentQueue().then(o => {
        wss.clients.forEach(function each(client) {
            client.send(JSON.stringify(o))
        })
    })
    
}

function getCurrentQueue() {
    return new Promise(resolve => {
        getQueueData().then(o => resolve(o.filter(q => q.serving == 1)))
    })
}

server.listen(80)