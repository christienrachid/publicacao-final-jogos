export class Sprite {
  constructor(runtime, type, layer, x, y) {
    Object.defineProperty(this, 'runtime', {value: runtime});
    Object.assign(this, {type, layer, x, y, width: 1, height: 1, angle: 0,
      opacity: 1, colorRgb: [1, 1, 1], isVisible: true, destroyed: false, text: '',
      fontFace: 'Metal Mania', sizePt: 12, fontColor: [1, 1, 1], horizontalAlign: 'left',
      verticalAlign: 'top', lineHeight: 0, frame: 0});
    this.definition = runtime.manifest.types[type];
    this.setAnimation(this.definition.animations[0]?.name);
  }
  setAnimation(name) {
    if (!name) return;
    const animation = this.definition.animations.find(a => a.name === name);
    if (!animation) throw Error(this.type + ': animação desconhecida ' + name);
    this.animationName = name;
    this.animation = animation;
    this.animationFrame = 0;
  }
  get animationFrame() { return this.frame; }
  set animationFrame(index) {
    const frame = this.animation?.frames[index];
    if (this.animation && !frame) throw Error(this.type + ': quadro inválido ' + index);
    this.frame = index;
    if (frame) {
      this.originX = frame.originX;
      this.originY = frame.originY;
      this.image = frame.image;
    }
  }
  setSize(width, height) { this.width = width; this.height = height; }
  setPosition(x, y) { this.x = x; this.y = y; }
  stopAnimation() {}
  destroy() {
    this.destroyed = true;
    this.isVisible = false;
    const list = this.runtime.instances;
    const index = list.indexOf(this);
    if (index >= 0) list.splice(index, 1);
  }
  moveAdjacentToInstance(other, after) {
    if (this === other || this.layer !== other.layer) return;
    const list = this.runtime.instances;
    const index = list.indexOf(this);
    if (index < 0) return;
    list.splice(index, 1);
    list.splice(list.indexOf(other) + Number(after), 0, this);
  }
}

export function createRuntime(manifest, canvas) {
  const listeners = new Map();
  const runtime = {
    manifest, instances: [], objects: {}, dt: 0,
    assets: {getProjectFileUrl: file => new URL('files/' + encodeURIComponent(file), location.href).href},
    addEventListener(event, callback) {
      const list = listeners.get(event) || [];
      list.push(callback);
      listeners.set(event, list);
    },
    emit(event, data) { return Promise.all((listeners.get(event) || []).map(callback => callback(data))); },
    layout: {
      scrollX: 640, scrollY: 360,
      getLayer(name) {
        return {cssPxToLayer(clientX, clientY) {
          const box = canvas.getBoundingClientRect();
          const x = (clientX - box.left) / box.width * 1280;
          const y = (clientY - box.top) / box.height * 720;
          return [x + (name === 'Mundo' ? runtime.layout.scrollX - 640 : 0),
            y + (name === 'Mundo' ? runtime.layout.scrollY - 360 : 0)];
        }};
      },
    },
  };
  for (const type of Object.keys(manifest.types)) {
    const live = () => runtime.instances.filter(i => i.type === type && !i.destroyed);
    runtime.objects[type] = {
      getAllInstances: live,
      getFirstInstance: () => live()[0],
      createInstance(layer, x, y) {
        const sprite = new Sprite(runtime, type, layer, x, y);
        runtime.instances.push(sprite);
        return sprite;
      },
    };
  }
  for (const layer of manifest.layers) {
    for (const seed of layer.instances) {
      const item = runtime.objects[seed.type].createInstance(layer.name, seed.world.x, seed.world.y);
      Object.assign(item, seed.world, {
        isVisible: seed.properties['initially-visible'],
        colorRgb: seed.world.color.slice(0, 3),
      });
      item.setAnimation(seed.properties['initial-animation']);
      item.animationFrame = seed.properties['initial-frame'] || 0;
    }
  }
  return runtime;
}

export class ImageStore {
  constructor(renderer,{maxDimension=()=>Infinity,memoryBudget=600}={}) {
    this.renderer = renderer;
    this.entries = new Map();
    this.pinned = new Set();
    this.queue = [];
    this.active = 0;
    this.bytes = 0;
    this.failed = null;
    this.maxDimension=maxDimension;
    this.memoryBudget=memoryBudget*1048576;
  }
  request(path, required = false) {
    let entry = this.entries.get(path);
    if (!entry) {
      entry = {path, last: this.renderer.frame, texture: null, failed: false};
      entry.promise = new Promise((resolve, reject) => Object.assign(entry, {resolve, reject}));
      entry.promise.catch(() => {});
      this.entries.set(path, entry);
      this.queue.push(entry);
      this.pump();
    }
    entry.last = this.renderer.frame;
    if (required && entry.failed) {
      this.entries.delete(path);
      return this.request(path, required);
    }
    return entry;
  }
  pump() {
    while (this.active < 8 && this.queue.length) {
      const entry = this.queue.shift();
      this.active++;
      this.load(entry).finally(() => { this.active--; this.pump(); });
    }
  }
  async load(entry) {
    try {
      const response = await fetch(entry.path);
      if (!response.ok) throw Error('Falha ao carregar ' + entry.path + ' (' + response.status + ')');
      let bitmap = await createImageBitmap(await response.blob(), {premultiplyAlpha: 'none'});
      const limit=this.maxDimension(entry.path),scale=Math.min(1,limit/Math.max(bitmap.width,bitmap.height));
      if(scale<1){
        const smaller=await createImageBitmap(bitmap,{resizeWidth:Math.max(1,Math.round(bitmap.width*scale)),resizeHeight:Math.max(1,Math.round(bitmap.height*scale)),resizeQuality:'high',premultiplyAlpha:'none'}).catch(()=>null);
        if(smaller){bitmap.close();bitmap=smaller;}
      }
      entry.bytes = bitmap.width * bitmap.height * 4;
      entry.texture = this.renderer.upload(bitmap);
      bitmap.close();
      this.bytes += entry.bytes;
      entry.resolve();
    } catch (error) {
      entry.failed = true;
      this.failed = error;
      entry.reject(error);
    }
  }
  async preload(paths, progress = () => {}) {
    let loaded = 0;
    const unique = [...new Set(paths)];
    this.pinned = new Set(unique);
    await Promise.all(unique.map(async path => {
      await this.request(path, true).promise;
      progress(++loaded / unique.length);
    }));
  }
  trim() {
    if (this.bytes < this.memoryBudget) return;
    for (const [path, entry] of this.entries) {
      if (entry.texture && !this.pinned.has(path) && this.renderer.frame - entry.last > 600) {
        this.renderer.gl.deleteTexture(entry.texture);
        this.bytes -= entry.bytes;
        this.entries.delete(path);
        if (this.bytes < this.memoryBudget*.72) break;
      }
    }
  }
}
