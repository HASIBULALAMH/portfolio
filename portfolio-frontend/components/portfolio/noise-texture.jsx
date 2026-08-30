export function NoiseTexture() {
  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 opacity-5"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' result='noise' /%3E%3C/filter%3E%3Crect width='200' height='200' fill='%23ffffff' filter='url(%23noiseFilter)' /%3E%3C/svg%3E")`,
        backgroundSize: '200px 200px',
      }}
    />
  )
}
