import posthog, { type BeforeSendFn, type Properties } from "posthog-js";

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

const TOKEN_IN_URL = /([?&]token=)[^&#\s]*/g;

/** PostHog copies the first URL of a visit into later events ($session_entry_url, $initial_current_url...). */
const redactTokens = (props?: Properties): Properties | undefined =>
  props &&
  Object.fromEntries(
    Object.entries(props).map(([key, value]) => [key, typeof value === "string" ? value.replace(TOKEN_IN_URL, "$1redacted") : value]),
  );

/**
 * Keeps private details out of analytics. Admin pages hold attendees' emails, and booking
 * confirmation links carry a one-time token in the address, so neither is ever sent.
 */
const keepPrivateDataOut: BeforeSendFn = (event) => {
  const url = event?.properties?.$current_url;
  if (!event || (typeof url === "string" && /\/(admin|bookings\/confirm)(\/|\?|$)/.test(url))) return null;
  return {
    ...event,
    properties: redactTokens(event.properties) ?? {},
    $set: redactTokens(event.$set),
    $set_once: redactTokens(event.$set_once),
  };
};

if (!posthogKey || !posthogHost) {
  if (process.env.NODE_ENV === "development") {
    const missingVariable = !posthogKey
      ? "NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN"
      : "NEXT_PUBLIC_POSTHOG_HOST";

    throw new Error(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
    );
  }
} else {
  // Deferred a tick, so analytics setup never holds up the page's first render.
  setTimeout(() => {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      defaults: "2026-01-30",
      capture_exceptions: true,
      before_send: keepPrivateDataOut,
      // Off unless asked for: debug mode prints every analytics event to the browser console.
      debug: process.env.NEXT_PUBLIC_POSTHOG_DEBUG === "true",
    });
  }, 0);
}
