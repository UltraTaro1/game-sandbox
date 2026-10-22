import * as THREE from 'three'

/**
 * 全程序化音效：不加载任何音频文件，全部用 WebAudio 合成。
 * 这样单文件版本依然可以离线运行，体积也不会膨胀。
 *
 * 远处的声音会按距离衰减 + 低通 + 左右声像，能听出枪声从哪边来。
 */
export class AudioEngine {
  ctx: AudioContext | null = null
  muted = false
  paused = false
  /** 已播放次数，调试用 */
  played = 0

  private master!: GainNode
  private noise!: AudioBuffer
  private listenerPos = new THREE.Vector3()
  private right = new THREE.Vector3()
  private tmp = new THREE.Vector3()
  private tmp2 = new THREE.Vector3()

  private zoneDrone: { osc: OscillatorNode; gain: GainNode } | null = null
  private zonePulseTimer = 0

  // ---------------- 初始化 ----------------

  /** 必须由用户手势触发（浏览器策略） */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.55
      this.master.connect(ctx.destination)
      this.noise = this.makeNoise(2)
      this.startAmbience()
    } catch {
      this.ctx = null
    }
  }

  setMuted(mute: boolean): void {
    this.muted = mute
    this.applyGain()
  }

  /** 暂停时静音（不销毁上下文，回来立刻有声） */
  setPaused(p: boolean): void {
    if (p === this.paused) return
    this.paused = p
    this.applyGain()
  }

  private applyGain(): void {
    if (!this.ctx) return
    const v = this.muted || this.paused ? 0 : 0.55
    this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05)
  }

  toggleMute(): boolean {
    this.setMuted(!this.muted)
    return this.muted
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  private get t(): number {
    return this.ctx!.currentTime
  }

  private ready(): boolean {
    return this.ctx !== null && this.ctx.state !== 'closed'
  }

  /** 每帧更新听者位置，用于空间化 */
  updateListener(camera: THREE.Camera): void {
    if (!this.ready()) return
    camera.updateWorldMatrix(true, false)
    this.listenerPos.setFromMatrixPosition(camera.matrixWorld)
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
  }

  /** 距离 -> 音量 / 声像 / 截止频率 */
  private spatial(pos?: THREE.Vector3): { gain: number; pan: number; cutoff: number } {
    if (!pos) return { gain: 1, pan: 0, cutoff: 20000 }
    const d = this.listenerPos.distanceTo(pos)
    const gain = 1 / (1 + d * 0.055)
    this.tmp.subVectors(pos, this.listenerPos).normalize()
    const pan = THREE.MathUtils.clamp(this.tmp.dot(this.right) * 0.85, -0.95, 0.95)
    const cutoff = THREE.MathUtils.clamp(19000 * Math.exp(-d / 55), 700, 19000)
    return { gain, pan, cutoff }
  }

  // ---------------- 基础音色 ----------------

  private burst(o: {
    type: BiquadFilterType
    freq: number
    q?: number
    dur: number
    gain: number
    pan?: number
    cutoff?: number
    when?: number
    rate?: number
  }): void {
    if (!this.ready() || o.gain <= 0.0005) return
    const ctx = this.ctx!
    const t = ctx.currentTime + (o.when ?? 0)

    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    src.playbackRate.value = o.rate ?? 1

    const bp = ctx.createBiquadFilter()
    bp.type = o.type
    bp.frequency.value = o.freq
    bp.Q.value = o.q ?? 0.8

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = o.cutoff ?? 20000

    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t + 0.004)
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)

    const p = ctx.createStereoPanner()
    p.pan.value = o.pan ?? 0

    src.connect(bp)
    bp.connect(lp)
    lp.connect(g)
    g.connect(p)
    p.connect(this.master)

    src.start(t, Math.random() * 1.5)
    src.stop(t + o.dur + 0.03)
    this.played++
  }

  private tone(o: {
    from: number
    to?: number
    dur: number
    gain: number
    pan?: number
    type?: OscillatorType
    when?: number
  }): void {
    if (!this.ready() || o.gain <= 0.0005) return
    const ctx = this.ctx!
    const t = ctx.currentTime + (o.when ?? 0)

    const osc = ctx.createOscillator()
    osc.type = o.type ?? 'sine'
    osc.frequency.setValueAtTime(o.from, t)
    if (o.to !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t + o.dur)

    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(o.gain, t + 0.006)
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur)

    const p = ctx.createStereoPanner()
    p.pan.value = o.pan ?? 0

    osc.connect(g)
    g.connect(p)
    p.connect(this.master)
    osc.start(t)
    osc.stop(t + o.dur + 0.02)
    this.played++
  }

  // ---------------- 枪声 ----------------

  /** 玩家开枪：position 传 null 表示第一人称，永远最响 */
  shot(kind: 'rifle' | 'shotgun' | 'sniper', pos?: THREE.Vector3, isPlayer = true): void {
    if (!this.ready()) return
    const s = this.spatial(isPlayer ? undefined : pos)
    if (!isPlayer && s.gain < 0.06) return

    if (kind === 'rifle') {
      this.burst({ type: 'bandpass', freq: 2500, q: 0.7, dur: 0.12, gain: 0.75 * s.gain, pan: s.pan, cutoff: s.cutoff })
      this.burst({ type: 'lowpass', freq: 900, dur: 0.2, gain: 0.5 * s.gain, pan: s.pan, cutoff: s.cutoff, rate: 0.8 })
      this.tone({ from: 150, to: 55, dur: 0.1, gain: 0.55 * s.gain, pan: s.pan })
    } else if (kind === 'shotgun') {
      this.burst({ type: 'lowpass', freq: 1800, dur: 0.3, gain: 0.95 * s.gain, pan: s.pan, cutoff: s.cutoff, rate: 0.75 })
      this.burst({ type: 'bandpass', freq: 700, q: 0.5, dur: 0.36, gain: 0.5 * s.gain, pan: s.pan, cutoff: s.cutoff, when: 0.02 })
      this.tone({ from: 110, to: 40, dur: 0.26, gain: 0.8 * s.gain, pan: s.pan })
    } else {
      this.burst({ type: 'bandpass', freq: 3200, q: 0.6, dur: 0.1, gain: 0.9 * s.gain, pan: s.pan, cutoff: s.cutoff })
      this.tone({ from: 190, to: 60, dur: 0.16, gain: 0.5 * s.gain, pan: s.pan })
    }
  }

  /** 子弹打在地上/墙上 */
  impact(pos: THREE.Vector3): void {
    const s = this.spatial(pos)
    this.burst({ type: 'bandpass', freq: 3200, q: 1.4, dur: 0.05, gain: 0.18 * s.gain, pan: s.pan, cutoff: s.cutoff })
    this.burst({ type: 'lowpass', freq: 1200, dur: 0.08, gain: 0.1 * s.gain, pan: s.pan, cutoff: s.cutoff })
  }

  // ---------------- 反馈音 ----------------

  hit(head: boolean): void {
    this.tone({ from: head ? 1900 : 1250, to: head ? 1500 : 950, dur: 0.06, gain: 0.16, type: 'triangle' })
    if (head) this.tone({ from: 2600, to: 2100, dur: 0.05, gain: 0.1, when: 0.03, type: 'sine' })
  }

  hurt(): void {
    this.burst({ type: 'lowpass', freq: 700, dur: 0.18, gain: 0.35, cutoff: 1400 })
    this.tone({ from: 120, to: 60, dur: 0.2, gain: 0.3 })
  }

  kill(): void {
    this.tone({ from: 880, dur: 0.07, gain: 0.18, type: 'triangle' })
    this.tone({ from: 1320, dur: 0.1, gain: 0.16, type: 'triangle', when: 0.08 })
  }

  death(pos: THREE.Vector3): void {
    const s = this.spatial(pos)
    this.tone({ from: 320, to: 80, dur: 0.7, gain: 0.25 * s.gain, pan: s.pan, type: 'sawtooth' })
    this.burst({ type: 'lowpass', freq: 500, dur: 0.4, gain: 0.2 * s.gain, pan: s.pan, cutoff: s.cutoff })
  }

  // ---------------- 操作音 ----------------

  step(sprint: boolean): void {
    if (!this.ready()) return
    const f = 420 + Math.random() * 320
    this.burst({ type: 'bandpass', freq: f, q: 1.6, dur: 0.055, gain: sprint ? 0.11 : 0.07, pan: 0 })
  }

  switchWeapon(): void {
    this.burst({ type: 'bandpass', freq: 1800, q: 2, dur: 0.04, gain: 0.14 })
    this.burst({ type: 'bandpass', freq: 900, q: 2, dur: 0.05, gain: 0.1, when: 0.09 })
  }

  reloadStart(): void {
    this.burst({ type: 'bandpass', freq: 700, q: 2.4, dur: 0.07, gain: 0.16 })
    this.burst({ type: 'bandpass', freq: 420, q: 2, dur: 0.09, gain: 0.13, when: 0.16 })
  }

  reloadEnd(): void {
    this.burst({ type: 'bandpass', freq: 1400, q: 2.2, dur: 0.05, gain: 0.15 })
    this.burst({ type: 'bandpass', freq: 900, q: 2, dur: 0.06, gain: 0.12, when: 0.07 })
  }

  empty(): void {
    this.burst({ type: 'bandpass', freq: 2600, q: 3, dur: 0.03, gain: 0.1 })
  }

  /** 拾取：普通物品一个音，武器/护甲两个音 */
  pickup(rare = false): void {
    this.tone({ from: rare ? 760 : 620, to: rare ? 1040 : 780, dur: 0.09, gain: 0.12, type: 'triangle' })
    if (rare) this.tone({ from: 1240, dur: 0.1, gain: 0.1, type: 'triangle', when: 0.07 })
  }

  // ---------------- 环境 ----------------

  private startAmbience(): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 420

    const g = ctx.createGain()
    g.gain.value = 0.05

    // 缓慢的风声起伏
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.07
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 180
    lfo.connect(lfoGain)
    lfoGain.connect(lp.frequency)

    src.connect(lp)
    lp.connect(g)
    g.connect(this.master)
    src.start()
    lfo.start()
  }

  /** 站在圈外时低频警报 + 心跳般的脉冲 */
  setZoneOutside(on: boolean): void {
    if (!this.ready()) return
    if (on && !this.zoneDrone) {
      const ctx = this.ctx!
      const osc = ctx.createOscillator()
      osc.type = 'sawtooth'
      osc.frequency.value = 62
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 220
      const g = ctx.createGain()
      g.gain.value = 0.0001
      g.gain.setTargetAtTime(0.12, ctx.currentTime, 0.4)
      const p = ctx.createStereoPanner()
      osc.connect(lp)
      lp.connect(g)
      g.connect(p)
      p.connect(this.master)
      osc.start()
      this.zoneDrone = { osc, gain: g }
      this.zonePulseTimer = 0
    } else if (!on && this.zoneDrone) {
      const { osc, gain } = this.zoneDrone
      this.zoneDrone = null
      gain.gain.setTargetAtTime(0.0001, this.ctx!.currentTime, 0.25)
      osc.stop(this.ctx!.currentTime + 1.2)
    }
  }

  /** 圈外时定时响一声提示 */
  tickZone(dt: number, outside: boolean): void {
    if (!outside) {
      this.zonePulseTimer = 0
      return
    }
    this.zonePulseTimer -= dt
    if (this.zonePulseTimer <= 0) {
      this.zonePulseTimer = 1.6
      this.tone({ from: 520, to: 400, dur: 0.16, gain: 0.07, type: 'sine' })
    }
  }

  win(): void {
    const notes = [523, 659, 784, 1046]
    notes.forEach((n, i) => this.tone({ from: n, dur: 0.28, gain: 0.16, type: 'triangle', when: i * 0.12 }))
  }

  lose(): void {
    this.tone({ from: 300, to: 110, dur: 1.1, gain: 0.2, type: 'sawtooth' })
  }
}

export const audio = new AudioEngine()
