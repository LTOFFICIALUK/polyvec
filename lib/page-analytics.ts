/**
 * Page analytics tracking
 * Tracks page views for admin analytics
 */

/**
 * Track a page view
 * Call this from client-side components
 */
export const trackPageView = async (
  pagePath: string,
  timeOnPage?: number
): Promise<void> => {
  try {
    await fetch('/api/analytics/track', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        pagePath,
        timeOnPage,
      }),
    })
  } catch (error) {
    // Silently fail - analytics shouldn't break the app
    console.error('[Page Analytics] Failed to track page view:', error)
  }
}

