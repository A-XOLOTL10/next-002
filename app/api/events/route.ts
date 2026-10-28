import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import mongoose from "mongoose";
import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import connectDB from "@/lib/mongodb";
import Event from "@/database/event.model";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

// FormData has no array type: tags and agenda arrive as strings, either one JSON string
// ('["a","b"]') or the same key repeated, and are parsed into real arrays here.
function parseList(formData: FormData, key: string): string[] {
    const values = formData.getAll(key).filter((v): v is string => typeof v === "string");

    if (values.length === 1 && values[0].trim().startsWith("[")) {
        const parsed: unknown = JSON.parse(values[0]);
        if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === "string")) {
            throw new Error(`${key} must be a JSON array of strings`);
        }
        return parsed;
    }

    return values;
}

function uploadImage(file: File): Promise<UploadApiResponse> {
    return file.arrayBuffer().then((arrayBuffer) =>
        new Promise((resolve, reject) => {
            cloudinary.uploader.upload_stream({ resource_type: "image", folder: "DevEvent" }, (error, result) => {
                if (error || !result) return reject(error ?? new Error("Cloudinary returned no result"));
                resolve(result);
            }).end(Buffer.from(arrayBuffer));
        }),
    );
}

export async function POST(req: NextRequest) {
    let formData: FormData;
    try {
        formData = await req.formData();
    } catch {
        return NextResponse.json({ message: "Request body must be multipart/form-data" }, { status: 400 });
    }

    // Check the image before anything is uploaded or saved.
    const file = formData.get("image");
    if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ message: "Image file is required" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
        return NextResponse.json({ message: "Image must be an image file (e.g. PNG, JPEG, WebP)" }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ message: "Image must be 5 MB or smaller" }, { status: 400 });
    }

    // Text fields as strings; tags and agenda are parsed separately and spread in when creating.
    const event: Record<string, string> = {};
    let tags: string[];
    let agenda: string[];
    try {
        for (const [key, value] of formData.entries()) {
            if (typeof value === "string") event[key] = value;
        }
        tags = parseList(formData, "tags");
        agenda = parseList(formData, "agenda");
    } catch (e) {
        return NextResponse.json({ message: "Invalid form data", error: e instanceof Error ? e.message : "Unknown error" }, { status: 400 });
    }

    if (!process.env.CLOUDINARY_URL) {
        console.error("CLOUDINARY_URL is not set");
        return NextResponse.json({ message: "Image uploads are not configured on the server" }, { status: 500 });
    }

    let uploaded: UploadApiResponse | undefined;
    try {
        await connectDB();

        // Validate the other fields first so a bad request doesn't leave an unused image in Cloudinary.
        const draft = new Event({ ...event, tags, agenda });
        await draft.validate({ pathsToSkip: ["image"] });

        uploaded = await uploadImage(file);
        const createdEvent = await Event.create({ ...event, tags, agenda, image: uploaded.secure_url });

        // Similar-events lists are cached under "events"; refresh them to include the new event.
        revalidateTag("events", "max");

        return NextResponse.json({ message: "Event created successfully", event: createdEvent }, { status: 201 });
    } catch (e) {
        // Saving failed after upload (e.g. duplicate title): remove the orphaned image.
        if (uploaded) {
            await cloudinary.uploader.destroy(uploaded.public_id).catch((err: unknown) => console.error("Image cleanup failed:", err));
        }

        // Missing fields, bad date/time, invalid mode or duplicate title: the client's fault.
        if (e instanceof mongoose.Error.ValidationError) {
            const errors = Object.fromEntries(Object.entries(e.errors).map(([path, err]) => [path, err.message]));
            return NextResponse.json({ message: "Event validation failed", errors }, { status: 400 });
        }

        console.error(e);
        return NextResponse.json({ message: "Event Creation failed", error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
    }
}

export async function GET() {
    try {
        await connectDB();
        const events = await Event.find().sort({ createdAt: -1 });
        return NextResponse.json({ message: "Events fetched successfully", events }, { status: 200 });
    } catch (e) {
        console.error(e);
        return NextResponse.json({ message: "Failed to fetch events", error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
    }
}
