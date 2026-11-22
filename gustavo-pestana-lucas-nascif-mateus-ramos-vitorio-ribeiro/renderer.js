const WIDTH = 1280, HEIGHT = 720;
const VERTEX = 'attribute vec2 position; attribute vec2 texcoord; attribute vec4 color; varying vec2 uv; varying vec4 tint; void main(){gl_Position=vec4(position.x/640.0-1.0,1.0-position.y/360.0,0.0,1.0);uv=texcoord;tint=color;}';
const FRAGMENT = 'precision mediump float; varying vec2 uv; varying vec4 tint; uniform sampler2D image; void main(){gl_FragColor=texture2D(image,uv)*tint;}';

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
  return shader;
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', {alpha: false, antialias: false, premultipliedAlpha: false});
    if (!this.gl) throw Error('Ative a aceleração gráfica do navegador para abrir o jogo.');
    const gl = this.gl;
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (const [name, count, offset] of [['position', 2, 0], ['texcoord', 2, 8], ['color', 4, 16]]) {
      const attribute = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, count, gl.FLOAT, false, 32, offset);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1i(gl.getUniformLocation(program, 'image'), 0);
    this.vertices = new Float32Array(48 * 4096);
    this.used = 0;
    this.frame = 0;
    this.textCache = new Map();
    this.white = this.upload(new Uint8Array([255, 255, 255, 255]), 1, 1);
    this.resize();
  }
  resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(this.canvas.clientWidth * ratio));
    const height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }
  upload(source, width, height) {
    this.flush();
    const gl = this.gl;
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    if (width) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.bound = null;
    return texture;
  }
  flush() {
    if (!this.used) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.bound);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertices.subarray(0, this.used), gl.DYNAMIC_DRAW);
    gl.drawArrays(gl.TRIANGLES, 0, this.used / 8);
    this.used = 0;
  }
  quad(texture, item, camera) {
    const width = item.width, height = item.height;
    if (!width || !height || item.opacity <= 0) return;
    const angle = item.angle || 0, cos = Math.cos(angle), sin = Math.sin(angle);
    const x = item.x - camera, y = item.y;
    const left = -(item.originX || 0) * width, top = -(item.originY || 0) * height;
    const corners = [[left, top], [left + width, top], [left + width, top + height], [left, top + height]]
      .map(([px, py]) => [x + px * cos - py * sin, y + px * sin + py * cos]);
    if (Math.max(...corners.map(p => p[0])) < 0 || Math.min(...corners.map(p => p[0])) > WIDTH ||
        Math.max(...corners.map(p => p[1])) < 0 || Math.min(...corners.map(p => p[1])) > HEIGHT) return;
    if (this.bound !== texture || this.used + 48 > this.vertices.length) {
      this.flush();
      this.bound = texture;
    }
    const [r, g, b] = item.colorRgb || [1, 1, 1], alpha = item.opacity ?? 1;
    const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      this.vertices.set([...corners[index], ...uv[index], r, g, b, alpha], this.used);
      this.used += 8;
    }
  }
  label(item) {
    const original = String(item.text || '');
    if (!original) return null;
    const key = JSON.stringify([original, item.width, item.height, item.sizePt,
      item.horizontalAlign, item.verticalAlign, item.lineHeight, item.fontFace]);
    let entry = this.textCache.get(key);
    if (entry) { entry.last = this.frame; return entry.texture; }
    this.flush();
    const stamp = document.createElement('canvas');
    stamp.width = Math.max(1, Math.ceil(Math.abs(item.width) * 2));
    stamp.height = Math.max(1, Math.ceil(Math.abs(item.height) * 2));
    const ctx = stamp.getContext('2d');
    ctx.scale(2, 2);
    const size = (item.sizePt || 12) * 4 / 3;
    ctx.font = size + 'px "' + (item.fontFace || 'Metal Mania') + '"';
    ctx.textBaseline = 'middle';
    ctx.textAlign = item.horizontalAlign === 'center' ? 'center' : item.horizontalAlign === 'right' ? 'right' : 'left';
    const outline = /\[outlineback=([^\]]+)\]/.exec(original)?.[1];
    const value = original.replace(/\[\/?outlineback[^\]]*\]/g, '');
    const lines = [];
    for (const paragraph of value.split('\n')) {
      let line = '';
      for (const word of paragraph.split(' ')) {
        const joined = line ? line + ' ' + word : word;
        if (line && ctx.measureText(joined).width > Math.abs(item.width) - 4) {
          lines.push(line);
          line = word;
        } else line = joined;
      }
      lines.push(line);
    }
    const lineHeight = size * 1.2 + (item.lineHeight || 0);
    const total = lines.length * lineHeight;
    const base = item.verticalAlign === 'center' ? (Math.abs(item.height) - total) / 2 :
      item.verticalAlign === 'bottom' ? Math.abs(item.height) - total : 0;
    const x = ctx.textAlign === 'center' ? Math.abs(item.width) / 2 :
      ctx.textAlign === 'right' ? Math.abs(item.width) - 2 : 2;
    ctx.fillStyle = '#ffffff';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.7;
    ctx.strokeStyle = outline || '#100b16';
    lines.forEach((line, index) => {
      const y = base + index * lineHeight + lineHeight / 2;
      if (outline) ctx.strokeText(line, x, y);
      ctx.fillText(line, x, y);
    });
    entry = {texture: this.upload(stamp), last: this.frame};
    this.textCache.set(key, entry);
    return entry.texture;
  }
  begin() {
    this.frame++;
    this.resize();
    this.gl.clearColor(.025, .016, .035, 1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }
  end() {
    this.flush();
    if (this.textCache.size > 450) {
      for (const [key, entry] of this.textCache) {
        if (this.frame - entry.last > 90) {
          this.gl.deleteTexture(entry.texture);
          this.textCache.delete(key);
        }
      }
    }
    this.bound = null;
  }
}
