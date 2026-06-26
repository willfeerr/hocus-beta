const port = process.env.PORT || '1234'
const url = `http://127.0.0.1:${port}/health`

try {
  const response = await fetch(url)
  if (!response.ok) process.exit(1)
  const body = await response.json()
  process.exit(body.ok ? 0 : 1)
} catch {
  process.exit(1)
}
