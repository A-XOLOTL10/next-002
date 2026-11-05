"use client"

import Image, { type ImageProps } from "next/image"
import { cloudinaryLoader, isCloudinaryUrl } from "@/lib/image-loader"

/**
 * next/image that asks Cloudinary directly for Cloudinary URLs (see lib/image-loader.ts).
 * A Client Component, because a loader is a function, and Server Components can't pass
 * functions to the browser; server pages use this instead of setting `loader` themselves.
 */
export default function CloudImage(props: ImageProps) {
  const src = typeof props.src === "string" ? props.src : ""
  return <Image {...props} loader={isCloudinaryUrl(src) ? cloudinaryLoader : undefined} alt={props.alt} />
}
