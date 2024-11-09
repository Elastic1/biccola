const scripts = document.querySelectorAll('script')
const index = Array.from(scripts).findIndex(s => s.innerHTML.includes('_pdata_ = '))
const script = scripts[index].innerHTML
const pdataObj = script.split(`_pdata_ = `)[1].split(' var ')[0]
window.$main = async (pdata) => {
  const urlList = []
  try {
    for (let i = 0; i < pdata.img.length; i++) {
      const img = pdata.img[i]
      const url = img.path.includes('https') ? img.path : `https:${img.path}`
      const image = await _loadImage(await toDataURL(url))
      const canvas = _unscramble(image, 50, await _getSeed(img.path))
      const blob = await _canvasToBlob(canvas)
      const dataURI = URL.createObjectURL(blob)
      urlList.push(dataURI)
      chrome.runtime.sendMessage({ type: 'progress', current: i + 1, total: pdata.img.length })
    }
    const zipBlob = await createZipBlob(urlList)
    const zipUrl = URL.createObjectURL(zipBlob)
    const zipName = `${pdata.title}.zip`
    chrome.runtime.sendMessage({ type: 'download', zipUrl, zipName })
  } catch (error) {
    chrome.runtime.sendMessage({ type: 'error' })
    throw error
  } finally {
    urlList.forEach(url => {
      URL.revokeObjectURL(url)
    })
  }
}

function downloadStart() {
  setTimeout(`window.$main(${pdataObj})`, 0)
}

function zipGenerateAsync(zip) {
  return new Promise((resolve, reject) => {
    zip.generateAsync({ type: 'blob' }).then(resolve)
  })
}

async function createZipBlob(urlList) {
  const zip = new JSZip()

  for (let i = 0; i < urlList.length; i++) {
    const imageFile = await fetch(urlList[i]).then(res => res.arrayBuffer())
    const fileName = i + '.jpg'

    zip.file(fileName, imageFile, { binary: true })
  }

  return await zipGenerateAsync(zip)
}

function _canvasToBlob(canvas) {
  return new Promise(resolve => {
    canvas.toBlob(data => {
      resolve(data)
    }, 'image/jpeg')
  })
}

function toDataURL(url) {
  return fetch(url)
    .then(response => {
      console.log(response, url)
      return response.blob()
    })
    .then(blob => new Promise((resolve, reject) => {
      console.log({ blob })
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    }))
}

function _loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = error => reject(error)
    image.src = url
  })
}

async function _getSeed(url) {
  const uri = new URL(url.startsWith('http') ? url : 'https:' + url)
  let checksum = url.split('/').slice(-2)[0]
  const expires = uri.searchParams.get('expires')
  const total = expires.split('').reduce((total, num2) => total + parseInt(num2), 0)
  const ch = total % checksum.length
  checksum = checksum.slice(ch * -1) + checksum.slice(0, ch * -1)
  return _dd(checksum)
}
const magic = 'AGFzbQEAAAABBgFgAn9/AAMCAQAFAwEAEQcPAgZtZW1vcnkCAAJkZAAACk0BSwECfwNAIAEgAkcEQEEBIAJ0QcfFxQFxRSACQRVLckUEQCAAIAJqIgMgAy0AACIDIANBAXRBAnFrQQFqOgAACyACQQFqIQIMAQsLCwA7CXByb2R1Y2VycwEMcHJvY2Vzc2VkLWJ5AgZ3YWxydXMGMC4yMC4zDHdhc20tYmluZGdlbgYwLjIuODk='

let wasm

async function init() {
  if (wasm != null) {
    return
  }
  const buf = base64ToArrayBuffer(magic)
  const res = await WebAssembly.instantiate(buf, {})
  wasm = res.instance.exports
}

function base64ToArrayBuffer(base64) {
  var binaryString = atob(base64)
  var bytes = new Uint8Array(binaryString.length)
  for (var i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

async function _dd(seed) {
  await init()
  const enc = new TextEncoder('utf-8')
  const bytes = new Uint8Array(wasm.memory.buffer, 0, seed.length)
  bytes.set(enc.encode(seed))
  wasm.dd(bytes.byteOffset, bytes.length)
  const dec = new TextDecoder('utf-8')
  return dec.decode(bytes)
}


// from https://github.com/webcaetano/image-scramble/blob/master/unscrambleImg.js
function _unscramble(img, sliceSize, seed) {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = img.width
  canvas.height = img.height
  const totalParts = Math.ceil(img.width / sliceSize) * Math.ceil(img.height / sliceSize)
  const inds = []
  for (let i = 0; i < totalParts; i++) {
    inds.push(i)
  }

  const slices = getSlices(img, sliceSize)
  for (const g in slices) {
    const group = getGroup(slices[g])
    let shuffleInd = []
    for (let i = 0; i < slices[g].length; i++) {
      shuffleInd.push(i)
    }
    shuffleInd = _shuffleSeed_(shuffleInd, seed)
    for (let i = 0; i < slices[g].length; i++) {
      const s = shuffleInd[i]
      const row = Math.floor(s / group.cols)
      const col = s - row * group.cols
      const x = col * slices[g][i].width
      const y = row * slices[g][i].height
      ctx.drawImage(
        img,
        group.x + x,
        group.y + y,
        slices[g][i].width,
        slices[g][i].height,
        slices[g][i].x,
        slices[g][i].y,
        slices[g][i].width,
        slices[g][i].height
      )
    }
  }
  return canvas
}

function getGroup(slices) {
  const self = {}
  self.slices = slices.length
  self.cols = getColsInGroup(slices)
  self.rows = slices.length / self.cols
  self.width = slices[0].width * self.cols
  self.height = slices[0].height * self.rows
  self.x = slices[0].x
  self.y = slices[0].y
  return self
}

function getSlices(img, sliceSize) {
  const totalParts = Math.ceil(img.width / sliceSize) * Math.ceil(img.height / sliceSize)
  const verticalSlices = Math.ceil(img.width / sliceSize)
  const slices = {}
  for (let i = 0; i < totalParts; i++) {
    const slice = {}
    const row = Math.floor(i / verticalSlices)
    const col = i - row * verticalSlices
    slice.x = col * sliceSize
    slice.y = row * sliceSize
    slice.width = sliceSize - (slice.x + sliceSize <= img.width ? 0 : slice.x + sliceSize - img.width)
    slice.height = sliceSize - (slice.y + sliceSize <= img.height ? 0 : slice.y + sliceSize - img.height)
    const key = `${slice.width}-${slice.height}`
    if (slices[key] == null) {
      slices[key] = []
    }
    slices[key].push(slice)
  }
  return slices
}

function getColsInGroup(slices) {
  if (slices.length == 1) {
    return 1
  }
  let t = 'init'
  for (let i = 0; i < slices.length; i++) {
    if (t == 'init') {
      t = slices[i].y
    }
    if (t != slices[i].y) {
      return i
    }
  }
  return slices.length
}

// from https://github.com/webcaetano/shuffle-seed
function _shuffleSeed_(arr, seed) {
  const size = arr.length
  const rng = _seedrandom_(seed)
  const resp = []
  const keys = []
  for (let i = 0; i < size; i++) keys.push(i)
  for (let i = 0; i < size; i++) {
    const r = Math.floor(rng() * keys.length)
    const g = keys[r]
    keys.splice(r, 1)
    resp.push(arr[g])
  }
  return resp
}

// from https://github.com/davidbau/seedrandom
var width = 256,
  chunks = 6,
  digits = 52,
  startdenom = Math.pow(width, chunks),
  significance = Math.pow(2, digits),
  overflow = significance * 2,
  mask = width - 1

function _seedrandom_(seed) {
  var key = []
  mixkey(seed, key)
  var arc4 = new ARC4(key)
  var prng = function () {
    var n = arc4.g(chunks),
      d = startdenom,
      x = 0
    while (n < significance) {
      n = (n + x) * width
      d *= width
      x = arc4.g(1)
    }
    while (n >= overflow) {
      n /= 2
      d /= 2
      x >>>= 1
    }
    return (n + x) / d
  }
  return prng
}

function ARC4(key) {
  var t, keylen = key.length,
    me = this, i = 0, j = me.i = me.j = 0, s = me.S = []

  if (!keylen) {
    key = [keylen++]
  }

  while (i < width) {
    s[i] = i++
  }
  for (i = 0; i < width; i++) {
    s[i] = s[j = mask & j + key[i % keylen] + (t = s[i])]
    s[j] = t
  }

  (me.g = function (count) {
    var t, r = 0,
      i = me.i, j = me.j, s = me.S
    while (count--) {
      t = s[i = mask & i + 1]
      r = r * width + s[mask & (s[i] = s[j = mask & j + t]) + (s[j] = t)]
    }
    me.i = i; me.j = j
    return r
  })(width)
}

function mixkey(seed, key) {
  var stringseed = seed + '', smear, j = 0
  while (j < stringseed.length) {
    key[mask & j] =
      mask & (smear ^= key[mask & j] * 19) + stringseed.charCodeAt(j++)
  }
  return String.fromCharCode.apply(0, key)
}