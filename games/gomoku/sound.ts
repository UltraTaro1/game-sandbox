/** 程序化音效：不依赖音频文件，全部用 WebAudio 合成 */
class GomokuSound {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  muted = false

  private ensure(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      this.ctx = new Ctor()
      this.master = this.ctx.createGain()
      this.master.gain.value = 0.6
      this.master.connect(this.ctx.destination)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume()
    return this.ctx
  }

  unlock(): void {
    this.ensure()
  }

  toggle(): boolean {
    this.muted = !this.muted
    if (this.master) this.master.gain.value = this.muted ? 0 : 0.6
    return this.muted
  }

  /** 落子：短促的木头敲击声 */
  place(white: boolean): void {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime

    // 低频“咚”
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(white ? 320 : 240, t)
    osc.frequency.exponentialRampToValueAtTime(white ? 140 : 100, t + 0.09)
    g.gain.setValueAtTime(0.5, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.13)

    // 高频“嗒”（噪声瞬态）
    const len = Math.floor(ctx.sampleRate * 0.03)
    const buf = ctx.createBuffer(1, len, ctx.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
    const src = ctx.createBufferSource()
    src.buffer = buf
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 1800
    const ng = ctx.createGain()
    ng.gain.value = 0.22
    src.connect(hp).connect(ng).connect(this.master)
    src.start(t)
  }

  /** 胜利：上行三和弦 */
  win(): void {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t0 = ctx.currentTime
    ;[523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      const t = t0 + i * 0.11
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.32, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5)
      osc.connect(g).connect(this.master!)
      osc.start(t)
      osc.stop(t + 0.55)
    })
  }

  /** 失败：下行 */
  lose(): void {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t0 = ctx.currentTime
    ;[392, 329.63, 261.63].forEach((f, i) => {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = f
      const t = t0 + i * 0.14
      g.gain.setValueAtTime(0.0001, t)
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
      osc.connect(g).connect(this.master!)
      osc.start(t)
      osc.stop(t + 0.5)
    })
  }

  /** 撤回：反向的轻响 */
  undo(): void {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(180, t)
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.08)
    g.gain.setValueAtTime(0.18, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.12)
  }

  /** 非法操作 */
  nope(): void {
    const ctx = this.ensure()
    if (!ctx || !this.master) return
    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const g = ctx.createGain()
    osc.type = 'square'
    osc.frequency.value = 110
    g.gain.setValueAtTime(0.12, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08)
    osc.connect(g).connect(this.master)
    osc.start(t)
    osc.stop(t + 0.09)
  }
}

export const sound = new GomokuSound()
