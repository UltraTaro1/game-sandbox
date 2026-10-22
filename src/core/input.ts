/**
 * 输入：键盘 + 指针锁定下的鼠标。
 * - down()：是否按住
 * - pressed()：本帧刚按下（每帧末清空）
 */
export class Input {
  private held = new Set<string>()
  private justDown = new Set<string>()
  private buttons = [false, false, false]
  private buttonsJustDown = [false, false, false]

  /** 本帧鼠标位移（像素） */
  dx = 0
  dy = 0

  locked = false
  enabled = true

  constructor() {
    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault()
      if (!this.held.has(e.code)) this.justDown.add(e.code)
      this.held.add(e.code)
    })

    window.addEventListener('keyup', (e) => {
      this.held.delete(e.code)
    })

    window.addEventListener('blur', () => {
      this.held.clear()
      this.buttons = [false, false, false]
    })

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement !== null
      if (!this.locked) {
        this.held.clear()
        this.buttons = [false, false, false]
      }
    })

    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return
      this.dx += e.movementX
      this.dy += e.movementY
    })

    window.addEventListener('mousedown', (e) => {
      if (!this.enabled || !this.locked) return
      const i = e.button
      if (i < 3) {
        if (!this.buttons[i]) this.buttonsJustDown[i] = true
        this.buttons[i] = true
        e.preventDefault()
      }
    })

    window.addEventListener('mouseup', (e) => {
      const i = e.button
      if (i < 3) this.buttons[i] = false
    })

    window.addEventListener('contextmenu', (e) => e.preventDefault())
  }

  down(code: string): boolean {
    return this.held.has(code)
  }

  pressed(code: string): boolean {
    return this.justDown.has(code)
  }

  mouseDown(button = 0): boolean {
    return this.buttons[button]
  }

  mousePressed(button = 0): boolean {
    return this.buttonsJustDown[button]
  }

  lock(): void {
    const el = document.body
    try {
      const p = el.requestPointerLock() as unknown as Promise<void> | undefined
      if (p && typeof p.catch === 'function') p.catch(() => undefined)
    } catch {
      /* 忽略：用户手势不足时浏览器会拒绝 */
    }
  }

  unlock(): void {
    if (document.pointerLockElement) document.exitPointerLock()
  }

  /** 每帧末调用 */
  endFrame(): void {
    this.justDown.clear()
    this.buttonsJustDown = [false, false, false]
    this.dx = 0
    this.dy = 0
  }
}
