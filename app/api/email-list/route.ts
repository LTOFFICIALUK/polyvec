import { NextRequest, NextResponse } from 'next/server'
import { addToEmailList } from '@/lib/auth'
import { runMigrations } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    // Ensure migrations are run
    await runMigrations()
    
    const { email, source } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      )
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      )
    }

    await addToEmailList(email, source || 'landing_page')

    return NextResponse.json(
      { success: true, message: 'Successfully added to email list' },
      { status: 200 }
    )
  } catch (error: any) {
    console.error('[Email List] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to add to email list' },
      { status: 500 }
    )
  }
}
