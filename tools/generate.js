// 치킨무 놀이터 2 - distribution.json 생성기
// GitHub Actions 에서 자동 실행됩니다. (직접 실행: node tools/generate.js https://아이디.github.io/저장소)
// 하는 일: mods/ 의 모드, defaults/ 의 기본 옵션, files/ 의 추가 파일, Fabric 로더(+라이브러리)를
//          site/ 폴더에 모으고, 런처가 읽는 site/distribution.json 을 만듭니다.
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const AdmZip = require('adm-zip')

const ROOT = path.join(__dirname, '..')
const OUT = path.join(ROOT, 'site')
const BASE = (process.argv[2] || process.env.SITE_BASE_URL || '').replace(/\/+$/, '')
const META = (process.env.FABRIC_META_BASE || 'https://meta.fabricmc.net').replace(/\/+$/, '')
if (!BASE) { console.error('사이트 주소가 필요합니다. 예: node tools/generate.js https://아이디.github.io/저장소'); process.exit(1) }

const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'server.config.json'), 'utf8'))

const md5 = b => crypto.createHash('md5').update(b).digest('hex')
const enc = p => p.split('/').map(encodeURIComponent).join('/')
const url = rel => `${BASE}/${enc(rel)}`

function put(rel, buf) {
    const dest = path.join(OUT, rel)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, buf)
    return { size: buf.length, MD5: md5(buf), url: url(rel) }
}
function walk(dir, base = dir) {
    if (!fs.existsSync(dir)) return []
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
        const p = path.join(dir, e.name)
        return e.isDirectory() ? walk(p, base) : [path.relative(base, p).split(path.sep).join('/')]
    }).sort()
}
async function getBuf(u) {
    const r = await fetch(u, { headers: { 'user-agent': 'chickenmoo-distribution-generator' } })
    if (!r.ok) throw new Error(`${r.status} ${u}`)
    return Buffer.from(await r.arrayBuffer())
}
const clean = s => String(s).replace(/[^A-Za-z0-9._-]/g, '_')

// maven 좌표 "group:artifact:version[:classifier]" -> 경로
function mavenPath(name) {
    const [g, a, v, c] = name.split(':')
    return `${g.replace(/\./g, '/')}/${a}/${v}/${a}-${v}${c ? '-' + c : ''}.jar`
}

async function buildFabric() {
    let loader = cfg.fabricLoaderVersion
    if (!loader || loader === 'latest') {
        const list = JSON.parse((await getBuf(`${META}/v2/versions/loader/${cfg.minecraftVersion}`)).toString())
        const pick = list.find(x => x.loader.stable) || list[0]
        if (!pick) throw new Error(`Fabric 이 ${cfg.minecraftVersion} 을 지원하지 않습니다.`)
        loader = pick.loader.version
    }
    console.log('Fabric loader', loader)
    const profile = JSON.parse((await getBuf(`${META}/v2/versions/loader/${cfg.minecraftVersion}/${loader}/profile/json`)).toString())

    const libs = []
    for (const lib of profile.libraries) {
        const rel = mavenPath(lib.name)
        const base = (lib.url || 'https://repo1.maven.org/maven2/').replace(/\/?$/, '/')
        const buf = await getBuf(base + rel)
        libs.push({ name: lib.name, rel: 'libraries/' + rel, art: put('libraries/' + rel, buf) })
    }
    const loaderIdx = libs.findIndex(l => l.name.startsWith('net.fabricmc:fabric-loader:'))
    if (loaderIdx < 0) throw new Error('fabric-loader 라이브러리를 찾지 못했습니다.')
    const [loaderLib] = libs.splice(loaderIdx, 1)

    const vrel = `versions/${profile.id}/${profile.id}.json`
    const manifest = put(vrel, Buffer.from(JSON.stringify(profile, null, 2)))

    return {
        id: loaderLib.name, name: `Fabric (fabric-loader ${loader})`, type: 'Fabric',
        artifact: loaderLib.art,
        subModules: [
            { id: profile.id, name: 'Fabric (version.json)', type: 'VersionManifest', artifact: manifest },
            ...libs.map(l => ({ id: l.name, name: l.name.split(':')[1], type: 'Library', artifact: l.art }))
        ]
    }
}

function buildMods() {
    const used = new Set()
    return walk(path.join(ROOT, 'mods')).filter(f => f.endsWith('.jar')).map(f => {
        const buf = fs.readFileSync(path.join(ROOT, 'mods', f))
        let modId, version, display
        try {
            const entry = new AdmZip(buf).getEntry('fabric.mod.json')
            const j = JSON.parse(entry.getData().toString('utf8').replace(/^﻿/, ''))
            modId = j.id; version = j.version; display = j.name
        } catch (e) { /* 아래 대체값 사용 */ }
        modId = clean(modId || f.replace(/\.jar$/, ''))
        version = clean(version || '1')
        let id = `com.chickenmoo.mods:${modId}:${version}`
        let n = 2
        while (used.has(id)) id = `com.chickenmoo.mods:${modId}-${n++}:${version}`
        used.add(id)
        const rel = `mods/${f}`
        return { id, name: display || modId, type: 'FabricMod', artifact: put(rel, buf) }
    })
}

function buildFileModules() {
    const mods = []
    // files/ : 매 실행마다 검사되어 항상 이 상태로 유지되는 파일 (예: 필수 리소스팩)
    for (const f of walk(path.join(ROOT, 'files'))) {
        const art = put(`files/${f}`, fs.readFileSync(path.join(ROOT, 'files', f)))
        mods.push({ id: `file:${f}`, name: f, type: 'File', artifact: { ...art, path: f } })
    }
    // defaults/ : 게임 폴더의 .launcher-defaults/files 에 보관되고, 버전이 바뀔 때 1회만 적용되는 기본 설정
    const defs = walk(path.join(ROOT, 'defaults'))
    if (defs.length) {
        const ver = put('defaults/VERSION', Buffer.from(String(cfg.defaultsVersion)))
        mods.push({ id: 'file:defaults-version', name: 'defaults VERSION', type: 'File', artifact: { ...ver, path: '.launcher-defaults/VERSION' } })
        for (const f of defs) {
            const art = put(`defaults/files/${f}`, fs.readFileSync(path.join(ROOT, 'defaults', f)))
            mods.push({ id: `file:defaults/${f}`, name: 'default ' + f, type: 'File', artifact: { ...art, path: `.launcher-defaults/files/${f}` } })
        }
    }
    return mods
}

;(async () => {
    fs.rmSync(OUT, { recursive: true, force: true })
    fs.mkdirSync(OUT, { recursive: true })

    const fabric = await buildFabric()
    const modules = [fabric, ...buildMods(), ...buildFileModules()]
    const icon = fs.existsSync(path.join(ROOT, 'icon.png')) ? put('icon.png', fs.readFileSync(path.join(ROOT, 'icon.png'))).url : ''

    const distro = {
        version: '1.0.0',
        rss: '',
        servers: [{
            id: cfg.serverId, name: cfg.serverName, description: cfg.description, icon,
            version: cfg.serverVersion, address: cfg.address, minecraftVersion: cfg.minecraftVersion,
            mainServer: true, autoconnect: true,
            javaOptions: { supported: '>=21', suggestedMajor: 21, ram: { recommended: cfg.ramRecommendedMB, minimum: cfg.ramMinimumMB } },
            modules
        }]
    }
    fs.writeFileSync(path.join(OUT, 'distribution.json'), JSON.stringify(distro, null, 2))
    fs.writeFileSync(path.join(OUT, '.nojekyll'), '')
    console.log(`완료: 모드 ${modules.filter(m => m.type === 'FabricMod').length}개, 파일 ${modules.filter(m => m.type === 'File').length}개 -> site/distribution.json`)
})().catch(e => { console.error('실패:', e.message); process.exit(1) })
