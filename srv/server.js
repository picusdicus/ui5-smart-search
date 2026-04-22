const cds = require('@sap/cds')

cds.on('bootstrap', app => {
    app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', 'http://localhost:8080')
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', '*')
        res.setHeader('Access-Control-Expose-Headers', 'x-csrf-token')
        if (req.method === 'OPTIONS') {
            res.sendStatus(204)
            return
        }
        next()
    })
})

module.exports = cds.server
