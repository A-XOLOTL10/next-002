"use client";

import Image from "next/image";
import Link from "next/link";
import posthog from "posthog-js";
import EventImages from "@/components/EventImages";
import type { ImageDisplay } from "@/database/event.constants";
import { formatEventTime, formatShortDate } from "@/lib/utils";
import { useNow } from "@/lib/use-now";

interface Props {
    title: string;
    image: string;
    images?: string[];
    imageDisplay?: ImageDisplay;
    slug: string;
    location: string;
    date: string;
    time: string;
    timezone?: string;
    endsAt?: string;
    hideAt?: string;
    /** First row of cards: load the image straight away (it's the page's largest paint). */
    preload?: boolean;
}

const EventCard = ({ title, image, images, imageDisplay = "static", slug, location, date, time, timezone, endsAt, hideAt, preload = false }: Props) => {
    // Pages are cached, so "has it ended?" is worked out here, in the visitor's browser.
    const now = useNow();
    const passed = (moment?: string) => now > 0 && Boolean(moment) && new Date(moment as string).getTime() <= now;
    const ended = passed(endsAt);

    const handleEventSelection = () => {
        if (
            process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
            process.env.NEXT_PUBLIC_POSTHOG_HOST
        ) {
            posthog.logger.info("event_catalogue_item_selected", {
                event_slug: slug,
            });
            posthog.capture("event_selected", { event_slug: slug });
        }
    };

    // Past midnight after its last day, an event disappears even if the page is left open.
    if (passed(hideAt)) return null;

    return (
        <Link
            href={`/events/${slug}`}
            id="event-card"
            className={ended ? "is-ended" : undefined}
            title={ended ? "Ended" : undefined}
            onClick={handleEventSelection}
        >
            <div className="poster">
                <EventImages
                    images={images?.length ? images : [image]}
                    display={ended ? "static" : imageDisplay}
                    title={title}
                    sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
                    preload={preload}
                />
                {ended && <span className="ended-overlay">Ended</span>}
            </div>

            <div className="flex flex-row gap-2">
                <Image src="/icons/pin.svg" alt="location" width={14} height={14} className="size-3.5" />
                <p className="location">{location}</p>
            </div>
            <p className="title">{title}</p>

            <div className="datetime">
                <div>
                    <Image src="/icons/calendar.svg" alt="date" width={14} height={14} className="size-3.5" />
                    <p>{formatShortDate(date)}</p>
                </div>

                <div>
                    <Image src="/icons/clock.svg" alt="time" width={14} height={14} className="size-3.5" />
                    <p>{time}</p>
                </div>
            </div>

            {ended && endsAt && timezone && (
                <span className="ended-note">&#9888; This event ended at {formatEventTime(endsAt, timezone)}</span>
            )}
        </Link>
    );
};

export default EventCard;
