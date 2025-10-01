import React, { useEffect, useRef } from 'react';

const StarField = ({ starCount = 200, parallaxOffset = { x: 0, y: 0 } }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const updateDimensions = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    // Generate random stars
    const stars = Array.from({ length: starCount }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      radius: Math.random() * 1.5 + 0.5,
      opacity: Math.random() * 0.8 + 0.2,
      twinkleSpeed: Math.random() * 0.02 + 0.01,
      phase: Math.random() * Math.PI * 2,
    }));

    let animationFrame;
    let time = 0;

    const animate = () => {
      time += 0.01;

      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Draw stars with twinkling effect and parallax
      stars.forEach((star) => {
        const twinkle = Math.sin(time * star.twinkleSpeed + star.phase);
        const opacity = star.opacity + twinkle * 0.3;

        // Apply parallax offset (stars move opposite to mouse for depth effect)
        const parallaxX = star.x - parallaxOffset.x;
        const parallaxY = star.y - parallaxOffset.y;

        ctx.beginPath();
        ctx.arc(parallaxX, parallaxY, star.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, Math.min(1, opacity))})`;
        ctx.fill();

        // Add subtle glow for larger stars
        if (star.radius > 1) {
          const gradient = ctx.createRadialGradient(
            parallaxX, parallaxY, 0,
            parallaxX, parallaxY, star.radius * 3
          );
          gradient.addColorStop(0, `rgba(255, 255, 255, ${opacity * 0.3})`);
          gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
          ctx.fillStyle = gradient;
          ctx.fillRect(
            parallaxX - star.radius * 3,
            parallaxY - star.radius * 3,
            star.radius * 6,
            star.radius * 6
          );
        }
      });

      animationFrame = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      window.removeEventListener('resize', updateDimensions);
      if (animationFrame) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [starCount, parallaxOffset]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ opacity: 0.6 }}
    />
  );
};

export default React.memo(StarField);
