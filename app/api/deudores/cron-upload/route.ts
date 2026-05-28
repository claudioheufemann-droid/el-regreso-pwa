import { NextResponse } from 'next/server'

/**
 * CRON Endpoint for scheduled deudores uploads
 *
 * This endpoint is designed to be called by external schedulers like:
 * - GitHub Actions workflows
 * - Vercel Cron Functions
 * - External cron services
 *
 * Setup:
 * 1. GitHub Actions: Add to .github/workflows/deudores-cron.yml
 * 2. Vercel Cron: Add cron property to vercel.json
 * 3. External: Call this endpoint at scheduled times
 *
 * Required headers:
 * - Authorization: Bearer <CRON_SECRET> (set in environment)
 *
 * Example cURL:
 * curl -X POST https://your-app.com/api/deudores/cron-upload \
 *   -H "Authorization: Bearer your-secret" \
 *   -H "Content-Type: application/json" \
 *   -d '{"file_url": "https://your-server.com/deudores.xlsx"}'
 */

export async function POST(req: Request) {
  try {
    // Verify authorization
    const authHeader = req.headers.get('authorization')
    const expectedAuth = `Bearer ${process.env.DEUDORES_CRON_SECRET}`

    if (!authHeader || authHeader !== expectedAuth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { file_url } = body

    if (!file_url) {
      return NextResponse.json({ error: 'Missing file_url' }, { status: 400 })
    }

    // Fetch the Excel file from the provided URL
    const fileResponse = await fetch(file_url)
    if (!fileResponse.ok) {
      return NextResponse.json({ error: `Failed to fetch file: ${fileResponse.statusText}` }, { status: 400 })
    }

    const buffer = await fileResponse.arrayBuffer()

    // Create FormData with the file
    const formData = new FormData()
    formData.append('file', new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'deudores.xlsx')

    // Forward to upload endpoint
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const uploadResponse = await fetch(`${baseUrl}/api/deudores/upload`, {
      method: 'POST',
      body: formData,
    })

    const result = await uploadResponse.json()

    if (!uploadResponse.ok) {
      return NextResponse.json({ error: result.error || 'Upload failed' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Scheduled upload completed',
      result,
      timestamp: new Date().toISOString(),
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: String(error) }, { status: 500 })
  }
}

// Optional: GET endpoint for health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'Scheduled deudores upload endpoint',
    method: 'POST',
    message: 'Use POST with file_url in body and Authorization header',
  })
}
