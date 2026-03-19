import { useState, useEffect } from "react"
import { motion, useAnimation } from "framer-motion"
import { STAGE_PALETTES, STAGE_SCALES } from "./buddyConstants"

// Sub-components

function Particle({ x, y, color, delay }) {
  return (
    <motion.circle cx={x} cy={y} r={4} fill={color}
      initial={{ opacity: 1 }}
      animate={{ opacity: 0, cy: y - 80 - Math.random() * 60, cx: x + (Math.random() - 0.5) * 120, r: 0 }}
      transition={{ duration: 1.2, delay, ease: "easeOut" }}
    />
  )
}

function Sparkle({ x, y, delay, size = 3 }) {
  return (
    <motion.g initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: 0.8, delay, repeat: Infinity, repeatDelay: 2 + Math.random() * 3 }}>
      <line x1={x - size} y1={y} x2={x + size} y2={y} stroke="#FFF" strokeWidth={1.5} strokeLinecap="round" />
      <line x1={x} y1={y - size} x2={x} y2={y + size} stroke="#FFF" strokeWidth={1.5} strokeLinecap="round" />
    </motion.g>
  )
}

function SleepZs({ x, y, active }) {
  if (!active) return null
  const zs = [
    { size: 16, dx: 0, dy: 0, delay: 0 },
    { size: 13, dx: 14, dy: -8, delay: 0.7 },
    { size: 10, dx: 26, dy: -18, delay: 1.4 },
  ]
  return (
    <g>
      {zs.map((z, i) => (
        <motion.text key={i} x={x + z.dx} y={y + z.dy} fontSize={z.size}
          fill="#7BA4D4" fontWeight="800" fontFamily="system-ui, sans-serif"
          initial={{ opacity: 0 }}
          animate={{
            opacity: [0, 0.9, 0.9, 0],
            x: [x + z.dx, x + z.dx + 8, x + z.dx + 18, x + z.dx + 28],
            y: [y + z.dy, y + z.dy - 15, y + z.dy - 35, y + z.dy - 55],
          }}
          transition={{ duration: 2.8, delay: z.delay, repeat: Infinity, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}>
          Z
        </motion.text>
      ))}
    </g>
  )
}

function Eye({ cx, cy, rx, ry, pupilR, highlightR, openness, blinkDur, bond }) {
  const whiteRy = ry * openness
  const showInner = openness > 0.2
  const pupilRy = showInner ? pupilR * Math.min(1, openness / 0.5) : 0
  const trackRange = bond * 2.5

  return (
    <g>
      <motion.ellipse cx={cx} cy={cy} rx={rx}
        animate={{ ry: whiteRy }} transition={{ duration: blinkDur }} fill="white" />
      {showInner && (
        <motion.ellipse
          cx={cx + 1} cy={cy + 1} rx={pupilR}
          animate={{
            ry: pupilRy,
            cx: bond > 0.3 ? [cx + 1, cx + 1 + trackRange, cx + 1, cx + 1 - trackRange, cx + 1] : cx + 1,
            cy: bond > 0.3 ? [cy + 1, cy + 1 - trackRange * 0.5, cy + 1, cy + 1 + trackRange * 0.3, cy + 1] : cy + 1,
          }}
          transition={{
            ry: { duration: blinkDur },
            cx: { duration: 4 + (1 - bond) * 4, repeat: Infinity, ease: "easeInOut" },
            cy: { duration: 5 + (1 - bond) * 3, repeat: Infinity, ease: "easeInOut" },
          }}
          fill="#1A1A2E"
        />
      )}
      {showInner && openness > 0.4 && (
        <circle cx={cx + 3} cy={cy - 3} r={highlightR} fill="white" />
      )}
    </g>
  )
}

function Mouth({ cx, cy, isSleeping, isTired, isHappy, feedReaction, scale, bond }) {
  const w = 20 * scale
  const bondMult = 0.6 + bond * 0.4

  if (isSleeping) {
    return (
      <motion.ellipse cx={cx} cy={cy + 2} rx={4 * scale} fill="#2A1A2E"
        animate={{ ry: [2.5 * scale, 3.5 * scale, 2.5 * scale] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
    )
  }

  if (feedReaction) {
    return (
      <g>
        <motion.ellipse cx={cx} cy={cy + 1} rx={10 * scale} fill="#2A1A2E"
          initial={{ ry: 0 }}
          animate={{ ry: [0, 9 * scale, 7 * scale, 8 * scale, 0] }}
          transition={{ duration: 1.6, times: [0, 0.15, 0.4, 0.7, 1] }}
        />
        <motion.ellipse cx={cx} cy={cy + 5} rx={6 * scale} fill="#FF8FAA"
          initial={{ ry: 0 }}
          animate={{ ry: [0, 4 * scale, 3 * scale, 2.5 * scale, 0] }}
          transition={{ duration: 1.6, times: [0, 0.2, 0.45, 0.75, 1] }}
        />
      </g>
    )
  }

  if (isHappy) {
    const mouthW = w * 0.7 * bondMult
    const mouthH = w * 0.4 * bondMult
    return (
      <g>
        <path
          d={`M${cx - mouthW} ${cy} L${cx + mouthW} ${cy} Q${cx + mouthW} ${cy + mouthH * 1.4} ${cx} ${cy + mouthH * 1.5} Q${cx - mouthW} ${cy + mouthH * 1.4} ${cx - mouthW} ${cy} Z`}
          fill="#2A1A2E"
        />
        {bond > 0.4 && (
          <ellipse cx={cx} cy={cy + mouthH * 1.1} rx={mouthW * 0.55} ry={mouthH * 0.45} fill="#FF8FAA" />
        )}
        <path
          d={`M${cx - mouthW - 1} ${cy} Q${cx} ${cy - 2} ${cx + mouthW + 1} ${cy}`}
          fill="none" stroke="#1A1A2E" strokeWidth={1.5} strokeLinecap="round"
        />
      </g>
    )
  }

  if (!isTired) {
    const smileDepth = w * 0.2 * bondMult + w * 0.05
    return (
      <path
        d={`M${cx - w * 0.45 * bondMult} ${cy} Q${cx} ${cy + smileDepth} ${cx + w * 0.45 * bondMult} ${cy}`}
        fill="none" stroke="#1A1A2E" strokeWidth={2.2} strokeLinecap="round"
      />
    )
  }

  return (
    <path
      d={`M${cx - w * 0.3} ${cy} Q${cx} ${cy + 1.5} ${cx + w * 0.3} ${cy}`}
      fill="none" stroke="#1A1A2E" strokeWidth={2} strokeLinecap="round"
    />
  )
}

// Main character component

export default function OptioBuddy({
  vitality = 0.75,
  bond = 0.4,
  stage = 3,
  onTap = () => {},
  feedReaction = null,
  tapBurst = 0,
  width = 400,
  height = 340,
}) {
  const palette = STAGE_PALETTES[stage] || STAGE_PALETTES[1]
  const scale = STAGE_SCALES[stage] || 0.7
  const bodyControls = useAnimation()
  const [blinking, setBlinking] = useState(false)
  const [particles, setParticles] = useState([])

  const isSleeping = vitality < 0.15
  const isTired = vitality < 0.4
  const isHappy = vitality > 0.6
  const eyeOpenness = isSleeping ? 0.05 : isTired ? 0.5 : 1
  const browOffset = isSleeping ? 3 : isTired ? 2 : isHappy ? (-2 - bond * 2) : 0
  const saturation = 0.3 + vitality * 0.7
  const isEgg = stage === 0

  // Blink loop
  useEffect(() => {
    if (isSleeping) return
    const interval = setInterval(() => {
      setBlinking(true)
      setTimeout(() => setBlinking(false), 150)
    }, 2500 + Math.random() * 2000)
    return () => clearInterval(interval)
  }, [isSleeping])

  // Tap reaction
  useEffect(() => {
    if (!tapBurst) return
    const intensity = 0.5 + bond * 0.5
    if (bond > 0.6) {
      bodyControls.start({
        y: [0, -18 * intensity, 0], scaleX: [1, 0.85, 1.1, 1], scaleY: [1, 1.15, 0.9, 1],
        rotate: [0, -6 * intensity, 6 * intensity, 0], transition: { duration: 0.6 },
      })
    } else if (bond > 0.3) {
      bodyControls.start({
        y: [0, -8, 0], scaleY: [1, 1.06, 0.96, 1], scaleX: [1, 0.95, 1.04, 1],
        transition: { duration: 0.4 },
      })
    } else {
      bodyControls.start({
        scaleX: [1, 0.97, 1], scaleY: [1, 1.03, 1], transition: { duration: 0.25 },
      })
    }
    const count = bond > 0.6 ? 8 : bond > 0.3 ? 5 : 2
    const np = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i, x: 180 + Math.random() * 40, y: 220 + Math.random() * 30,
      color: ["#FFD700", "#FF69B4", "#87CEEB", "#98FB98", "#DDA0DD", "#FFA07A", "#B0E0E6", "#FFB6C1"][i % 8],
      delay: i * 0.04,
    }))
    setParticles(prev => [...prev, ...np])
    setTimeout(() => setParticles(prev => prev.filter(p => !np.includes(p))), 2000)
  }, [tapBurst, bond, bodyControls])

  // Feed reaction
  useEffect(() => {
    if (!feedReaction) return
    const reactions = {
      crunch: async () => {
        await bodyControls.start({ scaleX: [1, 1.15, 0.9, 1.05, 1], scaleY: [1, 0.85, 1.1, 0.95, 1], transition: { duration: 0.5, times: [0, 0.2, 0.4, 0.7, 1] } })
        await bodyControls.start({ rotate: [-3, 3, -2, 1, 0], transition: { duration: 0.4 } })
      },
      sweet: async () => {
        await bodyControls.start({ scaleY: [1, 1.08, 1], scaleX: [1, 0.94, 1], transition: { duration: 0.6 } })
        await bodyControls.start({ rotate: [0, -5, 5, -3, 3, 0], transition: { duration: 0.8 } })
      },
      spicy: async () => {
        await bodyControls.start({ y: [0, -15, 0], transition: { duration: 0.3 } })
        await bodyControls.start({ scaleX: [1, 1.2, 1], scaleY: [1, 0.8, 1], transition: { duration: 0.3 } })
        await bodyControls.start({ rotate: [0, -8, 8, -5, 5, 0], transition: { duration: 0.5 } })
      },
      soupy: async () => {
        await bodyControls.start({ scaleY: [1, 1.05, 0.98, 1.02, 1], transition: { duration: 1 } })
      },
      chewy: async () => {
        for (let i = 0; i < 3; i++) {
          await bodyControls.start({ scaleY: 0.92, scaleX: 1.08, transition: { duration: 0.12 } })
          await bodyControls.start({ scaleY: 1.04, scaleX: 0.97, transition: { duration: 0.12 } })
        }
        await bodyControls.start({ scaleY: 1, scaleX: 1, transition: { duration: 0.2 } })
      },
      novel: async () => {
        await bodyControls.start({ scaleX: 0.95, scaleY: 0.95, transition: { duration: 0.5 } })
        await new Promise(r => setTimeout(r, 400))
        await bodyControls.start({ scaleX: [0.95, 1.12, 1], scaleY: [0.95, 0.88, 1], y: [0, -20, 0], transition: { duration: 0.6 } })
      },
    }
    ;(reactions[feedReaction] || reactions.crunch)()
    const np = Array.from({ length: 8 }, (_, i) => ({
      id: Date.now() + i + 100, x: 185 + Math.random() * 30, y: 240 + Math.random() * 20,
      color: ["#FFD700", "#FF69B4", palette.body, "#98FB98"][i % 4], delay: i * 0.04,
    }))
    setParticles(prev => [...prev, ...np])
    setTimeout(() => setParticles(prev => prev.filter(p => !np.includes(p))), 2000)
  }, [feedReaction, bodyControls, palette])

  // Animation parameters
  const bounceAmplitude = isSleeping ? 0 : isTired ? 2 : 4 + bond * 8
  const bounceSpeed = isTired ? 3 : 2.2 - bond * 0.8
  const armSwing = isSleeping ? 0 : isTired ? 3 : 6 + bond * 12
  const bodyTilt = isSleeping ? 0 : bond * 3
  const currentEyeOpen = blinking ? 0.05 : eyeOpenness
  const blinkDur = blinking ? 0.07 : 0.3

  // Body geometry
  const bodyRx = 65 * scale
  const bodyCy = 258
  const armRx = 11 * scale
  const armRy = 13 * scale
  const armLx = 200 - bodyRx + armRx * 0.3
  const armRxPos = 200 + bodyRx - armRx * 0.3
  const armCy = bodyCy + 8
  const showCheeks = isHappy && bond > 0.25
  const cheekOpacity = 0.2 + bond * 0.3

  // Egg render
  if (isEgg) {
    return (
      <svg viewBox="0 0 400 340" width={width} height={height}>
        <motion.g onClick={onTap} style={{ cursor: "pointer" }}
          whileTap={{ rotate: [0, -8, 8, -5, 5, 0], transition: { duration: 0.5 } }}>
          <motion.ellipse cx={200} cy={310} rx={40} ry={8} fill="black" opacity={0.08}
            animate={{ rx: [40, 38, 40] }} transition={{ duration: 2, repeat: Infinity }} />
          <motion.g animate={{ rotate: [-1.5, 1.5, -1.5], y: [0, -3, 0] }}
            transition={{ duration: 3, repeat: Infinity }} style={{ originX: "200px", originY: "270px" }}>
            <ellipse cx={200} cy={255} rx={48} ry={58} fill="#F1EFE8" />
            <ellipse cx={200} cy={255} rx={48} ry={58} fill="none" stroke="#D3D1C7" strokeWidth={2} />
            <motion.ellipse cx={200} cy={260} rx={25} ry={30} fill={palette.glow}
              animate={{ opacity: [0.05, 0.15, 0.05] }} transition={{ duration: 2.5, repeat: Infinity }} />
            <motion.path d="M188 240 L192 248 L186 254" fill="none" stroke="#C8C6BD"
              strokeWidth={1.5} strokeLinecap="round"
              animate={{ opacity: [0.3, 0.5, 0.3] }} transition={{ duration: 3, repeat: Infinity }} />
          </motion.g>
        </motion.g>
        {particles.map(p => <Particle key={p.id} x={p.x} y={p.y} color={p.color} delay={p.delay} />)}
      </svg>
    )
  }

  // Buddy render
  return (
    <svg viewBox="0 0 400 340" width={width} height={height}>
      <motion.g onClick={onTap} style={{ cursor: "pointer", filter: `saturate(${saturation})` }} animate={bodyControls}>
        {/* Shadow */}
        <motion.ellipse cx={200} cy={320} fill="black" opacity={0.1}
          animate={{ rx: [50 * scale, (46 - bond * 4) * scale, 50 * scale], ry: [10, 8, 10] }}
          transition={{ duration: bounceSpeed, repeat: Infinity }} />

        {/* Bounce group */}
        <motion.g
          animate={{
            y: isSleeping ? [0, 1, 0] : [0, -bounceAmplitude, 0],
            scaleX: isSleeping ? [1, 1.02, 1] : [1, 0.96, 1.03, 0.98, 1],
            scaleY: isSleeping ? [1, 0.98, 1] : [1, 1.04, 0.97, 1.02, 1],
            rotate: isSleeping ? 0 : [-bodyTilt, bodyTilt, -bodyTilt],
          }}
          transition={{ duration: bounceSpeed, repeat: Infinity, ease: "easeInOut" }}
          style={{ originX: "200px", originY: "280px" }}>

          {/* Back arm */}
          <motion.ellipse cx={armLx} cy={armCy} rx={armRx} ry={armRy}
            fill={palette.body} style={{ filter: "brightness(0.92)" }}
            animate={isSleeping ? {} : { rotate: [-armSwing, armSwing, -armSwing] }}
            transition={{ duration: bounceSpeed, repeat: Infinity }} />

          {/* Body */}
          <ellipse cx={200} cy={bodyCy} rx={bodyRx} ry={60 * scale} fill={palette.body} />
          <ellipse cx={200} cy={268} rx={40 * scale} ry={35 * scale} fill={palette.belly} opacity={0.6} />
          <ellipse cx={183} cy={235} rx={18 * scale} ry={12 * scale} fill="white" opacity={0.15} />

          {/* Front arm */}
          <motion.ellipse cx={armRxPos} cy={armCy} rx={armRx} ry={armRy}
            fill={palette.body} style={{ filter: "brightness(0.92)" }}
            animate={isSleeping ? {} : { rotate: [armSwing, -armSwing, armSwing] }}
            transition={{ duration: bounceSpeed, repeat: Infinity, delay: 0.1 }} />

          {/* Cheeks */}
          {showCheeks && <>
            <motion.ellipse cx={172} cy={256} rx={9 * scale} ry={6 * scale} fill={palette.cheek}
              animate={{ opacity: [cheekOpacity - 0.1, cheekOpacity + 0.05, cheekOpacity - 0.1] }}
              transition={{ duration: 2, repeat: Infinity }} />
            <motion.ellipse cx={228} cy={256} rx={9 * scale} ry={6 * scale} fill={palette.cheek}
              animate={{ opacity: [cheekOpacity - 0.1, cheekOpacity + 0.05, cheekOpacity - 0.1] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.3 }} />
          </>}

          {/* Stage 5+ sparkles */}
          {stage >= 5 && <>
            <Sparkle x={160} y={220} delay={0} />
            <Sparkle x={240} y={225} delay={0.8} size={2.5} />
            <Sparkle x={200} y={200} delay={1.6} size={3.5} />
            {stage >= 6 && <>
              <Sparkle x={150} y={240} delay={0.4} size={2} />
              <Sparkle x={250} y={210} delay={1.2} />
            </>}
          </>}

          {/* Legend glow */}
          {stage >= 6 && <motion.ellipse cx={200} cy={255} rx={75 * scale} ry={70 * scale} fill={palette.glow}
            animate={{ opacity: [0.05, 0.12, 0.05] }} transition={{ duration: 3, repeat: Infinity }} />}

          {/* Face */}
          <g>
            {/* Eyebrows */}
            <line x1={178} y1={233 + browOffset} x2={188} y2={231 + browOffset}
              stroke={palette.body} strokeWidth={2.5} strokeLinecap="round" style={{ filter: "brightness(0.65)" }} />
            <line x1={212} y1={231 + browOffset} x2={222} y2={233 + browOffset}
              stroke={palette.body} strokeWidth={2.5} strokeLinecap="round" style={{ filter: "brightness(0.65)" }} />

            {/* Eyes */}
            <Eye cx={184} cy={245} rx={11 * scale} ry={13 * scale}
              pupilR={6 * scale} highlightR={2.5 * scale}
              openness={currentEyeOpen} blinkDur={blinkDur} bond={bond} />
            <Eye cx={216} cy={245} rx={11 * scale} ry={13 * scale}
              pupilR={6 * scale} highlightR={2.5 * scale}
              openness={currentEyeOpen} blinkDur={blinkDur} bond={bond} />

            {/* Mouth */}
            <Mouth cx={200} cy={262} isSleeping={isSleeping} isTired={isTired} isHappy={isHappy}
              feedReaction={feedReaction} scale={scale} bond={bond} />
          </g>

          {/* Sleep Z's */}
          <SleepZs x={232} y={222} active={isSleeping} />
        </motion.g>
      </motion.g>

      {/* Particles */}
      {particles.map(p => <Particle key={p.id} x={p.x} y={p.y} color={p.color} delay={p.delay} />)}
    </svg>
  )
}
