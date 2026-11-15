import * as THREE from 'three'

export function canvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas context unavailable')
  draw(ctx, width, height)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function woodTexture(repeatX: number, repeatY: number): THREE.CanvasTexture {
  const texture = canvasTexture(256, 256, (ctx, width, height) => {
    const rows = 4
    const plank = height / rows
    for (let row = 0; row < rows; row += 1) {
      const lightness = 24 + ((row * 7) % 9)
      ctx.fillStyle = `hsl(28 32% ${lightness}%)`
      ctx.fillRect(0, row * plank, width, plank)

      for (let line = 0; line < 18; line += 1) {
        const y = row * plank + Math.random() * plank
        ctx.strokeStyle = `rgba(0, 0, 0, ${0.03 + Math.random() * 0.05})`
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.bezierCurveTo(
          width * 0.33,
          y + (Math.random() - 0.5) * 7,
          width * 0.66,
          y + (Math.random() - 0.5) * 7,
          width,
          y,
        )
        ctx.stroke()
      }

      ctx.fillStyle = 'rgba(0, 0, 0, 0.34)'
      ctx.fillRect(0, row * plank, width, 1)
      ctx.fillRect(Math.random() * width, row * plank, 1, plank)
    }
  })
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.repeat.set(repeatX, repeatY)
  return texture
}

export function cityTexture(): THREE.CanvasTexture {
  return canvasTexture(384, 512, (ctx, width, height) => {
    const sky = ctx.createLinearGradient(0, 0, 0, height)
    sky.addColorStop(0, '#080e19')
    sky.addColorStop(0.5, '#152238')
    sky.addColorStop(1, '#28374f')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, width, height)

    for (let star = 0; star < 70; star += 1) {
      ctx.fillStyle = `rgba(200, 216, 240, ${0.1 + Math.random() * 0.35})`
      ctx.fillRect(Math.random() * width, Math.random() * height * 0.5, 1, 1)
    }

    let x = -12
    while (x < width) {
      const buildingWidth = 34 + Math.random() * 58
      const buildingHeight = 110 + Math.random() * 220
      const top = height - buildingHeight
      ctx.fillStyle = Math.random() > 0.5 ? '#0b111c' : '#0e1622'
      ctx.fillRect(x, top, buildingWidth, buildingHeight)

      const columns = Math.floor(buildingWidth / 12)
      const rows = Math.floor(buildingHeight / 16)
      for (let col = 0; col < columns; col += 1) {
        for (let row = 0; row < rows; row += 1) {
          if (Math.random() > 0.68) continue
          const warm = Math.random() > 0.25
          ctx.fillStyle = warm
            ? `rgba(226, 176, 108, ${0.35 + Math.random() * 0.5})`
            : `rgba(150, 180, 214, ${0.2 + Math.random() * 0.3})`
          ctx.fillRect(x + 4 + col * 12, top + 6 + row * 16, 4, 5)
        }
      }

      x += buildingWidth + 5
    }

    ctx.fillStyle = 'rgba(4, 6, 10, 0.72)'
    ctx.fillRect(0, height - 46, width, 46)
  })
}

export function glowTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx, width, height) => {
    const glow = ctx.createRadialGradient(
      width / 2,
      height / 2,
      0,
      width / 2,
      height / 2,
      width / 2,
    )
    glow.addColorStop(0, 'rgba(255, 226, 178, 0.95)')
    glow.addColorStop(0.25, 'rgba(255, 196, 128, 0.45)')
    glow.addColorStop(1, 'rgba(255, 176, 102, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, width, height)
  })
}

export function televisionTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 192, (ctx, width, height) => {
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(0, 0, width, height)

    const bloom = ctx.createRadialGradient(
      width / 2,
      height / 2,
      4,
      width / 2,
      height / 2,
      width * 0.58,
    )
    bloom.addColorStop(0, 'rgba(228, 233, 236, 0.8)')
    bloom.addColorStop(0.45, 'rgba(148, 154, 158, 0.42)')
    bloom.addColorStop(1, 'rgba(10, 10, 10, 0)')
    ctx.fillStyle = bloom
    ctx.fillRect(0, 0, width, height)

    for (let y = 0; y < height; y += 3) {
      ctx.fillStyle = `rgba(0, 0, 0, ${0.16 + Math.random() * 0.2})`
      ctx.fillRect(0, y, width, 1)
    }

    ctx.fillStyle = 'rgba(236, 240, 242, 0.1)'
    for (let y = 0; y < height; y += 26) {
      ctx.fillRect(0, y, width, 1)
    }
  })
}

export function calendarTexture(): THREE.CanvasTexture {
  return canvasTexture(512, 720, (ctx, width, height) => {
    ctx.fillStyle = '#d8ccae'
    ctx.fillRect(0, 0, width, height)

    ctx.fillStyle = '#8e2f21'
    ctx.fillRect(0, 0, width, 118)
    ctx.fillStyle = '#efe6d2'
    ctx.textAlign = 'center'
    ctx.font = '600 42px Georgia, "Times New Roman", serif'
    ctx.fillText('DECEMBRIE 1989', width / 2, 76)

    ctx.fillStyle = '#2b241b'
    ctx.font = '700 300px Georgia, "Times New Roman", serif'
    ctx.fillText('15', width / 2, 470)

    ctx.fillStyle = '#6d6250'
    ctx.font = '500 52px Georgia, "Times New Roman", serif'
    ctx.fillText('VINERI', width / 2, 588)

    ctx.fillStyle = '#8e2f21'
    ctx.fillRect(112, 632, width - 224, 3)

    ctx.fillStyle = 'rgba(0, 0, 0, 0.06)'
    for (let line = 0; line < 30; line += 1) {
      ctx.fillRect(0, Math.random() * height, width, 1)
    }
  })
}
