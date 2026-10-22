const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`缺少 DOM 元素 #${id}`)
  return el as T
}

export class HUD {
  readonly root = $<HTMLDivElement>('hud')
  private crosshair = $<HTMLDivElement>('crosshair')
  private hitmarker = $<HTMLDivElement>('hitmarker')
  private statAlive = $<HTMLElement>('statAlive')
  private statKills = $<HTMLElement>('statKills')
  private statAcc = $<HTMLElement>('statAcc')
  private statPlace = $<HTMLElement>('statPlace')
  private zoneHud = $<HTMLDivElement>('zoneHud')
  private zoneLabel = $<HTMLSpanElement>('zoneLabel')
  private zoneTime = $<HTMLElement>('zoneTime')
  private killfeed = $<HTMLDivElement>('killfeed')
  private healthFill = $<HTMLDivElement>('healthFill')
  private hpText = $<HTMLSpanElement>('hpText')
  private weaponName = $<HTMLDivElement>('weaponName')
  private weaponIcon = $<HTMLDivElement>('weaponIcon')
  private ammoMag = $<HTMLElement>('ammoMag')
  private ammoReserve = $<HTMLSpanElement>('ammoReserve')
  private reloadText = $<HTMLDivElement>('reloadText')
  private vignette = $<HTMLDivElement>('damageVignette')
  private armorBox = $<HTMLDivElement>('armorBox')
  private armorFill = $<HTMLDivElement>('armorFill')
  private pickupPrompt = $<HTMLDivElement>('pickupPrompt')
  private pickupText = $<HTMLSpanElement>('pickupText')
  private promptKey = $<HTMLElement>('promptKey')
  private scopeEl = $<HTMLDivElement>('scope')
  private scopeOn = false

  private lastGap = -1
  private lastHp = -1
  private lastZone = ''
  private lastArmor = -1
  private lastPrompt: string | null = null
  private hitTimer: number | undefined
  private vignetteTimer: number | undefined
  private outside = false

  constructor() {
    this.root.classList.remove('hidden')
  }

  setAmmo(mag: number, reserve: number): void {
    if (mag < 0) {
      if (this.ammoMag.textContent !== '--') this.ammoMag.textContent = '--'
      if (this.ammoReserve.textContent !== '') this.ammoReserve.textContent = ''
      return
    }
    if (this.ammoMag.textContent !== String(mag)) this.ammoMag.textContent = String(mag)
    const r = `/ ${reserve}`
    if (this.ammoReserve.textContent !== r) this.ammoReserve.textContent = r
    this.ammoMag.style.color = mag === 0 ? '#ff5a4d' : mag <= 5 ? '#ffb03a' : ''
  }

  /** 每种枪一个剪影，一眼看出手里拿的是什么 */
  private iconFor(id: string): string {
    const box = 'viewBox="0 0 120 36" fill="currentColor"'
    switch (id) {
      case 'ar':
        return `<svg ${box}><rect x="2" y="15" width="20" height="8" rx="2"/><rect x="20" y="12" width="34" height="10" rx="2"/><rect x="54" y="16" width="46" height="3" rx="1.5"/><rect x="94" y="13" width="8" height="3" rx="1"/><rect x="26" y="8" width="18" height="3" rx="1"/><rect x="30" y="22" width="9" height="12" rx="1.5"/><rect x="44" y="22" width="7" height="9" rx="1.5"/></svg>`
      case 'sg':
        return `<svg ${box}><rect x="2" y="14" width="22" height="9" rx="2"/><rect x="22" y="12" width="26" height="10" rx="2"/><rect x="48" y="15" width="60" height="3" rx="1.5"/><rect x="52" y="20" width="20" height="4" rx="2"/><rect x="56" y="11" width="30" height="3" rx="1.5"/></svg>`
      case 'dmr':
        return `<svg ${box}><rect x="2" y="15" width="18" height="8" rx="2"/><rect x="20" y="12" width="32" height="10" rx="2"/><rect x="52" y="16" width="54" height="3" rx="1.5"/><rect x="28" y="4" width="26" height="6" rx="3"/><rect x="34" y="10" width="4" height="3"/><rect x="46" y="10" width="4" height="3"/><rect x="30" y="22" width="9" height="11" rx="1.5"/></svg>`
      case 'awm':
        return `<svg ${box}><rect x="0" y="14" width="16" height="9" rx="2"/><rect x="16" y="12" width="30" height="10" rx="2"/><rect x="46" y="16" width="68" height="3" rx="1.5"/><rect x="20" y="2" width="34" height="7" rx="3.5"/><rect x="26" y="9" width="4" height="3"/><rect x="44" y="9" width="4" height="3"/><rect x="38" y="20" width="6" height="6" rx="1"/><rect x="28" y="22" width="8" height="10" rx="1.5"/></svg>`
      default:
        return ''
    }
  }

  setWeapon(id: string | null, name: string): void {
    const svg = id ? this.iconFor(id) : ''
    if (this.weaponIcon.innerHTML !== svg) this.weaponIcon.innerHTML = svg
    if (this.weaponName.textContent !== name) this.weaponName.textContent = name
  }

  setReloading(on: boolean): void {
    this.reloadText.classList.toggle('on', on)
  }

  setSpread(deg: number): void {
    const gap = Math.round(Math.max(5, Math.min(38, 5 + deg * 5)))
    if (gap === this.lastGap) return
    this.lastGap = gap
    this.crosshair.style.setProperty('--ch-gap', `${gap}px`)
  }

  hitMarker(isHead: boolean): void {
    this.hitmarker.classList.toggle('head', isHead)
    this.hitmarker.classList.add('on')
    window.clearTimeout(this.hitTimer)
    this.hitTimer = window.setTimeout(() => this.hitmarker.classList.remove('on'), 90)
  }

  setHealth(hp: number): void {
    if (hp === this.lastHp) return
    this.lastHp = hp
    const ratio = Math.max(0, Math.min(1, hp / 100))
    this.healthFill.style.transform = `scaleX(${ratio})`
    this.healthFill.style.background =
      ratio > 0.5
        ? 'linear-gradient(90deg,#62d26f,#9be36a)'
        : ratio > 0.25
          ? 'linear-gradient(90deg,#e6c34a,#f2d76b)'
          : 'linear-gradient(90deg,#e0574b,#f27a6b)'
    this.hpText.textContent = String(Math.ceil(hp))
  }

  setStats(alive: number, kills: number, accuracy: number, time: string): void {
    const a = String(Math.max(1, alive))
    if (this.statAlive.textContent !== a) this.statAlive.textContent = a

    const k = String(kills)
    if (this.statKills.textContent !== k) this.statKills.textContent = k

    const acc = accuracy > 0 ? `${Math.round(accuracy * 100)}%` : '--'
    if (this.statAcc.textContent !== acc) this.statAcc.textContent = acc

    if (this.statPlace.textContent !== time) this.statPlace.textContent = time
  }

  setZone(label: string, time: string, shrinking: boolean): void {
    const key = label + time
    if (key !== this.lastZone) {
      this.lastZone = key
      this.zoneLabel.textContent = label
      this.zoneTime.textContent = time
    }
    this.zoneHud.classList.toggle('shrinking', shrinking)
  }

  setOutside(on: boolean): void {
    if (on === this.outside) return
    this.outside = on
    this.vignette.classList.toggle('outside', on)
  }

  setArmor(value: number): void {
    if (value === this.lastArmor) return
    this.lastArmor = value
    this.armorBox.classList.toggle('on', value > 0.5)
    this.armorFill.style.transform = `scaleX(${Math.max(0, Math.min(1, value / 100))})`
  }

  setPrompt(text: string | null, key: string | null = 'F'): void {
    if (text === this.lastPrompt) return
    this.lastPrompt = text
    this.pickupPrompt.classList.toggle('on', text !== null)
    if (text) this.pickupText.textContent = text
    this.promptKey.style.display = key ? '' : 'none'
    if (key) this.promptKey.textContent = key
  }

  /** 倍镜：显示镜圈并隐藏普通准星 */
  setScope(on: boolean): void {
    if (on === this.scopeOn) return
    this.scopeOn = on
    this.scopeEl.classList.toggle('on', on)
    this.crosshair.style.opacity = on ? '0' : ''
  }

  flashDamage(): void {
    if (this.outside) return
    this.vignette.classList.add('on')
    window.clearTimeout(this.vignetteTimer)
    this.vignetteTimer = window.setTimeout(() => this.vignette.classList.remove('on'), 200)
  }

  killFeed(text: string): void {
    const div = document.createElement('div')
    div.className = 'feed'
    div.innerHTML = text
    this.killfeed.appendChild(div)
    while (this.killfeed.children.length > 5) this.killfeed.removeChild(this.killfeed.firstChild!)
    window.setTimeout(() => div.remove(), 4200)
  }

  clearFeed(): void {
    this.killfeed.innerHTML = ''
  }

  show(): void {
    this.root.classList.remove('hidden')
  }

  hide(): void {
    this.root.classList.add('hidden')
  }
}
