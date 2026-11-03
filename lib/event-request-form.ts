import { IMAGE_RULES } from "@/database/event.constants"

// What organizers are asked for. The admin sends this reply and builds the form from these
// questions (Google Forms works well: Responses -> Download responses (.csv)). The AI import
// then reads the export, so the question wording doesn't have to match exactly.

export const REQUEST_FORM_QUESTIONS = [
  "Event title",
  "Short description (one or two sentences)",
  "Full overview",
  "Venue",
  "Location (city, country)",
  "Start date",
  "Start time",
  "End date (if it runs over several days)",
  "End time",
  "Timezone",
  "Mode (online, offline or hybrid)",
  "Target audience",
  "Organizer (who is running it)",
  "Agenda (one item per line)",
  "Tags or topics",
  `Images (file names or public links, up to ${IMAGE_RULES.maxImages})`,
  "Image display: one fixed design, or a slider rotating through all of them",
] as const

export const REQUEST_REPLY_TEMPLATE = `Hi,

Thanks for your interest in listing your event on DevEvent. We currently list developer events, and listing is free.

Please fill in this form: [paste your form link here]

Images:
- Up to ${IMAGE_RULES.maxImages} images per event
- At least ${IMAGE_RULES.minWidth} x ${IMAGE_RULES.minHeight} pixels; ${IMAGE_RULES.recommended} works best
- ${IMAGE_RULES.formats}, 5 MB or smaller each
- One image shows as a fixed design. With two or more, you can choose a slider that rotates through them

We'll review your details and let you know once your event is live.

Thanks,
The DevEvent team`

/** A filled-in example of the JSON format that imports without using the AI. */
export const TEMPLATE_JSON_EXAMPLE = {
  events: [
    {
      title: "Lagos Rust Meetup",
      description: "A friendly evening of Rust talks for developers in Lagos.",
      overview: "Two short talks on async Rust, then open discussion and networking.",
      venue: "Co-Creation Hub",
      location: "Lagos, Nigeria",
      date: "2027-02-20",
      time: "17:00",
      endTime: "20:00",
      timezone: "Africa/Lagos",
      mode: "offline",
      audience: "Backend developers",
      organizer: "Rust Lagos community",
      agenda: ["17:00 | Doors open", "17:30 | Talks", "19:00 | Networking"],
      tags: ["Rust", "Backend"],
      images: ["rust-meetup-1.png", "rust-meetup-2.png"],
      imageDisplay: "slider",
    },
  ],
}
