import type { EventCategory } from "@/database/event.constants"

// The design rules for AI-generated event images. Safe to import in the browser: hosts see the
// brief for their category ("What the AI is told"), and lib/ai-images.ts sends the same text
// to Gemini. To change how all images look, edit this file; nothing else needs to change.
//
// Every request to Gemini is built in this order, and later parts never override earlier ones:
//   1. DESIGN_STANDARD   house rules for every image (size, safe area, text, safety)
//   2. category brief    the look for this kind of event (below)
//   3. style             the host's chosen treatment (photo, illustration...)
//   4. event facts       title, and optionally date and city
//   5. the host's request, sent as data: it can add detail, never break the rules above

/** Output format. 16:9 matches the event page banner and cards; Gemini returns about 1344x768. */
export const IMAGE_FORMAT = { aspectRatio: "16:9", label: "16:9 landscape (about 1344 x 768 pixels)" } as const

/** Rules every image follows, whatever the category, style or request. */
export const DESIGN_STANDARD: string[] = [
  "A 16:9 landscape banner for a developer or corporate tech event, designed to look good at 1600 x 900 pixels and when cropped to a wide strip on phones.",
  "Keep the main subject and any text inside the central 80% of the image (a safe area); nothing important touching the edges.",
  "One clear focal point, strong contrast, uncluttered background, legible when shown small on an event card.",
  "Text: only the event title (and the date and city if provided), spelled exactly as given, in a clean bold sans-serif. No other words, no slogans, no URLs, no prices, no QR codes, no fake logos.",
  "No real or recognisable people, no celebrities, no children. People may appear only as distant, non-identifiable silhouettes or illustrations.",
  "No other companies' logos or trademarks. If a logo image is attached, place it unchanged and small in a corner; never redraw or alter it.",
  "Nothing violent, political, religious, adult or alcohol-related. Professional, inclusive and welcoming.",
  "No borders, frames, watermarks, mock-up devices or collage layouts.",
]

export type DesignCategory = { label: string; hostHint: string; brief: string }

/** One brief per category: the look that keeps all events of that kind consistent. */
export const DESIGN_CATEGORIES: Record<EventCategory, DesignCategory> = {
  hackathon: {
    label: "Hackathon",
    hostHint: "Energetic, night-time coding look with neon accents.",
    brief: "Energetic hackathon mood: dark navy-to-black background, neon teal (#59deca) and electric purple accents, glowing code fragments, circuit lines or abstract laptops, a sense of momentum and building through the night.",
  },
  conference: {
    label: "Conference or summit",
    hostHint: "Polished, premium stage-and-lights look.",
    brief: "Premium conference look: wide stage or auditorium with soft spotlights, deep blue and teal palette with subtle gold highlights, elegant geometric shapes, calm and authoritative.",
  },
  meetup: {
    label: "Meetup",
    hostHint: "Friendly, warm community gathering.",
    brief: "Friendly meetup mood: warm, relaxed space with soft lighting, rounded shapes, speech bubbles or connecting dots suggesting conversation, teal and warm orange palette, approachable and informal.",
  },
  workshop: {
    label: "Workshop",
    hostHint: "Hands-on, tools-and-laptops learning look.",
    brief: "Hands-on workshop look: tidy desks with laptops, sticky notes and tools seen from above or at an angle, bright daylight, clean whites with teal and yellow accents, practical and focused.",
  },
  webinar: {
    label: "Webinar or online talk",
    hostHint: "Clean digital look built for screens.",
    brief: "Online talk look: abstract screen or video-call frames, floating interface panels, gradient from deep blue to teal, crisp and digital, clearly an online event (no physical venue).",
  },
  bootcamp: {
    label: "Bootcamp or training",
    hostHint: "Structured, progress-and-growth look.",
    brief: "Training bootcamp look: a clear path or staircase motif showing progress, structured grid layout, confident teal and charcoal palette with a single bright accent, motivating and serious.",
  },
  career: {
    label: "Career fair or recruiting",
    hostHint: "Opportunity, connections, bright and optimistic.",
    brief: "Career fair look: bright, optimistic scene with open doors, ladders or connecting network lines, light background with teal and coral accents, welcoming and full of opportunity.",
  },
  launch: {
    label: "Product launch or demo day",
    hostHint: "Bold reveal with spotlight and drama.",
    brief: "Product launch look: dramatic spotlight on an abstract glowing product shape or rocket motif, dark background, teal and magenta light beams, bold and exciting.",
  },
  corporate: {
    label: "Corporate event",
    hostHint: "Calm, professional, brand-led.",
    brief: "Corporate look: refined, minimal and calm, modern office or city skyline softly blurred, navy, white and teal palette, plenty of space for the title, understated and trustworthy.",
  },
  community: {
    label: "Community, student or youth tech",
    hostHint: "Playful, colourful and safe (no children shown).",
    brief: "Community and youth tech look: playful flat illustration of coding blocks, robots, stars and building pieces, bright cheerful palette (teal, sunny yellow, sky blue), friendly and safe; never depict children.",
  },
}

/** Treatments the host can choose on top of the category brief. */
export const DESIGN_STYLES = {
  modern: { label: "Modern poster", text: "Modern graphic poster: bold shapes and strong typography." },
  photo: { label: "Realistic photo", text: "Photorealistic scene with natural depth of field (no identifiable people)." },
  illustration: { label: "Illustration", text: "Flat vector illustration with clean outlines." },
  minimal: { label: "Minimal", text: "Minimal typographic layout with lots of space and one strong accent colour." },
} as const
export type DesignStyle = keyof typeof DESIGN_STYLES
