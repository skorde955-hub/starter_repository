/* eslint-disable no-console */
import http from 'http'
import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function decodeDataUrl(dataUrl) {
  const match = /^data:(.+);base64,(.*)$/i.exec(dataUrl || '')
  if (!match) {
    throw new Error('Invalid data URL provided')
  }
  return {
    mime: match[1],
    buffer: Buffer.from(match[2], 'base64'),
  }
}

const UNIVERSAL_BODY_ASSET = path.posix.join('img', 'caricature-bodies', 'body-varun.png')
const UNIVERSAL_BODY_PUBLIC_PATH = `/${UNIVERSAL_BODY_ASSET}`
const UNIVERSAL_FACE_RECT = {
  x: 0.204,
  y: -0.375,
  width: 0.72,
  height: 0.7,
}
const UNIVERSAL_FACE_CLIP = {
  x: 0.5,
  y: 0.68,
}
const UNIVERSAL_FACE_ROTATION = 0

class Boss {
  constructor({
    id,
    name,
    role,
    description = '',
    image,
    parodyImage,
    stageComposite,
    assets,
    metrics = {},
    createdAt = new Date().toISOString(),
  }) {
    this.id = id
    this.name = name
    this.role = role
    this.description = description
    this.image = image
    this.parodyImage = parodyImage ?? image
    this.stageComposite = stageComposite
    this.assets = assets ?? {}
    this.metrics = {
      totalHits: 0,
      ...metrics,
    }
    this.createdAt = createdAt
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      role: this.role,
      description: this.description,
      image: this.image,
      parodyImage: this.parodyImage,
      stageComposite: this.stageComposite,
      assets: this.assets,
      metrics: this.metrics,
      createdAt: this.createdAt,
    }
  }
}

class FileSystemBossRepository {
  constructor({ dataFile, seedFile }) {
    this.dataFile = dataFile
    this.seedFile = seedFile
    ensureDirSync(path.dirname(this.dataFile))
    this._bosses = this._load()
  }

  _load() {
    if (fs.existsSync(this.dataFile)) {
      const raw = fs.readFileSync(this.dataFile, 'utf-8')
      return JSON.parse(raw).map((item) => new Boss(item))
    }
    const seed = fs.existsSync(this.seedFile)
      ? JSON.parse(fs.readFileSync(this.seedFile, 'utf-8'))
      : []
    const bosses = seed.map((item) => new Boss(item))
    this._persist(bosses)
    return bosses
  }

  _persist(bosses) {
    fs.writeFileSync(this.dataFile, JSON.stringify(bosses.map((b) => b.toJSON()), null, 2))
  }

  findAll() {
    return this._bosses.map((boss) => new Boss(boss))
  }

  add(boss) {
    this._bosses.push(boss)
    this._persist(this._bosses)
    return boss
  }

  incrementHit(id) {
    const boss = this._bosses.find((item) => item.id === id)
    if (!boss) {
      throw new Error('Boss not found')
    }
    boss.metrics.totalHits = (boss.metrics.totalHits ?? 0) + 1
    this._persist(this._bosses)
    return boss
  }
}

class AssetPipeline {
  constructor({ projectRoot, uploadsDir }) {
    this.projectRoot = projectRoot
    this.uploadsDir = uploadsDir
    ensureDirSync(this.uploadsDir)
  }

  async prepareAssets(bossId, payload) {
    const bossDir = path.join(this.uploadsDir, bossId)
    ensureDirSync(bossDir)

    const mugshotPath = path.join(bossDir, 'mugshot.png')
    const faceOutputPath = path.join(bossDir, 'face.png')
    const metadataPath = path.join(bossDir, 'metadata.json')
    const universalBodyPath = path.join(this.projectRoot, 'public', UNIVERSAL_BODY_ASSET)

    const mugshotDecoded = decodeDataUrl(payload.mugshotDataUrl)
    fs.writeFileSync(mugshotPath, mugshotDecoded.buffer)

    await this.runCropUtility({
      mugshot: mugshotPath,
      body: universalBodyPath,
      faceOut: faceOutputPath,
      metadataOut: metadataPath,
    })

    const stageComposite = this.computeStageComposite({
      bodyPublicPath: UNIVERSAL_BODY_PUBLIC_PATH,
      facePublicPath: this.publicPath(faceOutputPath),
    })

    return {
      stageComposite,
      assets: {
        body: UNIVERSAL_BODY_PUBLIC_PATH,
        face: this.publicPath(faceOutputPath),
        mugshot: this.publicPath(mugshotPath),
      },
      previewImage: this.publicPath(faceOutputPath),
    }
  }

  async runCropUtility({ mugshot, body, faceOut, metadataOut }) {
    return new Promise((resolve, reject) => {
      const scriptPath = path.join(this.projectRoot, 'utils', 'cropfaceutil.py')
      const python = spawn('python3', [
        scriptPath,
        '--mugshot',
        mugshot,
        '--body',
        body,
        '--output-face',
        faceOut,
        '--metadata-out',
        metadataOut,
      ])

      let stderr = ''
      python.stderr.on('data', (chunk) => {
        stderr += chunk.toString()
      })

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`cropfaceutil exited with code ${code}: ${stderr}`))
        } else if (!fs.existsSync(faceOut) || !fs.existsSync(metadataOut)) {
          reject(new Error('Cropped face or metadata not generated'))
        } else {
          resolve(null)
        }
      })
    })
  }

  computeStageComposite({ bodyPublicPath, facePublicPath }) {
    return {
      base: bodyPublicPath,
      face: {
        src: facePublicPath,
        rect: {
          ...UNIVERSAL_FACE_RECT,
        },
        clipRadius: {
          ...UNIVERSAL_FACE_CLIP,
        },
        rotation: UNIVERSAL_FACE_ROTATION,
      },
    }
  }

  publicPath(absPath) {
    const rel = path.relative(path.join(this.projectRoot, 'public'), absPath)
    return `/${rel.replace(/\\/g, '/')}`
  }
}

class BossService {
  constructor({ repository, assetPipeline }) {
    this.repository = repository
    this.assetPipeline = assetPipeline
  }

  listBosses() {
    return this.repository.findAll()
  }

  async createBoss(payload) {
    const id = payload.id ?? randomUUID()
    const prepared = await this.assetPipeline.prepareAssets(id, payload)

    const boss = new Boss({
      id,
      name: payload.name,
      role: payload.role,
      description: payload.description ?? '',
      image: prepared.previewImage,
      parodyImage: prepared.previewImage,
      stageComposite: prepared.stageComposite,
      assets: prepared.assets,
      metrics: {
        totalHits: 0,
      },
    })

    this.repository.add(boss)
    return boss
  }

  recordHit(id) {
    return this.repository.incrementHit(id)
  }
}

class BossHttpServer {
  constructor({ service, port = 4000, publicDir }) {
    this.service = service
    this.port = port
    this.publicDir = publicDir
    this.server = http.createServer(this.requestHandler.bind(this))
  }

  async requestHandler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.statusCode = 204
      res.end()
      return
    }

    try {
      const url = new URL(req.url, `http://${req.headers.host}`)
      if (req.method === 'GET' && this.tryServeStatic(url.pathname, res)) {
        return
      }
      if (req.method === 'GET' && url.pathname === '/api/bosses') {
        const data = this.service.listBosses().map((boss) => boss.toJSON())
        this.json(res, 200, { bosses: data })
        return
      }

      if (req.method === 'POST' && url.pathname === '/api/bosses') {
        const body = await this.readJson(req)
        const boss = await this.service.createBoss(body)
        this.json(res, 201, { boss: boss.toJSON() })
        return
      }

      if (req.method === 'POST' && /^\/api\/bosses\/[^/]+\/hit$/.test(url.pathname)) {
        const id = url.pathname.split('/')[3]
        const boss = this.service.recordHit(id)
        this.json(res, 200, { boss: boss.toJSON() })
        return
      }

      this.json(res, 404, { error: 'Not found' })
    } catch (error) {
      console.error('Request error', error)
      this.json(res, 500, { error: error.message ?? 'Internal server error' })
    }
  }

  readJson(req) {
    return new Promise((resolve, reject) => {
      let raw = ''
      req.setEncoding('utf8')
      req.on('data', (chunk) => {
        raw += chunk
      })
      req.on('end', () => {
        try {
          resolve(JSON.parse(raw || '{}'))
        } catch (error) {
          reject(new Error('Invalid JSON payload'))
        }
      })
      req.on('error', reject)
    })
  }

  json(res, statusCode, payload) {
    res.statusCode = statusCode
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(payload))
  }

  tryServeStatic(pathname, res) {
    if (!this.publicDir) return false
    if (!pathname.startsWith('/uploads/')) return false
    const decoded = decodeURIComponent(pathname)
    const absolute = path.join(this.publicDir, decoded)
    if (!absolute.startsWith(this.publicDir)) {
      this.json(res, 403, { error: 'Forbidden' })
      return true
    }
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      return false
    }
    res.statusCode = 200
    res.setHeader('Content-Type', guessMimeType(absolute))
    const stream = fs.createReadStream(absolute)
    stream.pipe(res)
    stream.on('error', () => {
      this.json(res, 500, { error: 'Failed to read file' })
    })
    return true
  }

  listen() {
    this.server.listen(this.port, () => {
      console.log(`[boss-server] listening on http://localhost:${this.port}`)
    })
  }
}

function bootstrap() {
  const projectRoot = path.resolve(__dirname, '..')
  const repository = new FileSystemBossRepository({
    dataFile: path.join(__dirname, 'data', 'bosses.json'),
    seedFile: path.join(__dirname, 'data', 'seed-bosses.json'),
  })
  const assetPipeline = new AssetPipeline({
    projectRoot,
    uploadsDir: path.join(projectRoot, 'public', 'uploads'),
  })
  const service = new BossService({ repository, assetPipeline })
  const server = new BossHttpServer({
    service,
    port: process.env.PORT || 4000,
    publicDir: path.join(projectRoot, 'public'),
  })
  server.listen()
}

bootstrap()

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.json':
      return 'application/json'
    default:
      return 'application/octet-stream'
  }
}
