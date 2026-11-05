/**
 * Shown while the server confirms who's signed in, before any protected content is revealed.
 * Pure CSS (no JavaScript), so it appears instantly, and it reserves the page's height so the
 * footer doesn't jump when the real content arrives.
 */
const SessionLoader = ({ label = "Checking your session..." }: { label?: string }) => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4" role="status" aria-live="polite">
    <span className="border-dark-200 border-t-primary size-10 animate-spin rounded-full border-4 motion-reduce:animate-none" aria-hidden />
    <p className="text-light-200 text-sm">{label}</p>
  </div>
)

export default SessionLoader
