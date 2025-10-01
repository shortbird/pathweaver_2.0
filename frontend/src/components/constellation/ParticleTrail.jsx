import React, { useEffect, useRef } from 'react';

const ParticleTrail = ({ questOrbs, pillarPositions }) => {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const animationFrameRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    // Particle class
    class Particle {
      constructor(x, y, color, targetX, targetY) {
        this.x = x;
        this.y = y;
        this.targetX = targetX;
        this.targetY = targetY;
        this.color = color;
        this.alpha = Math.random() * 0.5 + 0.3;
        this.size = Math.random() * 2 + 1;
        this.speedX = (Math.random() - 0.5) * 0.5;
        this.speedY = (Math.random() - 0.5) * 0.5;
        this.life = Math.random() * 60 + 30; // 30-90 frames
        this.maxLife = this.life;
      }

      update() {
        // Move toward target with some randomness
        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        this.x += dx * 0.02 + this.speedX;
        this.y += dy * 0.02 + this.speedY;

        this.life--;
        this.alpha = (this.life / this.maxLife) * 0.5;
      }

      draw(ctx) {
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      isDead() {
        return this.life <= 0;
      }
    }

    // Generate particles for quest orbs
    const generateParticles = () => {
      if (!questOrbs || !pillarPositions) return;

      questOrbs.forEach((quest) => {
        // Only generate particles occasionally (probability-based)
        if (Math.random() > 0.05) return; // 5% chance per frame

        // Get blended color from quest
        const getBlendedColor = () => {
          const pillarColors = {
            'stem_logic': { r: 59, g: 130, b: 246 },
            'society_culture': { r: 168, g: 85, b: 247 },
            'arts_creativity': { r: 239, g: 89, b: 123 },
            'language_communication': { r: 245, g: 158, b: 11 },
            'life_wellness': { r: 16, g: 185, b: 129 }
          };

          let r = 255, g = 255, b = 255;
          let totalWeight = 0;

          Object.entries(quest.xpDistribution).forEach(([pillarId, xp]) => {
            const weight = xp / quest.totalXP;
            const color = pillarColors[pillarId];
            if (color) {
              r += color.r * weight;
              g += color.g * weight;
              b += color.b * weight;
              totalWeight += weight;
            }
          });

          if (totalWeight > 0) {
            r = Math.round(r / (1 + totalWeight));
            g = Math.round(g / (1 + totalWeight));
            b = Math.round(b / (1 + totalWeight));
          }

          return `rgb(${r}, ${g}, ${b})`;
        };

        const color = getBlendedColor();
        const questPos = quest.position;

        // Pick a random target pillar based on XP distribution
        const pillars = Object.entries(quest.xpDistribution);
        if (pillars.length === 0) return;

        const totalXP = quest.totalXP;
        let random = Math.random() * totalXP;
        let targetPillarId = null;

        for (const [pillarId, xp] of pillars) {
          random -= xp;
          if (random <= 0) {
            targetPillarId = pillarId;
            break;
          }
        }

        const targetPos = pillarPositions[targetPillarId];
        if (!targetPos) return;

        // Create particle
        particlesRef.current.push(
          new Particle(questPos.x, questPos.y, color, targetPos.x, targetPos.y)
        );
      });

      // Limit total particles
      if (particlesRef.current.length > 500) {
        particlesRef.current = particlesRef.current.slice(-500);
      }
    };

    // Animation loop
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Generate new particles
      generateParticles();

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter(particle => {
        particle.update();
        particle.draw(ctx);
        return !particle.isDead();
      });

      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animate();

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [questOrbs, pillarPositions]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 4 }}
    />
  );
};

export default React.memo(ParticleTrail);
